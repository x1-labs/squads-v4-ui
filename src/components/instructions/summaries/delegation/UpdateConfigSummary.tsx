import React, { useMemo } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { CONFIG_FIELDS, ConfigFieldSpec } from '@/lib/delegation/configFields';
import { percentChange, toBigInt } from '@/lib/delegation/values';
import { DetailBlock, Field, SummaryShell, ValueChange, accountByName } from './shared';
import { useDelegationConfig } from './hooks';
import { useNativeSymbol } from '@/hooks/useNativeSymbol';

type FieldState = 'changed' | 'unchanged' | 'unknown' | 'untouched';

interface EvaluatedField {
  spec: ConfigFieldSpec;
  state: FieldState;
  submitted: unknown;
  current: unknown;
}

/** Compare a submitted param against the on-chain value across BN/number/bool forms. */
function isSameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);

  const left = toBigInt(a);
  const right = toBigInt(b);
  if (left !== null && right !== null) return left === right;

  return String(a) === String(b);
}

/** Signed percentage annotation for a numeric before -> after pair. */
function deltaLabel(current: unknown, submitted: unknown): string | null {
  const from = toBigInt(current);
  const to = toBigInt(submitted);
  if (from === null || to === null) return null;

  const change = percentChange(from, to);
  if (change === null || !Number.isFinite(change)) return null;

  const rounded = Math.abs(change) >= 10 ? Math.round(change) : Number(change.toFixed(1));
  if (rounded === 0) return null;

  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/**
 * Summary for the delegation program's `update_config` instruction.
 *
 * The bot submits every parameter on each proposal, so the raw arguments are a
 * wall of 14 values that mostly restate the current config. This fetches the
 * live `DelegationConfig` and leads with the parameters that actually change.
 */
export const DelegationUpdateConfigSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const nativeSymbol = useNativeSymbol();
  const { config: currentConfig, loading } = useDelegationConfig(instruction, connection);

  const params = (instruction.args?.params ?? instruction.args ?? {}) as Record<string, unknown>;
  const configAccount = accountByName(instruction, 'config', 0);
  const authority = accountByName(instruction, 'authority', 1);

  const fields = useMemo<EvaluatedField[]>(
    () =>
      CONFIG_FIELDS.map((spec) => {
        const submitted = params[spec.key];
        if (submitted === null || submitted === undefined) {
          return { spec, state: 'untouched' as const, submitted, current: undefined };
        }

        if (!currentConfig) {
          return { spec, state: 'unknown' as const, submitted, current: undefined };
        }

        const current = currentConfig[spec.key];
        return {
          spec,
          state: isSameValue(submitted, current) ? ('unchanged' as const) : ('changed' as const),
          submitted,
          current,
        };
      }),
    [params, currentConfig]
  );

  const changed = fields.filter((field) => field.state === 'changed');
  const unchanged = fields.filter((field) => field.state === 'unchanged');
  const untouched = fields.filter((field) => field.state === 'untouched');
  const submittedCount = fields.length - untouched.length;

  const pausing = changed.some(
    (field) => field.spec.key === 'emergency_pause' && field.submitted === true
  );

  const subtitle = loading
    ? 'Comparing against the current on-chain config…'
    : !currentConfig
      ? `Sets ${submittedCount} delegation parameter${submittedCount === 1 ? '' : 's'} (current config unavailable — showing submitted values)`
      : changed.length === 0
        ? `No effective change — all ${submittedCount} submitted values match the current config`
        : `${changed.length} of ${submittedCount} submitted parameter${submittedCount === 1 ? '' : 's'} change`;

  return (
    <SummaryShell
      icon={pausing ? '⏸️' : '⚙️'}
      title="Update Delegation Config"
      subtitle={subtitle}
      tone={pausing ? 'red' : changed.length > 0 ? 'amber' : 'blue'}
    >
      {changed.length > 0 && (
        <DetailBlock>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Changes
          </div>
          {changed.map(({ spec, submitted, current }) => {
            const delta = deltaLabel(current, submitted);
            return (
              <Field
                key={spec.key}
                label={spec.label}
                hint={spec.description}
                value={
                  <>
                    <ValueChange
                      from={spec.format(current, nativeSymbol)}
                      to={spec.format(submitted, nativeSymbol)}
                      tone={spec.key === 'emergency_pause' && submitted === true ? 'red' : 'amber'}
                    />
                    {delta && <span className="ml-2 text-xs text-muted-foreground">({delta})</span>}
                  </>
                }
              />
            );
          })}
        </DetailBlock>
      )}

      {!loading && !currentConfig && submittedCount > 0 && (
        <DetailBlock>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Submitted values
          </div>
          {fields
            .filter((field) => field.state === 'unknown')
            .map(({ spec, submitted }) => (
              <Field
                key={spec.key}
                label={spec.label}
                hint={spec.description}
                value={spec.format(submitted, nativeSymbol)}
              />
            ))}
        </DetailBlock>
      )}

      {unchanged.length > 0 && (
        <details className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {unchanged.length} parameter{unchanged.length === 1 ? '' : 's'} resubmitted unchanged
          </summary>
          <div className="mt-2 space-y-1">
            {unchanged.map(({ spec, submitted }) => (
              <div key={spec.key} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs text-muted-foreground">{spec.label}:</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {spec.format(submitted, nativeSymbol)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {untouched.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {untouched.length} parameter{untouched.length === 1 ? '' : 's'} not included — left at the
          current value.
        </div>
      )}

      <DetailBlock>
        {configAccount && <AddressWithButtons address={configAccount} label="Config" />}
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </DetailBlock>
    </SummaryShell>
  );
};
