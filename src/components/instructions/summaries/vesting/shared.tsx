import React from 'react';
import { formatNativeAmount, formatTokenAmount } from '@/lib/utils/formatters';
import { NativeSymbol } from '@/lib/network';
import { PreflightResult, willFail } from '@/lib/vesting/preflight';
import { toBigInt } from '@/lib/vesting/values';
import { Field, Tone } from '../shared';

export * from '../shared';

const NATIVE_DECIMALS = 9;

/**
 * A native amount shown rounded for reading, with the exact figure and raw
 * lamports underneath — the precise value is what a signer is approving.
 */
export const NativeAmountField: React.FC<{
  label: string;
  lamports: unknown;
  symbol: NativeSymbol;
  hint?: string;
  tone?: Tone;
}> = ({ label, lamports, symbol, hint, tone }) => {
  const raw = toBigInt(lamports);
  if (raw === null) return <Field label={label} value="—" hint={hint} />;
  const exact = formatTokenAmount(raw, NATIVE_DECIMALS, symbol);
  const rounded = formatNativeAmount(raw, symbol);
  const detail = `${exact === rounded ? '' : `${exact} · `}${raw.toLocaleString()} lamports`;
  return (
    <Field label={label} value={rounded} tone={tone} hint={hint ? `${detail}. ${hint}` : detail} />
  );
};

/**
 * Headline for a summary given its preflight. Every proposal the program will
 * reject is red; checks that could not run turn it amber; no-ops stay gray
 * (callers pass that as `normal`).
 */
export function preflightHeadline(
  preflight: PreflightResult,
  loading: boolean,
  normal: { subtitle: string; tone: Tone }
): { subtitle: string; tone: Tone } {
  if (loading) return normal;
  if (willFail(preflight)) {
    return {
      subtitle: 'The program would reject this proposal as the chain stands now — see why below',
      tone: 'red',
    };
  }
  if (preflight.unverified.length > 0) {
    return {
      subtitle: `${normal.subtitle}. Some checks could not run — verify before signing`,
      tone: 'amber',
    };
  }
  return normal;
}

/** Lists why the program would reject the proposal, and which checks could not run. */
export const PreflightBlock: React.FC<{ preflight: PreflightResult; loading: boolean }> = ({
  preflight,
  loading,
}) => {
  if (loading) {
    return <div className="text-xs text-muted-foreground">Checking against on-chain state…</div>;
  }
  if (!preflight.rejections.length && !preflight.unverified.length) return null;
  return (
    <div className="space-y-1">
      {preflight.rejections.map((rejection, i) => (
        <Field
          key={`rejection-${i}`}
          label="Will be rejected"
          value={rejection.code ? `${rejection.error} (${rejection.code})` : rejection.error}
          hint={rejection.reason}
          tone="red"
        />
      ))}
      {preflight.unverified.map((message, i) => (
        <Field key={`unverified-${i}`} label="Not verified" value="—" hint={message} tone="amber" />
      ))}
      <div className="text-xs text-muted-foreground">
        Checked against the current on-chain state. Earlier instructions in the same proposal are
        not simulated and may change the outcome.
      </div>
    </div>
  );
};
