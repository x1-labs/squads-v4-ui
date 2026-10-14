import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import {
  CancellationProofAccount,
  getInboundCancellationPda,
  getIncomingMsgPda,
  getOutgoingMsgPda,
  getOutgoingReversalPda,
  getRecoveryPolicyPda,
  readBridgeAccount,
} from '@/lib/warpBridge/accounts';
import {
  ANCHOR_ERRORS,
  ProofFacts,
  checkAccountFree,
  checkCancellationProof,
  checkIncident,
  checkInboundRoute,
  checkOutboundRoute,
  checkPda,
  instructionIs,
  reject,
  checkRecoveryMode,
  checkRecoveryPause,
  checkRootHasOne,
  emptyPreflight,
} from '@/lib/warpBridge/preflight';
import {
  describeRecoveryMode,
  describeSequenceRoute,
  enumVariantName,
  formatBytes32,
  formatCounterparty,
  formatTokenUnits,
  formatUnixTime,
  toBigInt,
  toNumber,
} from '@/lib/warpBridge/values';
import { useProgramAccount } from '../useProgramAccount';
import {
  BridgeTokenTarget,
  DetailBlock,
  Field,
  SummaryShell,
  ValueChange,
  accountByName,
  readPubkeyArg,
  BridgePreflightBlock,
  preflightHeadline,
} from './shared';
import {
  useBridgeAccountExists,
  useBridgeFacts,
  useBridgeTokenFromRegistryAccount,
  useGuardianSet,
} from './hooks';

/**
 * Incident recovery is the one part of the bridge that rewrites transfer
 * outcomes: a cancellation permanently blocks delivery of an inbound transfer,
 * and a reversal returns a cancelled outbound transfer to its sender. Both are
 * root-only, need the bridge or the token paused, and cannot be undone.
 *
 * Guards are mirrored in `@/lib/warpBridge/preflight`, with earlier
 * instructions in the same proposal applied first.
 */

/** Shows the incident a recovery action is filed under. */
const IncidentFields: React.FC<{ reasonCode: unknown; incidentId: unknown }> = ({
  reasonCode,
  incidentId,
}) => (
  <>
    <Field
      label="Reason code"
      value={toBigInt(reasonCode)?.toString() ?? '—'}
      hint="Operator-defined incident category (0–31), recorded on chain"
    />
    <Field
      label="Incident ID"
      value={<span className="break-all text-xs">{formatBytes32(incidentId) ?? '—'}</span>}
      hint="32-byte identifier linking this action to the incident record"
    />
  </>
);

/** `initialize_recovery_policy` — creates the recovery switch in `Disabled` mode. */
export const BridgeInitializeRecoveryPolicySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
  priorInstructions,
}) => {
  const { facts, loading: factsLoading } = useBridgeFacts(
    instruction,
    connection,
    priorInstructions
  );
  const suppliedPolicy = accountByName(instruction, 'recovery_policy', 1);
  const policyAccount = getRecoveryPolicyPda(instruction.programId).toBase58();
  const { exists, loading: existsLoading } = useBridgeAccountExists(connection, policyAccount);
  const admin = accountByName(instruction, 'admin', 2);
  const loading = factsLoading || existsLoading;

  const preflight = emptyPreflight();
  checkRootHasOne(preflight, facts, admin);
  checkPda(preflight, suppliedPolicy, policyAccount, 'The recovery policy account');
  checkAccountFree(preflight, exists, 'The recovery policy');

  const headline = preflightHeadline(preflight, loading, {
    subtitle: 'Creates the incident-recovery switch, starting in Disabled mode',
    tone: 'indigo',
  });

  return (
    <SummaryShell
      icon="🧯"
      title="Initialize Recovery Policy"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <Field
          label="Initial mode"
          value="Disabled"
          hint="Nothing can be cancelled or reversed until root changes the mode"
        />
        <AddressWithButtons address={policyAccount} label="Policy" />
        {admin && <AddressWithButtons address={admin} label="Root" />}
      </DetailBlock>
      <BridgePreflightBlock preflight={preflight} loading={loading} />
    </SummaryShell>
  );
};

/** `set_recovery_mode` — enables or disables cancellations and reversals. */
export const BridgeSetRecoveryModeSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
  priorInstructions,
}) => {
  const { facts, loading } = useBridgeFacts(instruction, connection, priorInstructions);
  const admin = accountByName(instruction, 'admin', 2);

  const next = describeRecoveryMode(instruction.args?.mode);
  const nextVariant = enumVariantName(instruction.args?.mode);
  const currentVariant = facts.recoveryMode;
  const known = currentVariant !== undefined && currentVariant !== null;
  const changed = known && currentVariant !== nextVariant;
  const enabling = nextVariant !== 'Disabled';

  const preflight = emptyPreflight();
  checkRootHasOne(preflight, facts, admin);
  checkPda(
    preflight,
    accountByName(instruction, 'recovery_policy', 1),
    getRecoveryPolicyPda(instruction.programId).toBase58(),
    'The recovery policy account'
  );
  if (currentVariant === undefined) {
    preflight.unverified.push('Recovery policy could not be read — current mode not verified');
  } else if (currentVariant === null) {
    reject(preflight, 'AccountNotInitialized', 'The recovery policy has not been initialized');
  }

  const headline = preflightHeadline(preflight, loading, {
    subtitle:
      known && !changed
        ? `Recovery is already ${next.label.toLowerCase()} — this proposal changes nothing`
        : (next.description ?? 'Changes the incident-recovery mode'),
    tone: known && !changed ? 'gray' : enabling ? 'red' : 'green',
  });

  return (
    <SummaryShell
      icon={enabling ? '🧯' : '🔒'}
      title={enabling ? `Enable Recovery: ${next.label}` : 'Disable Recovery'}
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <Field
          label="Mode"
          hint={next.description}
          value={
            changed ? (
              <ValueChange
                from={describeRecoveryMode(currentVariant).label}
                to={next.label}
                tone={enabling ? 'red' : 'green'}
              />
            ) : (
              next.label
            )
          }
        />
        {admin && <AddressWithButtons address={admin} label="Root" />}
      </DetailBlock>
      <BridgePreflightBlock preflight={preflight} loading={loading} />
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
  priorInstructions,
}) => {
  const registryAddress = accountByName(instruction, 'token_registry', 3);
  const { facts, loading: factsLoading } = useBridgeFacts(
    instruction,
    connection,
    priorInstructions,
    registryAddress
  );
  const { localMint, symbol, decimals } = useBridgeTokenFromRegistryAccount(
    instruction,
    connection
  );
  const admin = accountByName(instruction, 'admin', 6);
  const incomingMsg = accountByName(instruction, 'incoming_msg', 4);
  const cancellation = accountByName(instruction, 'inbound_cancellation', 5);
  const seqValue = toBigInt(instruction.args?.source_seq);
  const expectedIncoming =
    seqValue !== null ? getIncomingMsgPda(instruction.programId, seqValue).toBase58() : undefined;
  const expectedCancellation =
    seqValue !== null
      ? getInboundCancellationPda(instruction.programId, seqValue).toBase58()
      : undefined;
  const { exists: delivered, loading: deliveredLoading } = useBridgeAccountExists(
    connection,
    expectedIncoming
  );
  const { exists: alreadyCancelled, loading: cancelledLoading } = useBridgeAccountExists(
    connection,
    expectedCancellation
  );
  const loading = factsLoading || deliveredLoading || cancelledLoading;

  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);
  const sender = formatCounterparty(instruction.args?.sender);
  const sourceMint = readPubkeyArg(instruction.args?.source_token_mint);
  const amount = formatTokenUnits(instruction.args?.amount, decimals, symbol);

  const preflight = emptyPreflight();
  checkRootHasOne(preflight, facts, admin);
  checkRecoveryMode(preflight, facts, 'cancel');
  checkRecoveryPause(preflight, facts, registryAddress);
  checkIncident(preflight, instruction.args?.reason_code, instruction.args?.incident_id);
  checkAccountFree(
    preflight,
    delivered,
    'A delivery receipt for this sequence (the transfer was already delivered)',
    'DestinationAlreadyExecuted'
  );
  checkInboundRoute(preflight, facts, instruction.args?.source_seq);
  checkPda(preflight, incomingMsg, expectedIncoming, 'The delivery receipt account');
  checkPda(preflight, cancellation, expectedCancellation, 'The tombstone account');
  checkAccountFree(preflight, alreadyCancelled, 'A cancellation for this sequence');
  preflight.unverified.push(
    'Sender, mint, amount and timestamp are not checked against the source transfer. Delivery is blocked by sequence either way, but the recorded message hash feeds the refund attestation — compare them with the source transaction'
  );

  const headline = preflightHeadline(preflight, loading, {
    subtitle: `Permanently blocks delivery of ${amount}${route ? ` (${route})` : ''} — irreversible`,
    tone: 'red',
  });

  return (
    <SummaryShell
      icon="🪦"
      title="Cancel Inbound Transfer"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        <Field
          label="Amount"
          value={amount}
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
        <div className="text-xs text-muted-foreground">
          This only stops delivery. Refunding the sender is a separate source-chain step: guardians
          attest the cancellation (post cancellation signatures) and root executes a reversal.
        </div>
      </DetailBlock>

      <BridgePreflightBlock preflight={preflight} loading={loading} />

      <DetailBlock>
        {incomingMsg && <AddressWithButtons address={incomingMsg} label="Delivery receipt" />}
        {cancellation && <AddressWithButtons address={cancellation} label="Tombstone" />}
        {admin && <AddressWithButtons address={admin} label="Root" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `post_cancellation_signatures` — records guardian attestations of a
 * destination-chain cancellation on the source chain, the prerequisite for a
 * reversal. Permissionless; the guardian signatures are verified against the
 * Ed25519 instructions in the same transaction, which is not mirrored here.
 */
export const BridgePostCancellationSignaturesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
  priorInstructions,
}) => {
  const { facts, loading } = useBridgeFacts(instruction, connection, priorInstructions);
  const proof = accountByName(instruction, 'cancellation_proof', 2);
  const payer = accountByName(instruction, 'payer', 3);
  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);
  const destinationProgram = readPubkeyArg(instruction.args?.destination_program_id);
  const messageHash = formatBytes32(instruction.args?.transfer_message_hash);

  const preflight = emptyPreflight();
  checkIncident(preflight, instruction.args?.reason_code, instruction.args?.incident_id);
  checkOutboundRoute(preflight, facts, instruction.args?.source_seq);
  const cancelledAt = toBigInt(instruction.args?.cancelled_at);
  if (cancelledAt === null) {
    preflight.unverified.push('Cancellation time could not be decoded');
  } else if (cancelledAt <= BigInt(0)) {
    reject(preflight, 'InvalidCancellationProof', 'The cancellation time must be positive');
  }
  preflight.unverified.push(
    'Not mirrored: the guardian Ed25519 signatures in this transaction, the threshold and "no new signatures" checks, the cancellation proof address (derived from the guardian set index and these arguments), and consistency with an existing proof (consumed, hash, guardian set)'
  );

  const headline = preflightHeadline(preflight, loading, {
    subtitle: 'Records guardian attestations that the destination chain cancelled this transfer',
    tone: 'indigo',
  });

  return (
    <SummaryShell
      icon="🖋️"
      title="Post Cancellation Signatures"
      subtitle={headline.subtitle}
      tone={headline.tone}
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
      <BridgePreflightBlock preflight={preflight} loading={loading} />
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
  priorInstructions,
}) => {
  const registryAddress = accountByName(instruction, 'token_registry', 4);
  const { facts, loading: factsLoading } = useBridgeFacts(
    instruction,
    connection,
    priorInstructions,
    registryAddress
  );
  const { guardianSet, loading: guardiansLoading } = useGuardianSet(instruction, connection);
  const { localMint, symbol, decimals } = useBridgeTokenFromRegistryAccount(
    instruction,
    connection
  );
  const sender = accountByName(instruction, 'sender', 8);
  const senderTokenAccount = accountByName(instruction, 'sender_token_account', 9);
  const outgoingMsg = accountByName(instruction, 'outgoing_msg', 5);
  const reversal = accountByName(instruction, 'outgoing_reversal', 6);
  const proofAddress = accountByName(instruction, 'cancellation_proof', 3);
  const admin = accountByName(instruction, 'admin', 7);
  const destinationCancellation = readPubkeyArg(instruction.args?.destination_cancellation);

  const { data: proofRead, loading: proofLoading } = useProgramAccount(
    proofAddress && `bridge-proof:${connection.rpcEndpoint}:${proofAddress}`,
    () =>
      readBridgeAccount<CancellationProofAccount>(
        connection,
        'CancellationProof',
        proofAddress!
      ).then((result) =>
        result.ok
          ? {
              value: result.value
                ? ({
                    consumed: result.value.consumed,
                    sourceSeq: toBigInt(result.value.source_seq),
                    guardianSetIndex: toNumber(result.value.guardian_set_index),
                    signatureCount: toNumber(result.value.signature_count),
                    destinationCancellation:
                      result.value.destination_cancellation?.toBase58() ?? null,
                    reasonCode: toNumber(result.value.reason_code),
                    incidentId: formatBytes32(result.value.incident_id),
                  } as ProofFacts)
                : null,
            }
          : null
      )
  );
  const seqValue = toBigInt(instruction.args?.seq);
  const expectedReversal =
    seqValue !== null
      ? getOutgoingReversalPda(instruction.programId, seqValue).toBase58()
      : undefined;
  const expectedOutgoing =
    seqValue !== null ? getOutgoingMsgPda(instruction.programId, seqValue).toBase58() : undefined;
  const { exists: reversed, loading: reversedLoading } = useBridgeAccountExists(
    connection,
    expectedReversal
  );
  const { exists: outgoingExists, loading: outgoingLoading } = useBridgeAccountExists(
    connection,
    expectedOutgoing
  );
  const loading =
    factsLoading || guardiansLoading || proofLoading || reversedLoading || outgoingLoading;

  const seq = toBigInt(instruction.args?.seq);
  const route = describeSequenceRoute(instruction.args?.seq);

  const preflight = emptyPreflight();
  checkRootHasOne(preflight, facts, admin);
  checkRecoveryMode(preflight, facts, 'reverse');
  checkRecoveryPause(preflight, facts, registryAddress);
  checkIncident(preflight, instruction.args?.reason_code, instruction.args?.incident_id);
  checkCancellationProof(
    preflight,
    proofRead ? proofRead.value : undefined,
    {
      seq: instruction.args?.seq,
      destinationCancellation,
      reasonCode: instruction.args?.reason_code,
      incidentId: instruction.args?.incident_id,
    },
    guardianSet
      ? {
          index: toNumber(guardianSet.guardian_set_index),
          threshold: toNumber(guardianSet.threshold),
        }
      : undefined
  );
  checkOutboundRoute(preflight, facts, instruction.args?.seq);
  checkPda(preflight, outgoingMsg, expectedOutgoing, 'The outgoing message account');
  if (outgoingExists === false) {
    reject(
      preflight,
      'AccountNotInitialized',
      'No outgoing message exists for this sequence (a prefunded address fails as AccountOwnedByWrongProgram)'
    );
  } else if (outgoingExists === undefined) {
    preflight.unverified.push('Could not confirm the outgoing message exists');
  }
  if (
    (priorInstructions ?? []).some((prior) =>
      instructionIs(prior, instruction.programId, 'set_guardians_v2')
    )
  ) {
    preflight.unverified.push(
      'An earlier instruction rotates the guardian set, which makes this proof stale; not simulated'
    );
  }
  checkPda(preflight, reversal, expectedReversal, 'The reversal account');
  checkAccountFree(preflight, reversed, 'A reversal for this sequence');
  preflight.unverified.push(
    'Not mirrored: the attestation hash and proof address, the proof’s source program and chain IDs, the destination cancellation PDA under the destination program, the token registry and mint matching the outgoing message, the refund account owner, the native/wrapped operation, a zero amount, and the vault balance'
  );

  const headline = preflightHeadline(preflight, loading, {
    subtitle: `Returns a cancelled ${symbol ?? 'token'} transfer to its sender — irreversible`,
    tone: 'red',
  });

  return (
    <SummaryShell
      icon="↩️"
      title="Reverse Outbound Transfer"
      subtitle={headline.subtitle}
      tone={headline.tone}
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

      <BridgePreflightBlock preflight={preflight} loading={loading} />

      <DetailBlock>
        {outgoingMsg && <AddressWithButtons address={outgoingMsg} label="Outgoing message" />}
        {proofAddress && <AddressWithButtons address={proofAddress} label="Cancellation proof" />}
        {admin && <AddressWithButtons address={admin} label="Root" />}
      </DetailBlock>
    </SummaryShell>
  );
};
