import {
  PublicKey,
  Connection,
  StakeProgram,
  VoteProgram,
  LAMPORTS_PER_SOL,
  Authorized,
  Lockup,
  TransactionInstruction,
} from '@solana/web3.js';
import { getStakeActivation } from '@anza-xyz/solana-rpc-get-stake-activation';

/**
 * Validates that an address is a vote account (owned by the Vote program).
 * Returns an error message if invalid, or null if valid.
 */
export async function validateVoteAccount(
  connection: Connection,
  address: PublicKey
): Promise<string | null> {
  try {
    const accountInfo = await connection.getAccountInfo(address);

    if (!accountInfo) {
      return 'Account not found. Please check the address.';
    }

    if (!accountInfo.owner.equals(VoteProgram.programId)) {
      return "This is not a vote account. Please use the validator's vote account address, not their identity address.";
    }

    return null; // Valid vote account
  } catch (error) {
    return 'Failed to validate vote account. Please check the address.';
  }
}

export interface StakeAccountInfo {
  address: string;
  balance: number;
  balanceLamports: number; // Store original lamports to avoid floating point errors
  delegated: number;
  state: 'activating' | 'active' | 'deactivating' | 'inactive';
  delegatedValidator?: string;
  activationEpoch?: number;
  deactivationEpoch?: number;
  rentExemptReserve: number;
  activeStake?: number;
  inactiveStake?: number;
}

export async function getStakeAccountsForVault(
  connection: Connection,
  vaultAddress: PublicKey
): Promise<StakeAccountInfo[]> {
  try {
    const accounts = (await connection.getParsedProgramAccounts(StakeProgram.programId, {
      filters: [
        {
          memcmp: {
            offset: 12,
            bytes: vaultAddress.toBase58(),
          },
        },
      ],
      // Disable JSON parsing to get raw response with string lamports
    })) as any;

    // Needed to correctly classify genesis stakes at their deactivation-epoch boundary
    // (see the genesis handling below).
    const { epoch: currentEpoch } = await connection.getEpochInfo();

    const stakeAccounts: StakeAccountInfo[] = [];

    for (const account of accounts) {
      const parsedData = account.account.data as any;

      if (parsedData.parsed?.type === 'delegated') {
        const info = parsedData.parsed.info;
        const stake = info.stake;
        const meta = info.meta;

        const stakeActivation = await getStakeActivation(connection as any, account.pubkey);

        // Genesis/bootstrap stakes report activationEpoch = u64::MAX, which breaks
        // getStakeActivation's activation math and makes it report them as `inactive`
        // regardless of their real state. We correct that here.
        const isGenesisStake = stake?.delegation?.activationEpoch === '18446744073709551615';
        const deactivationEpochStr = stake?.delegation?.deactivationEpoch;
        if (isGenesisStake && deactivationEpochStr === '18446744073709551615') {
          // Not deactivated: a genesis stake is active from epoch 0.
          // (Forcing 'active' only when NOT deactivated avoids re-deactivating an
          // already-unstaked genesis stake, which fails with AlreadyDeactivated 0x2.)
          stake.delegation.activationEpoch = '0';
          stakeActivation.status = 'active';
          stakeActivation.active = BigInt(stake.delegation.stake);
          stakeActivation.inactive = BigInt(account.account.lamports) - stakeActivation.active;
        } else if (
          isGenesisStake &&
          deactivationEpochStr &&
          currentEpoch <= Number(deactivationEpochStr)
        ) {
          // Deactivated, but we're still AT (or before) the deactivation epoch: the full
          // stake is still effective and only cools to 0 at deactivationEpoch + 1, so it
          // is DEACTIVATING, not inactive. getStakeActivation mis-reports it as inactive
          // (activationEpoch = u64::MAX), so correct it — otherwise the UI offers a
          // withdraw/close that the chain would reject (short by the whole stake). Once
          // currentEpoch > deactivationEpoch the stake has cooled and getStakeActivation's
          // 'inactive' is correct, so we leave it alone.
          stakeActivation.status = 'deactivating';
          stakeActivation.active = BigInt(stake.delegation.stake);
          stakeActivation.inactive = BigInt(0);
        }

        let state = 'inactive';
        if (stakeActivation.status === 'active') state = 'active';
        else if (stakeActivation.status === 'activating') state = 'activating';
        else if (stakeActivation.status === 'deactivating') state = 'deactivating';

        stakeAccounts.push({
          address: account.pubkey.toBase58(),
          balance: account.account.lamports / LAMPORTS_PER_SOL,
          balanceLamports: account.account.lamports,
          delegated: stake.delegation.stake / LAMPORTS_PER_SOL,
          state: state as 'activating' | 'active' | 'deactivating' | 'inactive',
          delegatedValidator: stake.delegation?.voter,
          // Epochs live on `stake.delegation`, not `stake` — and are u64 strings
          // (u64::MAX = "not deactivated"). Parse to numbers so callers can reason
          // about the deactivation cooldown.
          activationEpoch: parseEpoch(stake.delegation?.activationEpoch),
          deactivationEpoch: parseEpoch(stake.delegation?.deactivationEpoch),
          rentExemptReserve: meta.rentExemptReserve / LAMPORTS_PER_SOL,
          activeStake: Number(stakeActivation.active / BigInt(LAMPORTS_PER_SOL)),
          inactiveStake: Number(stakeActivation.inactive / BigInt(LAMPORTS_PER_SOL)),
        });
      } else if (parsedData.parsed?.type === 'initialized') {
        const info = parsedData.parsed.info;
        const meta = info.meta;
        const stake = info?.stake;

        const delegated = stake?.delegation?.stake ? stake.delegation.stake / LAMPORTS_PER_SOL : 0;

        stakeAccounts.push({
          address: account.pubkey.toBase58(),
          balance: account.account.lamports / LAMPORTS_PER_SOL,
          balanceLamports: account.account.lamports,
          delegated: delegated,
          state: 'inactive',
          rentExemptReserve: meta.rentExemptReserve / LAMPORTS_PER_SOL,
        });
      }
    }

    return stakeAccounts;
  } catch (error) {
    console.error('Error fetching stake accounts:', error);
    return [];
  }
}

export async function createStakeAccountWithSeedInstructions(
  vaultAddress: PublicKey,
  seed: string,
  lamports: number
): Promise<{ instructions: TransactionInstruction[]; stakeAccount: PublicKey }> {
  // Create stake account with seed - this allows the vault to create the account without needing another signature
  const stakeAccount = await PublicKey.createWithSeed(vaultAddress, seed, StakeProgram.programId);

  const authorized = new Authorized(vaultAddress, vaultAddress);
  const lockup = new Lockup(0, 0, vaultAddress);

  const instructions = StakeProgram.createAccountWithSeed({
    fromPubkey: vaultAddress,
    stakePubkey: stakeAccount,
    basePubkey: vaultAddress,
    seed,
    authorized,
    lockup,
    lamports,
  }).instructions;

  return { instructions, stakeAccount };
}

export function createDelegateStakeInstruction(
  stakeAccount: PublicKey,
  vaultAddress: PublicKey,
  validatorVoteAccount: PublicKey
): TransactionInstruction {
  return StakeProgram.delegate({
    stakePubkey: stakeAccount,
    authorizedPubkey: vaultAddress,
    votePubkey: validatorVoteAccount,
  }).instructions[0];
}

export function createDeactivateStakeInstruction(
  stakeAccount: PublicKey,
  vaultAddress: PublicKey
): TransactionInstruction {
  return StakeProgram.deactivate({
    stakePubkey: stakeAccount,
    authorizedPubkey: vaultAddress,
  }).instructions[0];
}

export function createWithdrawStakeInstruction(
  stakeAccount: PublicKey,
  vaultAddress: PublicKey,
  lamports: number | bigint
): TransactionInstruction {
  // If lamports is provided as bigint, we need to manually construct the instruction
  // to preserve precision for very large values (>Number.MAX_SAFE_INTEGER)
  if (typeof lamports === 'bigint') {
    // Manually construct the withdraw instruction with proper u64 serialization
    const type = 4; // Withdraw instruction discriminator
    const data = Buffer.alloc(12);
    data.writeUInt32LE(type, 0);
    // Write lamports as u64 (little-endian)
    data.writeBigUInt64LE(lamports, 4);

    const keys = [
      { pubkey: stakeAccount, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: true },
      {
        pubkey: new PublicKey('SysvarC1ock11111111111111111111111111111111'),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey('SysvarStakeHistory1111111111111111111111111'),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: vaultAddress, isSigner: true, isWritable: false },
    ];

    return new TransactionInstruction({
      keys,
      programId: StakeProgram.programId,
      data,
    });
  }

  // For regular numbers, use the standard StakeProgram helper
  return StakeProgram.withdraw({
    stakePubkey: stakeAccount,
    authorizedPubkey: vaultAddress,
    toPubkey: vaultAddress,
    lamports,
  }).instructions[0];
}

/** u64::MAX — the "not set" sentinel the stake program uses for activation/deactivation epochs. */
const U64_MAX_STR = '18446744073709551615';

/** Parse a u64 epoch string into a number, treating the u64::MAX sentinel as "unset". */
function parseEpoch(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value);
  if (s === U64_MAX_STR) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Whether a stake account can be fully closed (withdraw the entire balance and
 * deallocate) right now.
 *
 * The on-chain stake program permits a full-balance close iff the account's
 * *effective* stake is exactly 0 — i.e. it is fully cooled down. The withdraw
 * check is `lamports + effective_stake + rent_reserve > balance`, so while any
 * effective stake remains BOTH a full close AND a `balance - reserve` drain fail
 * identically. Our `state === 'inactive'` verdict is exactly `effective_stake == 0`
 * (from `getStakeActivation` / the client-side activation calc), so it is the
 * correct gate. The residual epoch-boundary race (RPC reporting `inactive` an
 * epoch early) is caught by the pre-proposal simulation, which runs the real
 * withdraw against live chain state before anyone signs.
 */
export function isStakeCloseable(account: StakeAccountInfo): boolean {
  return account.state === 'inactive';
}

/**
 * Lamports to withdraw to CLOSE an inactive stake account — the full balance,
 * which deallocates the account and reclaims the rent-exempt reserve into the
 * vault in a single instruction (no rent left stranded, no second proposal).
 *
 * Uses exact integer lamports (never `float * 1e9`), because the close path is
 * gated on `lamports == balance` exactly: an amount even one lamport short is
 * treated as a partial withdrawal and reverts with `InsufficientFunds` for
 * leaving less than the rent reserve. An inactive account's balance is stable
 * (it earns no rewards), so this exact value stays valid through the
 * sign→execute delay.
 *
 * Precondition: `isStakeCloseable(account)` (fully inactive / effective stake 0).
 */
export function getCloseWithdrawLamports(account: StakeAccountInfo): bigint {
  return BigInt(account.balanceLamports);
}

export async function createSplitStakeInstructions(
  sourceStakeAccount: PublicKey,
  vaultAddress: PublicKey,
  lamports: number,
  seed: string,
  connection: Connection
): Promise<{ instructions: TransactionInstruction[]; newStakeAccount: PublicKey }> {
  // Calculate the new stake account address using the seed
  const newStakeAccount = await PublicKey.createWithSeed(
    vaultAddress,
    seed,
    StakeProgram.programId
  );

  // Get rent exempt reserve for the split transaction (optional parameter)
  const rentExemptReserve = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);

  // Create split with seed instruction - this handles both account creation and splitting
  const splitTransaction = StakeProgram.splitWithSeed(
    {
      stakePubkey: sourceStakeAccount,
      authorizedPubkey: vaultAddress,
      splitStakePubkey: newStakeAccount,
      basePubkey: vaultAddress,
      seed,
      lamports,
    },
    rentExemptReserve
  );

  return {
    instructions: splitTransaction.instructions,
    newStakeAccount,
  };
}

export function createMergeStakeInstruction(
  destinationStakeAccount: PublicKey,
  sourceStakeAccount: PublicKey,
  vaultAddress: PublicKey
): TransactionInstruction {
  const mergeTransaction = StakeProgram.merge({
    stakePubkey: destinationStakeAccount,
    sourceStakePubKey: sourceStakeAccount,
    authorizedPubkey: vaultAddress,
  });
  return mergeTransaction.instructions[0];
}

export function getCompatibleMergeAccounts(
  destinationAccount: StakeAccountInfo,
  allAccounts: StakeAccountInfo[]
): StakeAccountInfo[] {
  return allAccounts.filter((sourceAccount) => {
    // Can't merge with itself
    if (sourceAccount.address === destinationAccount.address) {
      return false;
    }

    // Must have same validator if both are active/activating
    const bothActiveOrActivating =
      (destinationAccount.state === 'active' || destinationAccount.state === 'activating') &&
      (sourceAccount.state === 'active' || sourceAccount.state === 'activating');

    if (
      bothActiveOrActivating &&
      destinationAccount.delegatedValidator !== sourceAccount.delegatedValidator
    ) {
      return false;
    }

    // Valid merge combinations based on Solana rules:
    const destState = destinationAccount.state;
    const srcState = sourceAccount.state;

    // Two deactivated stakes
    if (destState === 'inactive' && srcState === 'inactive') {
      return true;
    }

    // Inactive stake into activating stake
    if (destState === 'activating' && srcState === 'inactive') {
      return true;
    }

    // Two activated stakes (same validator already checked above)
    if (destState === 'active' && srcState === 'active') {
      return true;
    }

    // Two activating accounts with same activation epoch and same validator
    if (destState === 'activating' && srcState === 'activating') {
      return destinationAccount.activationEpoch === sourceAccount.activationEpoch;
    }

    return false;
  });
}

export async function getMinimumStakeAmount(connection: Connection): Promise<number> {
  const minBalance = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
  return (minBalance + LAMPORTS_PER_SOL) / LAMPORTS_PER_SOL;
}
