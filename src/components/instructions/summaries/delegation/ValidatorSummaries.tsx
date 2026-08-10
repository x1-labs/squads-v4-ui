import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import {
  DELEGATION_CRITERIA,
  VALIDATOR_STATUSES,
  enumVariantName,
  formatBasisPoints,
  toNumber,
} from '@/lib/delegation/values';
import {
  DetailBlock,
  Field,
  SummaryShell,
  Tone,
  ValidatorTarget,
  ValueChange,
  accountByName,
} from './shared';
import { useDelegationConfig, useDelegationValidator } from './hooks';
import { DelegationConfigAccount } from '@/lib/delegation/accounts';

/** Describe a `ValidatorStatus` enum value, falling back to the raw variant. */
function describeStatus(value: unknown): { label: string; description?: string } {
  const variant = enumVariantName(value);
  if (!variant) return { label: 'Unknown' };
  return VALIDATOR_STATUSES[variant] ?? { label: variant };
}

const STATUS_TONE: Record<string, Tone> = {
  Approved: 'green',
  Rejected: 'red',
  Pending: 'amber',
};

/**
 * `create_validator` — admin registers a validator record with an initial status.
 */
export const DelegationCreateValidatorSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { voteAccount, validatorPda } = useDelegationValidator(instruction, connection);
  const status = describeStatus(instruction.args?.status);

  return (
    <SummaryShell
      icon="➕"
      title="Create Validator Record"
      subtitle={`Registers a validator with the delegation program as ${status.label}`}
      tone="blue"
    >
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        <Field
          label="Initial status"
          value={status.label}
          hint={status.description}
          tone={STATUS_TONE[status.label]}
        />
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `apply_validator` — a validator operator self-registers, creating a Pending record.
 */
export const DelegationApplyValidatorSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { voteAccount, validatorPda } = useDelegationValidator(instruction, connection);
  const signer = accountByName(instruction, 'signer', 2);

  return (
    <SummaryShell
      icon="📝"
      title="Apply to Delegation Program"
      subtitle="Creates a pending application for review — no stake is delegated yet"
      tone="blue"
    >
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        {signer && <AddressWithButtons address={signer} label="Applicant" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** Shared body for the no-argument approve / reject / remove instructions. */
const ValidatorDecisionSummary: React.FC<
  InstructionSummaryProps & {
    icon: string;
    title: string;
    subtitle: string;
    tone: Tone;
    adminAccount?: string;
  }
> = ({ instruction, connection, icon, title, subtitle, tone, adminAccount = 'admin' }) => {
  const { voteAccount, validatorPda, info } = useDelegationValidator(instruction, connection);
  const admin = accountByName(instruction, adminAccount, 1);
  const currentStatus = info ? describeStatus(info.status) : null;

  return (
    <SummaryShell icon={icon} title={title} subtitle={subtitle} tone={tone}>
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        {currentStatus && (
          <Field
            label="Current status"
            value={currentStatus.label}
            tone={STATUS_TONE[currentStatus.label]}
          />
        )}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `approve_validator` — makes a validator eligible to receive delegated stake. */
export const DelegationApproveValidatorSummary: React.FC<InstructionSummaryProps> = (props) => (
  <ValidatorDecisionSummary
    {...props}
    icon="✅"
    title="Approve Validator"
    subtitle="Makes this validator eligible to receive stake from the delegation program"
    tone="green"
  />
);

/** `reject_validator` — marks a validator ineligible for delegation. */
export const DelegationRejectValidatorSummary: React.FC<InstructionSummaryProps> = (props) => (
  <ValidatorDecisionSummary
    {...props}
    icon="🚫"
    title="Reject Validator"
    subtitle="Marks this validator ineligible — any delegated stake will be withdrawn"
    tone="red"
  />
);

/** `remove_validator` — closes the validator record entirely. */
export const DelegationRemoveValidatorSummary: React.FC<InstructionSummaryProps> = (props) => (
  <ValidatorDecisionSummary
    {...props}
    icon="🗑️"
    title="Remove Validator"
    subtitle="Closes this validator's record and drops it from the delegation program"
    tone="red"
  />
);

/**
 * `withdraw_validator` — an operator withdraws their own validator record and
 * reclaims its rent.
 */
export const DelegationWithdrawValidatorSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { voteAccount, validatorPda } = useDelegationValidator(instruction, connection);
  const signer = accountByName(instruction, 'signer', 2);
  const refundee = accountByName(instruction, 'refundee', 3);

  return (
    <SummaryShell
      icon="↩️"
      title="Withdraw Validator"
      subtitle="Operator removes their own validator record and reclaims its rent"
      tone="amber"
    >
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        {signer && <AddressWithButtons address={signer} label="Signer" />}
        {refundee && <AddressWithButtons address={refundee} label="Rent to" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `update_validator_status` — set a validator's status directly, showing the
 * transition from its current on-chain status where available.
 */
export const DelegationUpdateValidatorStatusSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { voteAccount, validatorPda, info } = useDelegationValidator(instruction, connection);
  const admin = accountByName(instruction, 'admin', 1);
  const newStatus = describeStatus(instruction.args?.new_status);
  const currentStatus = info ? describeStatus(info.status) : null;
  const isNoop = currentStatus?.label === newStatus.label;

  return (
    <SummaryShell
      icon="🔄"
      title="Update Validator Status"
      subtitle={
        isNoop
          ? `Already ${newStatus.label} — this proposal changes nothing`
          : currentStatus
            ? `Moves this validator from ${currentStatus.label} to ${newStatus.label}`
            : `Sets this validator to ${newStatus.label}`
      }
      tone={isNoop ? 'gray' : (STATUS_TONE[newStatus.label] ?? 'blue')}
    >
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        <Field
          label="Status"
          hint={newStatus.description}
          value={
            currentStatus && !isNoop ? (
              <ValueChange
                from={currentStatus.label}
                to={newStatus.label}
                tone={STATUS_TONE[newStatus.label] ?? 'amber'}
              />
            ) : (
              newStatus.label
            )
          }
          tone={currentStatus && !isNoop ? undefined : STATUS_TONE[newStatus.label]}
        />
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `update_validator_criteria` — the bot records which eligibility rules a
 * validator is currently failing. An empty list means it passes everything.
 */
export const DelegationUpdateValidatorCriteriaSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { voteAccount, validatorPda } = useDelegationValidator(instruction, connection);
  const bot = accountByName(instruction, 'bot', 1);

  const rawCriteria = instruction.args?.failing_criteria;
  const criteria: string[] = Array.isArray(rawCriteria)
    ? rawCriteria.map((entry) => enumVariantName(entry) ?? 'Unknown')
    : [];

  return (
    <SummaryShell
      icon={criteria.length === 0 ? '🟢' : '⚠️'}
      title="Update Validator Criteria"
      subtitle={
        criteria.length === 0
          ? 'Validator now passes every delegation criterion'
          : `Validator is failing ${criteria.length} criteri${criteria.length === 1 ? 'on' : 'a'}`
      }
      tone={criteria.length === 0 ? 'green' : 'amber'}
    >
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        {criteria.length > 0 && (
          <div className="space-y-1 border-t border-border/50 pt-2">
            {criteria.map((criterion) => {
              const meta = DELEGATION_CRITERIA[criterion];
              return (
                <Field
                  key={criterion}
                  label="Failing"
                  value={meta?.label ?? criterion}
                  hint={meta?.description}
                  tone="amber"
                />
              );
            })}
          </div>
        )}
        {bot && <AddressWithButtons address={bot} label="Bot" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `update_validator_multiplier` — scales how much stake a validator receives
 * relative to its normal allocation (10000 bps = 100%).
 */
export const DelegationUpdateValidatorMultiplierSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { voteAccount, validatorPda, info } = useDelegationValidator(instruction, connection);
  const signer = accountByName(instruction, 'signer', 2);

  const newBps = toNumber(instruction.args?.stake_multiplier_bps);
  const currentBps = info ? toNumber(info.stake_multiplier_bps) : null;
  const changed = currentBps !== null && newBps !== null && currentBps !== newBps;

  return (
    <SummaryShell
      icon="⚖️"
      title="Update Stake Multiplier"
      subtitle={
        newBps === null
          ? 'Adjusts how much stake this validator receives'
          : newBps === 10000
            ? 'Returns this validator to its full normal stake allocation'
            : `Scales this validator's stake allocation to ${formatBasisPoints(newBps)} of normal`
      }
      tone="purple"
    >
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        <Field
          label="Multiplier"
          hint="10,000 bps = 100% of the validator's normal allocation"
          value={
            changed ? (
              <ValueChange
                from={formatBasisPoints(currentBps)}
                to={formatBasisPoints(newBps)}
                tone="purple"
              />
            ) : (
              `${formatBasisPoints(newBps)} (${newBps?.toLocaleString() ?? '—'} bps)`
            )
          }
        />
        {signer && <AddressWithButtons address={signer} label="Signer" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * Translate a raw removal score into the terms an approver needs to judge it.
 *
 * The score is penalty points, not a removal count: a removal adds
 * `strike_decay_epochs` points and each eligible epoch works one off. The raw
 * number alone says nothing about what the proposal does to the validator, so
 * derive the removal count and the delegation ceiling it imposes.
 */
function describeRemovalScore(
  score: number | null,
  config: DelegationConfigAccount | null
): { removals: number; capBps: number } | null {
  if (score === null || !config) return null;

  const decayEpochs = toNumber(config.strike_decay_epochs);
  const penaltyBps = toNumber(config.strike_penalty_bps);
  const minCapBps = toNumber(config.strike_min_cap_bps);
  if (!decayEpochs || !penaltyBps || minCapBps === null) return null;

  // Rounds up, matching `strike_tier` on-chain: a removal holds its full weight until
  // every one of its points is worked off. Rounding down here would tell a signer that a
  // score of 5 means one removal at an 80% ceiling when the program applies two at 60%.
  const removals = Math.ceil(score / decayEpochs);
  return {
    removals,
    capBps: Math.max(10000 - removals * penaltyBps, minCapBps),
  };
}

/**
 * `update_validator_removal_score` — records or works off the repeat-removal
 * penalty. Raising it lowers the validator's delegation ceiling and slows its
 * ramp back up; the bot lowers it by one for every epoch the validator stays
 * eligible.
 */
export const DelegationUpdateValidatorRemovalScoreSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { voteAccount, validatorPda, info } = useDelegationValidator(instruction, connection);
  const { config } = useDelegationConfig(instruction, connection);
  const signer = accountByName(instruction, 'signer', 2);

  const newScore = toNumber(instruction.args?.removal_score);
  const currentScore = info ? toNumber(info.removal_score) : null;
  const changed = currentScore !== null && newScore !== null && currentScore !== newScore;
  const increased = currentScore !== null && newScore !== null && newScore > currentScore;

  const next = describeRemovalScore(newScore, config);
  const current = describeRemovalScore(currentScore, config);

  return (
    <SummaryShell
      icon="⛔"
      title="Update Repeat Removal Penalty"
      subtitle={
        newScore === null
          ? "Adjusts this validator's repeat-removal penalty"
          : newScore === 0
            ? 'Clears the penalty and restores full delegation eligibility'
            : increased
              ? 'Penalises this validator for being removed again for poor performance'
              : "Works off part of this validator's repeat-removal penalty"
      }
      tone={increased ? 'red' : 'amber'}
    >
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        <Field
          label="Penalty points"
          hint="Also the number of good epochs left before the penalty clears"
          value={
            changed ? (
              <ValueChange
                from={currentScore?.toLocaleString() ?? '—'}
                to={newScore?.toLocaleString() ?? '—'}
                tone={increased ? 'red' : 'amber'}
              />
            ) : (
              (newScore?.toLocaleString() ?? '—')
            )
          }
        />
        {next && (
          <>
            <Field
              label="Recent removals"
              hint="Penalty points divided by the configured decay period"
              value={
                current && current.removals !== next.removals ? (
                  <ValueChange
                    from={String(current.removals)}
                    to={String(next.removals)}
                    tone={increased ? 'red' : 'amber'}
                  />
                ) : (
                  String(next.removals)
                )
              }
            />
            <Field
              label="Delegation ceiling"
              hint="Most stake this validator may receive while the penalty stands"
              value={
                current && current.capBps !== next.capBps ? (
                  <ValueChange
                    from={formatBasisPoints(current.capBps)}
                    to={formatBasisPoints(next.capBps)}
                    tone={increased ? 'red' : 'amber'}
                  />
                ) : (
                  formatBasisPoints(next.capBps)
                )
              }
            />
          </>
        )}
        {signer && <AddressWithButtons address={signer} label="Signer" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `update_stake_change_epoch` — the bot stamps the epoch in which it last
 * changed this validator's stake, which gates further rebalancing.
 */
export const DelegationUpdateStakeChangeEpochSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { voteAccount, validatorPda, info } = useDelegationValidator(instruction, connection);
  const bot = accountByName(instruction, 'bot', 2);
  const lastChange = info ? toNumber(info.last_stake_change_epoch) : null;

  return (
    <SummaryShell
      icon="⏱️"
      title="Update Stake Change Epoch"
      subtitle="Records that this validator's stake changed in the current epoch"
      tone="gray"
    >
      <DetailBlock>
        <ValidatorTarget voteAccount={voteAccount} validatorPda={validatorPda} />
        {lastChange !== null && (
          <Field label="Last change epoch" value={lastChange.toLocaleString()} />
        )}
        {bot && <AddressWithButtons address={bot} label="Bot" />}
      </DetailBlock>
    </SummaryShell>
  );
};
