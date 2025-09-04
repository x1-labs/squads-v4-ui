import { PublicKey, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const STAKE_POOL_PROGRAM_ID = new PublicKey('XPoo1Fx6KNgeAzFcq2dPTo95bWGUSj5KdPVqYj9CZux');

export interface StakePoolInfo {
  address: string;
  name: string;
  poolMint: string;
  reserveStake: string;
  apy: number;
  totalStaked?: number;
  userBalance?: number;
}

// Known testnet stake pools - these would be fetched from an API in production
export const TESTNET_STAKE_POOLS: StakePoolInfo[] = [
  {
    address: '8A3GnoFcsn4zFAu3psZtJ5pqneBSNWiyGkCAXfFdaMJv',
    name: 'Testnet Pool 1',
    poolMint: 'DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941',
    reserveStake: '5kcJWVKczFxjBvqUxQRxC9SURFJJJRxgTJQqCU8v2Xvv',
    apy: 6.5,
  },
  // Add more pools as needed
];

export async function findWithdrawAuthority(
  stakePoolAddress: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [stakePoolAddress.toBuffer(), Buffer.from('withdraw_authority')],
    STAKE_POOL_PROGRAM_ID
  );
}

export async function findDepositAuthority(
  stakePoolAddress: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [stakePoolAddress.toBuffer(), Buffer.from('deposit_authority')],
    STAKE_POOL_PROGRAM_ID
  );
}

export async function getPoolTokenAccount(
  walletAddress: PublicKey,
  poolMint: PublicKey
): Promise<PublicKey> {
  return getAssociatedTokenAddress(poolMint, walletAddress, true, TOKEN_PROGRAM_ID);
}

export async function fetchStakePoolAccount(
  connection: Connection,
  stakePoolAddress: PublicKey
): Promise<any> {
  try {
    const accountInfo = await connection.getAccountInfo(stakePoolAddress);
    if (!accountInfo) {
      throw new Error('Stake pool account not found');
    }
    // In production, you would deserialize this using the IDL
    // For now, returning raw data
    return accountInfo;
  } catch (error) {
    console.error('Error fetching stake pool account:', error);
    throw error;
  }
}

export async function getStakePoolsForDisplay(
  connection: Connection,
  vaultAddress?: PublicKey
): Promise<StakePoolInfo[]> {
  const pools = [...TESTNET_STAKE_POOLS];

  // If vault address provided, fetch user balances
  if (vaultAddress) {
    for (const pool of pools) {
      try {
        const poolMint = new PublicKey(pool.poolMint);
        const poolTokenAccount = await getPoolTokenAccount(vaultAddress, poolMint);
        const tokenAccountInfo = await connection.getTokenAccountBalance(poolTokenAccount);

        if (tokenAccountInfo && tokenAccountInfo.value) {
          pool.userBalance = tokenAccountInfo.value.uiAmount || 0;
        }
      } catch (error) {
        // Account doesn't exist yet, balance is 0
        pool.userBalance = 0;
      }
    }
  }

  return pools;
}

export function calculatePoolTokensReceived(
  solAmount: number,
  poolRate: number = 1.0,
  depositFee: number = 0.0025 // 0.25% default fee
): number {
  const afterFee = solAmount * (1 - depositFee);
  return afterFee / poolRate;
}

export function calculateSolReceived(
  poolTokenAmount: number,
  poolRate: number = 1.0,
  withdrawalFee: number = 0.001 // 0.1% default fee
): number {
  const solValue = poolTokenAmount * poolRate;
  return solValue * (1 - withdrawalFee);
}
