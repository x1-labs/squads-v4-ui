import { Connection, PublicKey } from '@solana/web3.js';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';
import {
  ClusterInfoAccount,
  DelegationConfigAccount,
  ValidatorInfoAccount,
  fetchClusterInfo,
  fetchDelegationConfig,
  fetchValidatorInfo,
} from '@/lib/delegation/accounts';
import { accountByName } from './shared';
import { useProgramAccount } from '../useProgramAccount';

/** Current on-chain `DelegationConfig` for the deployment an instruction targets. */
export function useDelegationConfig(
  instruction: DecodedInstruction,
  connection: Connection
): { config: DelegationConfigAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(`config:${instruction.programId}`, () =>
    fetchDelegationConfig(connection, instruction.programId)
  );
  return { config: data, loading };
}

/** Current on-chain `ClusterInfo` for the deployment an instruction targets. */
export function useDelegationClusterInfo(
  instruction: DecodedInstruction,
  connection: Connection
): { clusterInfo: ClusterInfoAccount | null; loading: boolean } {
  const { data, loading } = useProgramAccount(`cluster:${instruction.programId}`, () =>
    fetchClusterInfo(connection, instruction.programId)
  );
  return { clusterInfo: data, loading };
}

export interface DelegationValidatorTarget {
  /** PDA holding the program's record for this validator. */
  validatorPda?: string;
  /** Vote account the instruction acts on, once it can be determined. */
  voteAccount?: string;
  /** Current on-chain record, when it exists and could be decoded. */
  info: ValidatorInfoAccount | null;
  loading: boolean;
}

function readPubkeyArg(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === 'string') return value;
  try {
    return new PublicKey(value as any).toBase58();
  } catch {
    return undefined;
  }
}

/**
 * Resolve which validator a delegation instruction targets.
 *
 * Most validator instructions take no arguments — the vote account is only
 * implied by the `validator` PDA — so the current `ValidatorInfo` is fetched to
 * name the validator and to show its state before the change.
 */
export function useDelegationValidator(
  instruction: DecodedInstruction,
  connection: Connection
): DelegationValidatorTarget {
  const validatorPda = accountByName(instruction, 'validator', 0);
  const { data: info, loading } = useProgramAccount(
    validatorPda && `validator:${validatorPda}`,
    () => fetchValidatorInfo(connection, validatorPda!)
  );

  const voteFromArgs = readPubkeyArg(instruction.args?.vote_account);
  const voteFromAccounts = accountByName(instruction, 'vote');

  return {
    validatorPda,
    voteAccount: voteFromArgs || voteFromAccounts || info?.vote_account?.toBase58(),
    info,
    loading,
  };
}
