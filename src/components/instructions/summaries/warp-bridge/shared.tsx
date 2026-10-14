import React from 'react';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { Field } from '../shared';

import { PreflightBlock } from '../vesting/shared';
import type { PreflightResult } from '@/lib/warpBridge/preflight';

export * from '../shared';
export { preflightHeadline } from '../vesting/shared';

/**
 * Preflight findings for a bridge summary. Bridge summaries apply the state
 * changes of earlier bridge instructions in the proposal (pauses, recovery
 * mode, roles, admin, chain ID) before checking.
 */
export const BridgePreflightBlock: React.FC<{ preflight: PreflightResult; loading: boolean }> = ({
  preflight,
  loading,
}) => (
  <PreflightBlock
    preflight={preflight}
    loading={loading}
    note="Checked against the current on-chain state, after applying these earlier bridge instructions in this proposal: bridge and token pauses, recovery policy and mode, manual review, roles, admin transfer and chain ID. Other instructions (for example guardian rotations or token deregistration) are not simulated."
  />
);

/**
 * Identifies the token a bridge instruction acts on: its registry symbol, the
 * local mint, and whether this chain custodies the native token or a wrapped
 * one — which decides whether bridging locks/releases or mints/burns.
 */
export const BridgeTokenTarget: React.FC<{
  localMint?: string;
  symbol?: string | null;
  decimals?: number | null;
  isNative?: boolean | null;
}> = ({ localMint, symbol, decimals, isNative }) => (
  <>
    {(symbol || decimals !== null) && (
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{symbol ?? 'Token'}</span>
        {decimals !== null && decimals !== undefined && (
          <span className="text-xs text-muted-foreground">{decimals} decimals</span>
        )}
      </div>
    )}
    {localMint && <AddressWithButtons address={localMint} label="Mint" />}
    {isNative !== null && isNative !== undefined && (
      <Field
        label="Custody"
        value={isNative ? 'Native — locked in vault' : 'Wrapped — minted and burned'}
        hint={
          isNative
            ? 'This chain holds the real token; bridging locks it here and releases it on return'
            : 'This chain holds a wrapped representation; bridging mints and burns it'
        }
      />
    )}
  </>
);

/**
 * Render a guardian set as a numbered list with its signing threshold. Falls
 * back to a count when the list is long.
 */
export const GuardianList: React.FC<{ guardians: string[]; label?: string }> = ({
  guardians,
  label = 'Guardian',
}) => (
  <div className="space-y-1">
    {guardians.map((guardian, i) => (
      <AddressWithButtons key={`${guardian}-${i}`} address={guardian} label={`${label} ${i + 1}`} />
    ))}
  </div>
);

/**
 * Compare two guardian sets and describe the membership change, so a rotation
 * reads as "2 added, 1 removed" instead of two opaque lists.
 */
export function diffGuardians(
  current: string[],
  next: string[]
): { added: string[]; removed: string[]; unchanged: string[] } {
  const currentSet = new Set(current);
  const nextSet = new Set(next);

  return {
    added: next.filter((key) => !currentSet.has(key)),
    removed: current.filter((key) => !nextSet.has(key)),
    unchanged: next.filter((key) => currentSet.has(key)),
  };
}
