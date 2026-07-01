import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

export type VaultSimulationResult =
  | { ok: true; unitsConsumed?: number }
  | { ok: false; error: string; logs?: string[] };

/**
 * Simulate a set of instructions AS IF executed by the vault PDA, against live
 * chain state, BEFORE wrapping them in a multisig proposal.
 *
 * This surfaces on-chain failures (e.g. a stake account that isn't fully cooled
 * down yet, or a full-balance close whose amount drifted) up front — instead of
 * as an atomic VaultTransaction revert AFTER the multisig members have already
 * spent their signatures approving it.
 *
 * The vault PDA can't produce a real signature, so we simulate with
 * `sigVerify: false` and make the vault the fee payer (hence a signer). The
 * runtime honours the `is_signer` flag without verifying the signature, so the
 * stake program's withdraw-authority check passes and the real balance / stake
 * math runs. Executing the inner instructions directly with the vault as
 * authority is equivalent, for these checks, to the Squads `invoke_signed` CPI.
 */
export async function simulateVaultInstructions(
  connection: Connection,
  vaultAddress: PublicKey,
  instructions: TransactionInstruction[]
): Promise<VaultSimulationResult> {
  try {
    const { blockhash } = await connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: vaultAddress,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);

    const { value } = await connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'confirmed',
    });

    if (value.err) {
      return {
        ok: false,
        error: typeof value.err === 'string' ? value.err : JSON.stringify(value.err),
        logs: value.logs ?? undefined,
      };
    }
    return { ok: true, unitsConsumed: value.unitsConsumed };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Turn a failed vault simulation into an actionable, user-facing message.
 * `InsufficientFunds` here almost always means a stake account isn't fully
 * cooled down (still has effective stake) — the one case where withdraw/close
 * reverts once the account is otherwise inactive.
 */
export function describeVaultSimulationError(result: {
  error: string;
  logs?: string[];
}): string {
  const haystack = `${result.error} ${(result.logs || []).join(' ')}`.toLowerCase();
  if (haystack.includes('insufficient')) {
    return 'Simulation failed: a stake account is not fully cooled down yet (still has active stake), so it cannot be withdrawn or closed. Wait until it is fully inactive (about one more epoch) and try again.';
  }
  return `Simulation failed before signing: ${result.error}. Nothing was submitted.`;
}
