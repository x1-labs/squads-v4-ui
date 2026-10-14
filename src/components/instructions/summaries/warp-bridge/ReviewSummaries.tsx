import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { describeSequenceRoute, formatUnixTime, toBigInt } from '@/lib/warpBridge/values';
import {
  BridgeTokenTarget,
  DetailBlock,
  Field,
  SummaryShell,
  ValueChange,
  accountByName,
} from './shared';
import { useBridgeConfig, useBridgeTokenFromRegistryAccount } from './hooks';

/**
 * Manual review holds inbound transfers instead of paying them out on
 * delivery. Operators then release them, or set a release time after which
 * anyone may settle them. Whale-sized transfers are delayed the same way.
 */

/** `set_manual_review` — turns the inbound hold on or off for this chain. */
export const BridgeSetManualReviewSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config, loading } = useBridgeConfig(instruction, connection);
  const authority = accountByName(instruction, 'authority', 2);

  const enabled = instruction.args?.enabled === true;
  const current = config ? config.manual_review_enabled === true : null;
  const changed = current !== null && current !== enabled;

  return (
    <SummaryShell
      icon={enabled ? '🔎' : '✅'}
      title={enabled ? 'Enable Manual Review' : 'Disable Manual Review'}
      subtitle={
        !loading && current !== null && !changed
          ? `Manual review is already ${enabled ? 'enabled' : 'disabled'} — this proposal changes nothing`
          : enabled
            ? 'Holds every inbound transfer on this chain until an operator releases it or sets a release time'
            : 'Transfers sent after execution pay out on delivery again; anything sent earlier stays held for review'
      }
      tone={!loading && current !== null && !changed ? 'gray' : enabled ? 'amber' : 'green'}
    >
      <DetailBlock>
        <Field
          label="Manual review"
          value={
            changed ? (
              <ValueChange
                from={current ? 'Enabled' : 'Disabled'}
                to={enabled ? 'Enabled' : 'Disabled'}
                tone={enabled ? 'amber' : 'green'}
              />
            ) : enabled ? (
              'Enabled'
            ) : (
              'Disabled'
            )
          }
        />
        {config && (
          <Field
            label="Current cutoff"
            value={formatUnixTime(config.manual_review_cutoff)}
            hint="Transfers sent at or before this time stay held even with review off; disabling moves it up to the execution time"
          />
        )}
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `set_delayed_release_maturity` — moves when a held transfer becomes claimable. */
export const BridgeSetDelayedReleaseMaturitySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const authority = accountByName(instruction, 'authority', 3);
  const incomingMsg = accountByName(instruction, 'incoming_msg', 2);
  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);

  return (
    <SummaryShell
      icon="⏱️"
      title="Set Release Time"
      subtitle={`Held transfer becomes claimable at ${formatUnixTime(instruction.args?.release_at)}`}
      tone="amber"
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        <Field label="Release at" value={formatUnixTime(instruction.args?.release_at)} />
        {incomingMsg && <AddressWithButtons address={incomingMsg} label="Incoming message" />}
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `release_delayed_inbound` — an operator pays out a held transfer now. */
export const BridgeReleaseDelayedInboundSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals } = useBridgeTokenFromRegistryAccount(
    instruction,
    connection
  );
  const authority = accountByName(instruction, 'authority', 4);
  const recipient = accountByName(instruction, 'recipient', 5);
  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);

  return (
    <SummaryShell
      icon="🔓"
      title="Release Held Transfer"
      subtitle="Pays out a transfer held by manual review before its release time"
      tone="green"
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        {recipient && <AddressWithButtons address={recipient} label="Recipient" />}
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `settle_delayed` — anyone pays out a held transfer once it has matured. */
export const BridgeSettleDelayedSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals } = useBridgeTokenFromRegistryAccount(
    instruction,
    connection
  );
  const recipient = accountByName(instruction, 'recipient', 4);
  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);

  return (
    <SummaryShell
      icon="📬"
      title="Settle Matured Transfer"
      subtitle="Pays out a held transfer whose release time has passed"
      tone="blue"
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        {recipient && <AddressWithButtons address={recipient} label="Recipient" />}
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
      </DetailBlock>
    </SummaryShell>
  );
};
