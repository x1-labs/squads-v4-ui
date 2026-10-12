/**
 * What earlier instructions in the same proposal do to the balances a vesting
 * guard checks. The program sees the state those instructions leave behind,
 * so a summary must too: a proposal that tops up the vault and then creates
 * grants is funded even though the vault is short right now.
 *
 * Only effects that can be read from instruction data are counted: native
 * transfers and earlier `create_grant`s on the same deployment. Anything else
 * that moves lamports (claims, cancels, CPIs) is ignored.
 */
import type { DecodedInstruction } from '../transaction/simpleDecoder';
import { toBigInt } from '../utils/anchorValues';

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/**
 * The decoder reformats IDL names (`create_grant` → `CreateGrant`), so compare
 * them the way the registry does: letters and digits only, lowercased.
 */
function isInstruction(ix: DecodedInstruction, programId: string, name: string): boolean {
  return (
    ix.programId === programId &&
    ix.instructionName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === name
  );
}

/**
 * Net lamports native transfers in `prior` move into `address` (negative when
 * more leaves than arrives). Null when a transfer touching it can't be read.
 */
export function netTransferTo(prior: DecodedInstruction[], address: string): bigint | null {
  let net = BigInt(0);
  for (const ix of prior) {
    if (!isInstruction(ix, SYSTEM_PROGRAM_ID, 'transfer')) continue;
    const from = ix.accounts[0]?.pubkey;
    const to = ix.accounts[1]?.pubkey;
    if (from !== address && to !== address) continue;
    const lamports = toBigInt(ix.args?.lamports);
    if (lamports === null) return null;
    if (to === address) net += lamports;
    if (from === address) net -= lamports;
  }
  return net;
}

export interface PriorGrants {
  /** How many earlier `create_grant`s there are (each pays a grant account's rent). */
  count: number;
  /** Principal plus yield they add to `total_outstanding`; null if any can't be read. */
  total: bigint | null;
}

/** Earlier `create_grant`s on the same deployment as `programId`. */
export function priorGrants(prior: DecodedInstruction[], programId: string): PriorGrants {
  let count = 0;
  let total: bigint | null = BigInt(0);
  for (const ix of prior) {
    if (!isInstruction(ix, programId, 'creategrant')) continue;
    count += 1;
    const principal = toBigInt(ix.args?.principal_total);
    const yieldTotal = toBigInt(ix.args?.yield_total);
    total =
      total !== null && principal !== null && yieldTotal !== null
        ? total + principal + yieldTotal
        : null;
  }
  return { count, total };
}
