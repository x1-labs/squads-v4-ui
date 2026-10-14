import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import {
  describeRecoveryMode,
  describeSequenceRoute,
  enumVariantName,
  formatBytes32,
  formatCounterparty,
  formatTokenUnits,
  formatUnixTime,
  toBigInt,
} from '@/lib/warpBridge/values';
import {
  BridgeTokenTarget,
  DetailBlock,
  Field,
  SummaryShell,
  ValueChange,
  accountByName,
  readPubkeyArg,
} from './shared';
import { useBridgeConfig, useBridgeTokenFromRegistryAccount, useRecoveryPolicy } from './hooks';

/**
 * Incident recovery is the one part of the bridge that rewrites transfer
 * outcomes: a cancellation permanently blocks delivery of an inbound transfer,
 * and a reversal returns a cancelled outbound transfer to its sender. Both are
 * root-only, need the bridge or the token paused, and cannot be undone.
 */

/** Shows the incident a recovery action is filed under. */
const IncidentFields: React.FC<{ reasonCode: unknown; incidentId: unknown }> = ({
  reasonCode,
  incidentId,
}) => {
  const id = formatBytes32(incidentId);
  return (
    <>
      <Field
        label="Reason code"
        value={toBigInt(reasonCode)?.toString() ?? '—'}
        hint="Operator-defined incident category (0–31), recorded on chain"
      />
      <Field
        label="Incident ID"
        value={<span className="break-all text-xs">{id ?? '—'}</span>}
        hint="32-byte identifier linking this action to the incident record"
      />
    </>
  );
};

/** `initialize_recovery_policy` — creates the recovery switch in `Disabled` mode. */
export const BridgeInitializeRecoveryPolicySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { policy, loading } = useRecoveryPolicy(instruction, connection);
  const policyAccount = accountByName(instruction, 'recovery_policy', 1);
  const admin = accountByName(instruction, 'admin', 2);

  return (
    <SummaryShell
      icon="🧯"
      title="Initialize Recovery Policy"
      subtitle={
        !loading && policy
          ? 'The recovery policy already exists — this instruction will fail'
          : 'Creates the incident-recovery switch, starting in Disabled mode'
      }
      tone={!loading && policy ? 'amber' : 'indigo'}
    >
      <DetailBlock>
        <Field
          label="Initial mode"
          value="Disabled"
          hint="Nothing can be cancelled or reversed until root changes the mode"
        />
        {policyAccount && <AddressWithButtons address={policyAccount} label="Policy" />}
        {admin && <AddressWithButtons address={admin} label="Root" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `set_recovery_mode` — enables or disables cancellations and reversals. */
export const BridgeSetRecoveryModeSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { policy, loading } = useRecoveryPolicy(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);

  const next = describeRecoveryMode(instruction.args?.mode);
  const nextVariant = enumVariantName(instruction.args?.mode);
  // A missing policy reads as Disabled; an earlier instruction in the same
  // proposal may be the one creating it.
  const currentVariant = policy ? enumVariantName(policy.mode) : 'Disabled';
  const current = describeRecoveryMode(currentVariant);
  const changed = !loading && currentVariant !== nextVariant;
  const enabling = nextVariant !== 'Disabled';

  return (
    <SummaryShell
      icon={enabling ? '🧯' : '🔒'}
      title={enabling ? `Enable Recovery: ${next.label}` : 'Disable Recovery'}
      subtitle={
        !loading && !changed
          ? `Recovery is already ${next.label.toLowerCase()} — this proposal changes nothing`
          : (next.description ?? 'Changes the incident-recovery mode')
      }
      tone={!loading && !changed ? 'gray' : enabling ? 'red' : 'green'}
    >
      <DetailBlock>
        <Field
          label="Mode"
          hint={next.description}
          value={
            changed ? (
              <ValueChange from={current.label} to={next.label} tone={enabling ? 'red' : 'green'} />
            ) : (
              next.label
            )
          }
        />
        {!policy && !loading && (
          <div className="text-xs text-muted-foreground">
            No recovery policy exists yet; it must be initialized earlier in this proposal or this
            instruction fails.
          </div>
        )}
        {admin && <AddressWithButtons address={admin} label="Root" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `cancel_inbound` — tombstones an undelivered inbound transfer on this
 * (destination) chain so it can never be delivered.
 */
export const BridgeCancelInboundSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config } = useBridgeConfig(instruction, connection);
  const { policy } = useRecoveryPolicy(instruction, connection);
  const { localMint, symbol, decimals, registry } = useBridgeTokenFromRegistryAccount(
    instruction,
    connection
  );
  const admin = accountByName(instruction, 'admin', 6);
  const incomingMsg = accountByName(instruction, 'incoming_msg', 4);
  const cancellation = accountByName(instruction, 'inbound_cancellation', 5);

  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);
  const sender = formatCounterparty(instruction.args?.sender);
  const sourceMint = readPubkeyArg(instruction.args?.source_token_mint);
  const paused = config?.paused === true || registry?.paused === true;
  const modeVariant = policy ? enumVariantName(policy.mode) : 'Disabled';
  const modeAllows = modeVariant === 'CancellationOnly' || modeVariant === 'FullRecovery';

  return (
    <SummaryShell
      icon="🪦"
      title="Cancel Inbound Transfer"
      subtitle={`Permanently blocks delivery of ${formatTokenUnits(
        instruction.args?.amount,
        decimals,
        symbol
      )}${route ? ` (${route})` : ''} — irreversible`}
      tone="red"
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        <Field
          label="Amount"
          value={formatTokenUnits(instruction.args?.amount, decimals, symbol)}
          hint="Gross amount from the original source transfer"
        />
        {sender && <AddressWithButtons address={sender} label="Sender" />}
        {sourceMint && <AddressWithButtons address={sourceMint} label="Source mint" />}
        <Field
          label="Sent at"
          value={formatUnixTime(instruction.args?.source_timestamp)}
          hint="Source-chain timestamp from the original transfer"
        />
      </DetailBlock>

      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
      </DetailBlock>

      <DetailBlock>
        <IncidentFields
          reasonCode={instruction.args?.reason_code}
          incidentId={instruction.args?.incident_id}
        />
      </DetailBlock>

      <DetailBlock>
        <Field
          label="Requires"
          value={
            config || registry
              ? paused
                ? 'Bridge or token paused — satisfied now'
                : 'Bridge or token paused — not paused now'
              : 'Bridge or token paused'
          }
          tone={config || registry ? (paused ? 'green' : 'amber') : undefined}
          hint="Unless an earlier instruction in this proposal pauses it, execution fails"
        />
        <Field
          label="Recovery mode"
          value={describeRecoveryMode(modeVariant).label}
          tone={modeAllows ? 'green' : 'amber'}
          hint="Cancellation needs Cancellation only or Full recovery, set earlier in this proposal or already active"
        />
        <div className="text-xs text-muted-foreground">
          This only stops delivery. Refunding the sender is a separate source-chain step: guardians
          attest the cancellation (post cancellation signatures) and root executes a reversal.
        </div>
      </DetailBlock>

      <DetailBlock>
        {incomingMsg && (
          <AddressWithButtons address={incomingMsg} label="Incoming message (must not exist)" />
        )}
        {cancellation && <AddressWithButtons address={cancellation} label="Tombstone" />}
        {admin && <AddressWithButtons address={admin} label="Root" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `post_cancellation_signatures` — records guardian attestations of a
 * destination-chain cancellation on the source chain, the prerequisite for a
 * reversal.
 */
export const BridgePostCancellationSignaturesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const proof = accountByName(instruction, 'cancellation_proof', 2);
  const payer = accountByName(instruction, 'payer', 3);
  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);
  const destinationProgram = readPubkeyArg(instruction.args?.destination_program_id);
  const messageHash = formatBytes32(instruction.args?.transfer_message_hash);

  return (
    <SummaryShell
      icon="🖋️"
      title="Post Cancellation Signatures"
      subtitle="Records guardian attestations that the destination chain cancelled this transfer"
      tone="indigo"
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        <Field label="Cancelled at" value={formatUnixTime(instruction.args?.cancelled_at)} />
        <Field
          label="Message hash"
          value={<span className="break-all text-xs">{messageHash ?? '—'}</span>}
        />
        {destinationProgram && (
          <AddressWithButtons address={destinationProgram} label="Destination program" />
        )}
      </DetailBlock>
      <DetailBlock>
        <IncidentFields
          reasonCode={instruction.args?.reason_code}
          incidentId={instruction.args?.incident_id}
        />
      </DetailBlock>
      <DetailBlock>
        {proof && <AddressWithButtons address={proof} label="Cancellation proof" />}
        {payer && <AddressWithButtons address={payer} label="Payer" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `reverse_outgoing` — returns a cancelled outbound transfer to its sender on
 * this (source) chain, consuming the guardian-attested cancellation proof.
 */
export const BridgeReverseOutgoingSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config } = useBridgeConfig(instruction, connection);
  const { policy } = useRecoveryPolicy(instruction, connection);
  const { localMint, symbol, decimals, registry } = useBridgeTokenFromRegistryAccount(
    instruction,
    connection
  );
  const sender = accountByName(instruction, 'sender', 8);
  const senderTokenAccount = accountByName(instruction, 'sender_token_account', 9);
  const outgoingMsg = accountByName(instruction, 'outgoing_msg', 5);
  const proof = accountByName(instruction, 'cancellation_proof', 3);
  const admin = accountByName(instruction, 'admin', 7);
  const destinationCancellation = readPubkeyArg(instruction.args?.destination_cancellation);

  const seq = toBigInt(instruction.args?.seq);
  const route = describeSequenceRoute(instruction.args?.seq);
  const paused = config?.paused === true || registry?.paused === true;
  const modeVariant = policy ? enumVariantName(policy.mode) : 'Disabled';

  return (
    <SummaryShell
      icon="↩️"
      title="Reverse Outbound Transfer"
      subtitle={`Returns a cancelled ${symbol ?? 'token'} transfer to its sender — irreversible`}
      tone="red"
    >
      <DetailBlock>
        <Field label="Sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        {sender && <AddressWithButtons address={sender} label="Refund to" />}
        {senderTokenAccount && (
          <AddressWithButtons address={senderTokenAccount} label="Refund token account" />
        )}
        <div className="text-xs text-muted-foreground">
          The amount comes from the original outgoing message; native tokens are released from the
          vault and wrapped tokens are re-minted.
        </div>
      </DetailBlock>

      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
      </DetailBlock>

      <DetailBlock>
        <IncidentFields
          reasonCode={instruction.args?.reason_code}
          incidentId={instruction.args?.incident_id}
        />
        {destinationCancellation && (
          <AddressWithButtons address={destinationCancellation} label="Destination cancellation" />
        )}
      </DetailBlock>

      <DetailBlock>
        <Field
          label="Requires"
          value={
            config || registry
              ? paused
                ? 'Bridge or token paused — satisfied now'
                : 'Bridge or token paused — not paused now'
              : 'Bridge or token paused'
          }
          tone={config || registry ? (paused ? 'green' : 'amber') : undefined}
        />
        <Field
          label="Recovery mode"
          value={describeRecoveryMode(modeVariant).label}
          tone={modeVariant === 'FullRecovery' ? 'green' : 'amber'}
          hint="Reversal needs Full recovery"
        />
      </DetailBlock>

      <DetailBlock>
        {outgoingMsg && <AddressWithButtons address={outgoingMsg} label="Outgoing message" />}
        {proof && <AddressWithButtons address={proof} label="Cancellation proof" />}
        {admin && <AddressWithButtons address={admin} label="Root" />}
      </DetailBlock>
    </SummaryShell>
  );
};
