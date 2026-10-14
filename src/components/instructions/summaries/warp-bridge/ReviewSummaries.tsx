import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { getBridgeRolesPda, getIncomingMsgPda } from '@/lib/warpBridge/accounts';
import {
  MANUAL_REVIEW_CLOCK_SKEW_SECONDS,
  MANUAL_REVIEW_PENDING,
  checkAuthority,
  checkHeldTransfer,
  checkPayoutAccounts,
  checkPda,
  checkSettleable,
  checkUnpausedForPayout,
  emptyPreflight,
  reject,
  resolveRolesSlot,
} from '@/lib/warpBridge/preflight';
import { describeSequenceRoute, formatUnixTime, toBigInt } from '@/lib/warpBridge/values';
import {
  BridgePreflightBlock,
  BridgeTokenTarget,
  DetailBlock,
  Field,
  SummaryShell,
  ValueChange,
  accountByName,
  preflightHeadline,
} from './shared';
import {
  useBridgeConfig,
  useBridgeFacts,
  useBridgeTokenFromRegistryAccount,
  useIncomingMsg,
} from './hooks';

/**
 * Manual review holds inbound transfers instead of paying them out on
 * delivery. Operators then release them, or set a release time after which
 * anyone may settle them. Whale-sized transfers are delayed the same way.
 *
 * Guards are mirrored in `@/lib/warpBridge/preflight` (manual_review.rs,
 * claim.rs).
 */

const PAYOUT_NOT_MIRRORED =
  'Not mirrored: the vault balance, vault and mint-authority accounts, and the native/wrapped operation used to pay out';

/** What a `release_at` value does to a held transfer. */
function describeReleaseAt(value: unknown): string {
  const releaseAt = toBigInt(value);
  if (releaseAt === null) return 'Sets the release time of a held transfer';
  if (releaseAt === MANUAL_REVIEW_PENDING) {
    return 'Holds the transfer for review with no release time, until an operator releases it';
  }
  if (releaseAt <= BigInt(0)) {
    return 'Makes the held transfer settleable now, by anyone, while manual review is off';
  }
  return `Held transfer becomes settleable at ${formatUnixTime(value)}, while manual review is off`;
}

/** `set_manual_review` — turns the inbound hold on or off for this chain. */
export const BridgeSetManualReviewSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
  priorInstructions,
}) => {
  const { facts, loading } = useBridgeFacts(instruction, connection, priorInstructions);
  const { config } = useBridgeConfig(instruction, connection);
  const authority = accountByName(instruction, 'authority', 2);

  const enabled = instruction.args?.enabled === true;
  const current = facts.manualReviewEnabled;
  const changed = current !== undefined && current !== enabled;

  const preflight = emptyPreflight();
  const roles = resolveRolesSlot(
    preflight,
    facts,
    accountByName(instruction, 'roles', 1),
    instruction.programId,
    getBridgeRolesPda(instruction.programId).toBase58()
  );
  // Enabling is an incident brake a pauser may pull; turning it off needs operations.
  checkAuthority(
    preflight,
    facts,
    authority,
    enabled ? 'pauser' : 'operations',
    'UnauthorizedManualReviewModeChange',
    roles
  );

  const headline = preflightHeadline(preflight, loading, {
    subtitle:
      current !== undefined && !changed
        ? `Manual review is already ${enabled ? 'enabled' : 'disabled'} — this proposal changes nothing`
        : enabled
          ? 'Holds every inbound transfer on this chain until an operator releases it or sets a release time'
          : `Transfers sent more than ${MANUAL_REVIEW_CLOCK_SKEW_SECONDS / 60} minutes after execution (and after any later existing cutoff) pay out on delivery again; earlier ones stay held`,
    tone: current !== undefined && !changed ? 'gray' : enabled ? 'amber' : 'green',
  });

  return (
    <SummaryShell
      icon={enabled ? '🔎' : '✅'}
      title={enabled ? 'Enable Manual Review' : 'Disable Manual Review'}
      subtitle={headline.subtitle}
      tone={headline.tone}
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
            hint={`Transfers sent at or before this time stay held even with review off; disabling moves it to at least execution time + ${MANUAL_REVIEW_CLOCK_SKEW_SECONDS} seconds`}
          />
        )}
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </DetailBlock>
      <BridgePreflightBlock preflight={preflight} loading={loading} />
    </SummaryShell>
  );
};

/** `set_delayed_release_maturity` — moves when a held transfer becomes settleable. */
export const BridgeSetDelayedReleaseMaturitySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
  priorInstructions,
}) => {
  const { facts, loading: factsLoading } = useBridgeFacts(
    instruction,
    connection,
    priorInstructions
  );
  const { incoming, loading: incomingLoading } = useIncomingMsg(
    instruction,
    connection,
    instruction.args?.source_seq
  );
  const loading = factsLoading || incomingLoading;
  const authority = accountByName(instruction, 'authority', 3);
  const incomingMsg = accountByName(instruction, 'incoming_msg', 2);
  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);
  const releaseAt = toBigInt(instruction.args?.release_at);

  const preflight = emptyPreflight();
  const roles = resolveRolesSlot(
    preflight,
    facts,
    accountByName(instruction, 'roles', 1),
    instruction.programId,
    getBridgeRolesPda(instruction.programId).toBase58()
  );
  checkAuthority(preflight, facts, authority, 'operations', 'UnauthorizedDelayedRelease', roles);
  checkPda(
    preflight,
    incomingMsg,
    seq !== null ? getIncomingMsgPda(instruction.programId, seq).toBase58() : undefined,
    'The incoming message account'
  );
  checkHeldTransfer(preflight, incoming);
  if (releaseAt === null) {
    preflight.unverified.push('Release time could not be decoded');
  } else if (releaseAt < BigInt(0)) {
    reject(preflight, 'InvalidDelay', 'The release time is negative');
  }

  const headline = preflightHeadline(preflight, loading, {
    subtitle: describeReleaseAt(instruction.args?.release_at),
    tone: 'amber',
  });

  return (
    <SummaryShell
      icon="⏱️"
      title="Set Release Time"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        <Field
          label="Release at"
          value={
            releaseAt === MANUAL_REVIEW_PENDING
              ? 'Held for review'
              : releaseAt !== null && releaseAt <= BigInt(0)
                ? 'Now'
                : formatUnixTime(instruction.args?.release_at)
          }
          hint="Settling also needs manual review to be off on this chain"
        />
        {incomingMsg && <AddressWithButtons address={incomingMsg} label="Incoming message" />}
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </DetailBlock>
      <BridgePreflightBlock preflight={preflight} loading={loading} />
    </SummaryShell>
  );
};

/** `release_delayed_inbound` — an operator pays out a held transfer now. */
export const BridgeReleaseDelayedInboundSummary: React.FC<InstructionSummaryProps> = ({
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
  const { incoming, loading: incomingLoading } = useIncomingMsg(
    instruction,
    connection,
    instruction.args?.source_seq
  );
  const {
    localMint,
    symbol,
    decimals,
    loading: tokenLoading,
  } = useBridgeTokenFromRegistryAccount(instruction, connection);
  const loading = factsLoading || incomingLoading || tokenLoading;
  const authority = accountByName(instruction, 'authority', 4);
  const recipient = accountByName(instruction, 'recipient', 5);
  const incomingMsg = accountByName(instruction, 'incoming_msg', 2);
  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);

  const preflight = emptyPreflight();
  const roles = resolveRolesSlot(
    preflight,
    facts,
    accountByName(instruction, 'roles', 1),
    instruction.programId,
    getBridgeRolesPda(instruction.programId).toBase58()
  );
  checkAuthority(preflight, facts, authority, 'operations', 'UnauthorizedDelayedRelease', roles);
  checkPda(
    preflight,
    incomingMsg,
    seq !== null ? getIncomingMsgPda(instruction.programId, seq).toBase58() : undefined,
    'The incoming message account'
  );
  checkUnpausedForPayout(preflight, facts, registryAddress);
  checkHeldTransfer(preflight, incoming);
  checkPayoutAccounts(
    preflight,
    incoming,
    {
      recipient,
      tokenMint: accountByName(instruction, 'token_mint', 7),
      registryMint: localMint,
    },
    'InvalidDelayedTransfer'
  );
  preflight.unverified.push(PAYOUT_NOT_MIRRORED);

  const headline = preflightHeadline(preflight, loading, {
    subtitle: 'Pays out a held transfer now, ahead of any release time',
    tone: 'green',
  });

  return (
    <SummaryShell
      icon="🔓"
      title="Release Held Transfer"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        {recipient && <AddressWithButtons address={recipient} label="Recipient" />}
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </DetailBlock>
      <BridgePreflightBlock preflight={preflight} loading={loading} />
    </SummaryShell>
  );
};

/** `settle_delayed` — anyone pays out a held transfer once it has matured. */
export const BridgeSettleDelayedSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
  priorInstructions,
}) => {
  const registryAddress = accountByName(instruction, 'token_registry', 1);
  const { facts, loading: factsLoading } = useBridgeFacts(
    instruction,
    connection,
    priorInstructions,
    registryAddress
  );
  const { incoming, loading: incomingLoading } = useIncomingMsg(
    instruction,
    connection,
    instruction.args?.source_seq
  );
  const {
    localMint,
    symbol,
    decimals,
    loading: tokenLoading,
  } = useBridgeTokenFromRegistryAccount(instruction, connection);
  const loading = factsLoading || incomingLoading || tokenLoading;
  const recipient = accountByName(instruction, 'recipient', 4);
  const incomingMsg = accountByName(instruction, 'incoming_msg', 2);
  const seq = toBigInt(instruction.args?.source_seq);
  const route = describeSequenceRoute(instruction.args?.source_seq);

  const preflight = emptyPreflight();
  checkPda(
    preflight,
    incomingMsg,
    seq !== null ? getIncomingMsgPda(instruction.programId, seq).toBase58() : undefined,
    'The incoming message account'
  );
  checkUnpausedForPayout(preflight, facts, registryAddress);
  checkSettleable(preflight, facts, incoming, Math.floor(Date.now() / 1000));
  checkPayoutAccounts(
    preflight,
    incoming,
    {
      recipient,
      tokenMint: accountByName(instruction, 'token_mint', 6),
      registryMint: localMint,
    },
    'MintMismatch'
  );
  preflight.unverified.push(PAYOUT_NOT_MIRRORED);

  const headline = preflightHeadline(preflight, loading, {
    subtitle: 'Pays out a held transfer whose release time has passed',
    tone: 'blue',
  });

  return (
    <SummaryShell
      icon="📬"
      title="Settle Matured Transfer"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <Field label="Source sequence" value={seq?.toString() ?? '—'} />
        {route && <Field label="Route" value={route} />}
        {recipient && <AddressWithButtons address={recipient} label="Recipient" />}
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
      </DetailBlock>
      <BridgePreflightBlock preflight={preflight} loading={loading} />
    </SummaryShell>
  );
};
