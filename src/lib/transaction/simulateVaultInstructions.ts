import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

export type VaultSimulationResult =
  // Simulation ran and the instructions succeeded.
  | { ok: true; unitsConsumed?: number }
  // Simulation ran and the instructions REVERTED on-chain — this is a real problem
  // that would also revert the proposal; the caller should block.
  | { ok: false; simulated: true; error: string; logs?: string[] }
  // Simulation could not be run at all (network/RPC error, unsupported options).
  // The caller should NOT hard-block on this — degrade gracefully.
  | { ok: false; simulated: false; error: string };

/**
 * Simulate a set of the vault's inner instructions against live chain state,
 * BEFORE wrapping them in a multisig proposal.
 *
 * This surfaces on-chain failures (e.g. a stake account that isn't fully cooled
 * down yet, or a full-balance close whose amount drifted) up front — instead of
 * as an atomic VaultTransaction revert AFTER the multisig members have already
 * spent their signatures approving it.
 *
 * Fee payer is the connected member's wallet — NOT the vault PDA. The vault is
 * already marked as a signer inside the instructions (the stake withdraw
 * authority), and with `sigVerify: false` the runtime honours that `is_signer`
 * flag without a real signature, so the authority check still passes. Using the
 * (funded) member as fee payer mirrors real execution — where the executing
 * member pays the fee and the inner instructions run as the vault via Squads'
 * `invoke_signed` — and avoids falsely failing when the vault holds little or no
 * native SOL (common when it has staked its whole balance).
 *
 * The result distinguishes a genuine simulated revert (`simulated: true` → the
 * caller should block) from an inability to simulate (`simulated: false` → the
 * caller should warn but proceed, so a transient RPC hiccup can't hard-block a
 * withdrawal that would otherwise succeed).
 */
export async function simulateVaultInstructions(
  connection: Connection,
  feePayer: PublicKey,
  instructions: TransactionInstruction[]
): Promise<VaultSimulationResult> {
  try {
    const { blockhash } = await connection.getLatestBlockhash();
    const message = new TransactionMessage({
      payerKey: feePayer,
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
        simulated: true,
        error: typeof value.err === 'string' ? value.err : JSON.stringify(value.err),
        logs: value.logs ?? undefined,
      };
    }
    return { ok: true, unitsConsumed: value.unitsConsumed };
  } catch (e: any) {
    // Could not run the simulation (network/RPC error). Don't treat this as a
    // definitive failure — the caller decides whether to proceed.
    return { ok: false, simulated: false, error: e?.message || String(e) };
  }
}

/**
 * Turn a genuine simulated revert into an actionable, user-facing message.
 * Only call this for `simulated: true` results.
 *
 * A fee-payer shortfall (the connected member's wallet can't cover the fee)
 * also contains "insufficient" but is unrelated to the stake, so it is matched
 * FIRST — otherwise it would be mislabeled as a cooldown problem.
 *
 * An `InsufficientFunds` from the stake withdraw itself has two causes, and we
 * can't always tell them apart from the logs, so the message names both instead
 * of asserting cooldown (waiting an epoch does nothing for the second case):
 *   1. the stake isn't fully cooled down yet (still has effective stake), or
 *   2. the amount is just under the full balance, so the withdraw would leave
 *      the account below its rent-exempt reserve.
 */
export function describeVaultSimulationError(result: {
  error: string;
  logs?: string[];
}): string {
  const haystack = `${result.error} ${(result.logs || []).join(' ')}`.toLowerCase();
  // Fee-payer funding shortfall (a top-level TransactionError, not the stake
  // instruction). `InsufficientFundsForFee` contains "insufficient", so it must be
  // checked before the stake-specific branch below.
  if (haystack.includes('insufficientfundsforfee') || haystack.includes('funds for fee')) {
    return 'Simulation failed: the connected wallet does not have enough SOL to cover the transaction fee. Fund the wallet and try again.';
  }
  if (haystack.includes('insufficient')) {
    return 'Simulation failed: the stake withdrawal would leave the account below its rent-exempt reserve. Either the stake is not fully cooled down yet (wait until it is fully inactive, about one more epoch), or the amount is just under the full balance — withdraw the full balance to close the account, or a smaller amount to leave the reserve intact.';
  }
  return `Simulation failed before signing: ${result.error}. Nothing was submitted.`;
}
