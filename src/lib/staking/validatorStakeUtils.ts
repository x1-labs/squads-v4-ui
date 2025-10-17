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

        let state = 'inactive';
        if (stakeActivation.status === 'activating') state = 'activating';
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

export async function getMinimumStakeAmount(connection: Connection): Promise<number> {
  const minBalance = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
  return (minBalance + LAMPORTS_PER_SOL) / LAMPORTS_PER_SOL;
}
