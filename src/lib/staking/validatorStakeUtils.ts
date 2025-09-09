import {
  PublicKey,
  Connection,
  StakeProgram,
  LAMPORTS_PER_SOL,
  Authorized,
  Lockup,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY,
  Keypair,
} from '@solana/web3.js';

export interface StakeAccountInfo {
  address: string;
  balance: number;
  state: 'activating' | 'active' | 'deactivating' | 'inactive';
  delegatedValidator?: string;
  activationEpoch?: number;
  deactivationEpoch?: number;
  rentExemptReserve: number;
  activeStake?: number;
  inactiveStake?: number;
}

export interface ValidatorInfo {
  address: string;
  identity?: string;
  name?: string;
  commission?: number;
  activatedStake?: number;
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

        let state: StakeAccountInfo['state'] = 'inactive';
        const currentEpoch = (await connection.getEpochInfo()).epoch;

        // Check activation and deactivation epochs - they might be in delegation object
        const delegation = stake?.delegation;
        const activationEpoch = delegation?.activationEpoch
          ? Number(delegation.activationEpoch)
          : stake?.activationEpoch
            ? Number(stake.activationEpoch)
            : null;
        const deactivationEpoch = delegation?.deactivationEpoch
          ? Number(delegation.deactivationEpoch)
          : stake?.deactivationEpoch
            ? Number(stake.deactivationEpoch)
            : null;

        // MAX_EPOCH is used to indicate the stake is not deactivating
        const MAX_EPOCH = 18446744073709551615;

        if (deactivationEpoch && deactivationEpoch !== MAX_EPOCH) {
          // Stake is deactivating or deactivated
          if (deactivationEpoch <= currentEpoch) {
            state = 'inactive';
          } else {
            state = 'deactivating';
          }
        } else if (activationEpoch !== null) {
          // Stake is activating or active
          if (activationEpoch <= currentEpoch) {
            state = 'active';
          } else {
            state = 'activating';
          }
        }

        stakeAccounts.push({
          address: account.pubkey.toBase58(),
          balance: account.account.lamports / LAMPORTS_PER_SOL,
          state,
          delegatedValidator: stake.delegation?.voter,
          activationEpoch: stake.activationEpoch,
          deactivationEpoch: stake.deactivationEpoch,
          rentExemptReserve: meta.rentExemptReserve / LAMPORTS_PER_SOL,
          activeStake: stake.delegation?.stake
            ? stake.delegation.stake / LAMPORTS_PER_SOL
            : undefined,
        });
      } else if (parsedData.parsed?.type === 'initialized') {
        const info = parsedData.parsed.info;
        const meta = info.meta;

        stakeAccounts.push({
          address: account.pubkey.toBase58(),
          balance: account.account.lamports / LAMPORTS_PER_SOL,
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
