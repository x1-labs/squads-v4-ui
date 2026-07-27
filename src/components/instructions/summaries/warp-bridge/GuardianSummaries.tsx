import React from 'react';
import { PublicKey } from '@solana/web3.js';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { formatCounterparty, formatTokenUnits, toNumber } from '@/lib/warpBridge/values';
import {
  DetailBlock,
  Field,
  GuardianList,
  SummaryShell,
  ValueChange,
  accountByName,
  diffGuardians,
} from './shared';
import { useBridgeToken, useGuardianSet } from './hooks';

function readPubkeyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (entry instanceof PublicKey) return entry.toBase58();
    if (typeof entry === 'string') return entry;
    try {
      return new PublicKey(entry as any).toBase58();
    } catch {
      return 'Unknown';
    }
  });
}

/** Trailing entries of the on-chain guardian arrays are zeroed padding. */
function activeGuardians(guardians: PublicKey[] | undefined, count: unknown): string[] {
  const active = toNumber(count) ?? 0;
  return (guardians ?? []).slice(0, active).map((key) => key.toBase58());
}

/**
 * `set_guardians_v2` — rotates the staged-consensus guardian set.
 *
 * Rotating the set changes who can authorize incoming transfers, so the summary
 * leads with the membership delta rather than two opaque key lists. The legacy
 * v1 `set_guardians` path is retired and has no summary.
 */
export const BridgeSetGuardiansV2Summary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { guardianSet } = useGuardianSet(instruction, connection);

  const next = readPubkeyList(instruction.args?.guardians);
  const threshold = toNumber(instruction.args?.threshold);
  const admin = accountByName(instruction, 'admin', 2);

  const current = guardianSet
    ? {
        guardians: activeGuardians(guardianSet.guardians, guardianSet.num_guardians),
        threshold: toNumber(guardianSet.threshold),
      }
    : null;

  const delta = current ? diffGuardians(current.guardians, next) : null;
  const thresholdChanged =
    current?.threshold !== null &&
    current?.threshold !== undefined &&
    threshold !== null &&
    current.threshold !== threshold;
  const membershipChanged = Boolean(delta && (delta.added.length || delta.removed.length));

  const subtitle = !current
    ? `Sets a ${threshold ?? '?'}-of-${next.length} guardian set`
    : !membershipChanged && !thresholdChanged
      ? 'No change — same guardians and threshold as the current set'
      : `${delta!.added.length} added, ${delta!.removed.length} removed — ${threshold ?? '?'}-of-${next.length}`;

  return (
    <SummaryShell
      icon="🛡️"
      title="Set Guardians"
      subtitle={subtitle}
      tone={membershipChanged || thresholdChanged ? 'amber' : 'blue'}
    >
      <DetailBlock>
        <Field
          label="Threshold"
          hint="Guardian signatures required to authorize an incoming transfer"
          value={
            thresholdChanged ? (
              <ValueChange
                from={`${current!.threshold} of ${current!.guardians.length}`}
                to={`${threshold} of ${next.length}`}
              />
            ) : (
              `${threshold ?? '?'} of ${next.length}`
            )
          }
        />
      </DetailBlock>

      {delta && delta.added.length > 0 && (
        <DetailBlock>
          <div className="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
            Added ({delta.added.length})
          </div>
          <GuardianList guardians={delta.added} label="New" />
        </DetailBlock>
      )}

      {delta && delta.removed.length > 0 && (
        <DetailBlock>
          <div className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            Removed ({delta.removed.length})
          </div>
          <GuardianList guardians={delta.removed} label="Old" />
        </DetailBlock>
      )}

      {delta && delta.unchanged.length > 0 && (
        <details className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {delta.unchanged.length} guardian{delta.unchanged.length === 1 ? '' : 's'} kept
          </summary>
          <div className="mt-2">
            <GuardianList guardians={delta.unchanged} label="Kept" />
          </div>
        </details>
      )}

      {!delta && (
        <DetailBlock>
          <GuardianList guardians={next} />
        </DetailBlock>
      )}

      {admin && (
        <DetailBlock>
          <AddressWithButtons address={admin} label="Admin" />
        </DetailBlock>
      )}
    </SummaryShell>
  );
};

/** `initialize_guardian_set_v2` — one-time creation of the v2 guardian set account. */
export const BridgeInitializeGuardianSetV2Summary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { guardianSet } = useGuardianSet(instruction, connection);
  const account = accountByName(instruction, 'guardian_set', 1);
  const admin = accountByName(instruction, 'admin', 2);

  return (
    <SummaryShell
      icon="🛡️"
      title="Initialize Guardian Set"
      subtitle={
        guardianSet
          ? 'The guardian set already exists — re-initializing will fail'
          : 'Creates the staged-consensus guardian set, seeded from the legacy guardians on the config'
      }
      tone={guardianSet ? 'amber' : 'purple'}
    >
      <DetailBlock>
        {guardianSet && (
          <Field
            label="Existing set"
            value={`index ${guardianSet.guardian_set_index} · ${toNumber(guardianSet.threshold) ?? '?'} of ${toNumber(guardianSet.num_guardians) ?? '?'}`}
          />
        )}
        {account && <AddressWithButtons address={account} label="Set" />}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `post_signatures` — stages verified guardian signatures for one incoming
 * transfer, ahead of `bridge_in_v2` consuming them.
 */
export const BridgePostSignaturesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals } = useBridgeToken(instruction, connection);
  const sender = formatCounterparty(instruction.args?.sender);
  const sourceSeq = toNumber(instruction.args?.source_seq);
  const payer = accountByName(instruction, 'payer', 4);

  return (
    <SummaryShell
      icon="✍️"
      title="Post Guardian Signatures"
      subtitle="Stages verified guardian signatures for one incoming transfer — no tokens move yet"
      tone="blue"
    >
      <DetailBlock>
        <Field
          label="Amount"
          value={formatTokenUnits(instruction.args?.amount, decimals, symbol)}
        />
        {sourceSeq !== null && (
          <Field
            label="Source seq"
            value={sourceSeq.toLocaleString()}
            hint="Sequence number of the transfer on the originating chain"
          />
        )}
        {sender && <AddressWithButtons address={sender} label="Sender" />}
        {localMint && <AddressWithButtons address={localMint} label="Mint" />}
        {payer && <AddressWithButtons address={payer} label="Payer" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `close_signature_set` — reclaims rent from an expired, unconsumed signature set. */
export const BridgeCloseSignatureSetSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { symbol, decimals } = useBridgeToken(instruction, connection);
  const sourceSeq = toNumber(instruction.args?.source_seq);
  const refundRecipient = accountByName(instruction, 'refund_recipient', 3);

  return (
    <SummaryShell
      icon="🧹"
      title="Close Signature Set"
      subtitle="Reclaims rent from an expired signature set that was never consumed by a bridge-in"
      tone="gray"
    >
      <DetailBlock>
        <Field
          label="Amount"
          value={formatTokenUnits(instruction.args?.amount, decimals, symbol)}
          hint="The transfer these staged signatures would have authorized"
        />
        {sourceSeq !== null && <Field label="Source seq" value={sourceSeq.toLocaleString()} />}
        {refundRecipient && <AddressWithButtons address={refundRecipient} label="Rent to" />}
      </DetailBlock>
    </SummaryShell>
  );
};
