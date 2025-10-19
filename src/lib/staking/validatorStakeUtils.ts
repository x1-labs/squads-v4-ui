import {
  PublicKey,
  Connection,
  StakeProgram,
  LAMPORTS_PER_SOL,
  Authorized,
  Lockup,
  TransactionInstruction,
} from '@solana/web3.js';
import { getStakeActivation } from '@anza-xyz/solana-rpc-get-stake-activation';

export interface StakeAccountInfo {
  address: string;
  balance: number;
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
    const accounts = await connection.getParsedProgramAccounts(StakeProgram.programId, {
      filters: [
        {
          memcmp: {
            offset: 12,
            bytes: vaultAddress.toBase58(),
          },
        },
      ],
    });

    const stakeAccounts: StakeAccountInfo[] = [];

    for (const account of accounts) {
      const parsedData = account.account.data as any;

      if (parsedData.parsed?.type === 'delegated') {
        const info = parsedData.parsed.info;
        const stake = info.stake;
        const meta = info.meta;

        const stakeActivation = await getStakeActivation(connection as any, account.pubkey);
        console.log('Stake Activation for', account.pubkey.toBase58(), ':', stakeActivation);

        // Handle edge case where activationEpoch is max u64 value
        // This indicates the stake is actually active from epoch 0
        if (stake?.delegation?.activationEpoch === "18446744073709551615") {
          stake.delegation.activationEpoch = "0";
          stakeActivation.status = 'active';
          stakeActivation.active = BigInt(stake.delegation.stake);
          stakeActivation.inactive = BigInt(account.account.lamports) - stakeActivation.active;
        }

        let state = 'inactive';
        if (stakeActivation.status === 'active') state = 'active';
        else if (stakeActivation.status === 'activating') state = 'activating';
        else if (stakeActivation.status === 'deactivating') state = 'deactivating';

        stakeAccounts.push({
          address: account.pubkey.toBase58(),
          balance: account.account.lamports / LAMPORTS_PER_SOL,
          delegated: stake.delegation.stake / LAMPORTS_PER_SOL,
          state: state as 'activating' | 'active' | 'deactivating' | 'inactive',
          delegatedValidator: stake.delegation?.voter,
          activationEpoch: stake.activationEpoch,
          deactivationEpoch: stake.deactivationEpoch,
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
  lamports: number
): TransactionInstruction {
  return StakeProgram.withdraw({
    stakePubkey: stakeAccount,
    authorizedPubkey: vaultAddress,
    toPubkey: vaultAddress,
    lamports,
  }).instructions[0];
}

export async function createSplitStakeInstructions(
  sourceStakeAccount: PublicKey,
  vaultAddress: PublicKey,
  lamports: number,
  seed: string,
  connection: Connection
): Promise<{ instructions: TransactionInstruction[]; newStakeAccount: PublicKey }> {
  // Calculate the new stake account address using the seed
  const newStakeAccount = await PublicKey.createWithSeed(vaultAddress, seed, StakeProgram.programId);

  // Get rent exempt reserve for the split transaction (optional parameter)
  const rentExemptReserve = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);

  // Create split with seed instruction - this handles both account creation and splitting
  const splitTransaction = StakeProgram.splitWithSeed({
    stakePubkey: sourceStakeAccount,
    authorizedPubkey: vaultAddress,
    splitStakePubkey: newStakeAccount,
    basePubkey: vaultAddress,
    seed,
    lamports,
  }, rentExemptReserve);

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

    if (bothActiveOrActivating && destinationAccount.delegatedValidator !== sourceAccount.delegatedValidator) {
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
