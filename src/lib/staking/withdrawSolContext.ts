import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { getStakePoolAccount } from '@x1-labs/spl-stake-pool';
import {
  maxPoolTokensForLamports,
  maxReserveWithdrawLamports,
  type WithdrawSolPoolState,
} from './withdrawSolMath';

export interface WithdrawSolContext {
  pool: WithdrawSolPoolState;
  poolMint: PublicKey;
  reserveStake: PublicKey;
  managerFeeAccount: PublicKey;
  tokenProgramId: PublicKey;
  solWithdrawAuthority: PublicKey | null;
  /** The vault's associated pool-token account. */
  sourcePoolAccount: PublicKey;
  balance: bigint;
  decimals: number;
  /** Burning from the pool's own manager fee account skips the withdrawal fee. */
  feeWaived: boolean;
  /** Lamports the reserve can pay out right now. */
  reserveMaxLamports: bigint;
  /** Most pool tokens the vault can unstake right now: its balance, capped by the reserve. */
  maxPoolTokens: bigint;
}

const toBigInt = (value: { toString(): string }) => BigInt(value.toString());

/** Live pool, reserve and vault state for a WithdrawSol from `vault`. */
export async function fetchWithdrawSolContext(
  connection: Connection,
  stakePoolAddress: PublicKey,
  vault: PublicKey
): Promise<WithdrawSolContext> {
  const stakePool = (await getStakePoolAccount(connection as any, stakePoolAddress)).account.data;
  // Same derivation as getPoolTokenAccount, which the staked balance is read from.
  const sourcePoolAccount = await getAssociatedTokenAddress(
    stakePool.poolMint,
    vault,
    true,
    stakePool.tokenProgramId
  );

  const [reserveInfo, mintInfo, tokenBalance] = await Promise.all([
    connection.getParsedAccountInfo(stakePool.reserveStake),
    connection.getParsedAccountInfo(stakePool.poolMint),
    // A vault that never held this pool's token has no account yet: balance 0.
    connection.getTokenAccountBalance(sourcePoolAccount).catch(() => null),
  ]);

  const reserveData = reserveInfo.value?.data;
  const rentExemptReserve =
    reserveData && 'parsed' in reserveData
      ? reserveData.parsed?.info?.meta?.rentExemptReserve
      : null;
  const mintData = mintInfo.value?.data;
  const mintDecimals = mintData && 'parsed' in mintData ? mintData.parsed?.info?.decimals : null;
  if (!reserveInfo.value || rentExemptReserve == null || mintDecimals == null) {
    throw new Error('Could not read the stake pool reserve or pool mint');
  }

  const pool: WithdrawSolPoolState = {
    totalLamports: toBigInt(stakePool.totalLamports),
    poolTokenSupply: toBigInt(stakePool.poolTokenSupply),
    solWithdrawalFee: {
      numerator: toBigInt(stakePool.solWithdrawalFee.numerator),
      denominator: toBigInt(stakePool.solWithdrawalFee.denominator),
    },
  };
  const balance = tokenBalance ? BigInt(tokenBalance.value.amount) : 0n;
  const feeWaived = stakePool.managerFeeAccount.equals(sourcePoolAccount);
  const reserveMaxLamports = maxReserveWithdrawLamports(
    BigInt(reserveInfo.value.lamports),
    BigInt(rentExemptReserve)
  );
  const reserveMaxTokens = maxPoolTokensForLamports(pool, reserveMaxLamports, feeWaived);

  return {
    pool,
    poolMint: stakePool.poolMint,
    reserveStake: stakePool.reserveStake,
    managerFeeAccount: stakePool.managerFeeAccount,
    tokenProgramId: stakePool.tokenProgramId,
    solWithdrawAuthority: stakePool.solWithdrawAuthority ?? null,
    sourcePoolAccount,
    balance,
    decimals: tokenBalance?.value.decimals ?? mintDecimals,
    feeWaived,
    reserveMaxLamports,
    maxPoolTokens: balance < reserveMaxTokens ? balance : reserveMaxTokens,
  };
}
