import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { toNumber } from '@/lib/delegation/values';
import { DetailBlock, Field, SummaryShell, ValueChange, accountByName } from './shared';
import { useDelegationClusterInfo } from './hooks';

/** Rows shared by the cluster instructions: the tracked epoch and lock state. */
const ClusterState: React.FC<{ lastEpoch: number | null; lockedUntilSlot: number | null }> = ({
  lastEpoch,
  lockedUntilSlot,
}) => (
  <>
    {lastEpoch !== null && (
      <Field
        label="Last processed epoch"
        value={lastEpoch.toLocaleString()}
        hint="The bot skips any epoch at or below this number"
      />
    )}
    {lockedUntilSlot !== null && (
      <Field
        label="Lock held until slot"
        value={lockedUntilSlot === 0 ? 'Not locked' : lockedUntilSlot.toLocaleString()}
        tone={lockedUntilSlot === 0 ? undefined : 'amber'}
      />
    )}
  </>
);

/** `initialize_cluster_info` — one-time creation of the cluster tracking account. */
export const DelegationInitializeClusterInfoSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const clusterInfo = accountByName(instruction, 'cluster_info', 0);
  const payer = accountByName(instruction, 'payer', 1);

  return (
    <SummaryShell
      icon="🌐"
      title="Initialize Cluster Info"
      subtitle="Creates the account that tracks epoch processing and the bot's run lock — run once per deployment"
      tone="purple"
    >
      <DetailBlock>
        {clusterInfo && <AddressWithButtons address={clusterInfo} label="Cluster" />}
        {payer && <AddressWithButtons address={payer} label="Payer" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `update_cluster_info` — bot marks the current epoch as processed. */
export const DelegationUpdateClusterInfoSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { clusterInfo } = useDelegationClusterInfo(instruction, connection);
  const bot = accountByName(instruction, 'bot', 2);

  return (
    <SummaryShell
      icon="✔️"
      title="Update Cluster Info"
      subtitle="Marks the current epoch as fully processed by the delegation bot"
      tone="gray"
    >
      <DetailBlock>
        <ClusterState
          lastEpoch={clusterInfo ? toNumber(clusterInfo.last_updated_epoch) : null}
          lockedUntilSlot={null}
        />
        {bot && <AddressWithButtons address={bot} label="Bot" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `set_cluster_epoch` — admin override of the last-processed epoch, used to
 * re-run or skip an epoch.
 */
export const DelegationSetClusterEpochSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { clusterInfo } = useDelegationClusterInfo(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);

  const newEpoch = toNumber(instruction.args?.epoch);
  const currentEpoch = clusterInfo ? toNumber(clusterInfo.last_updated_epoch) : null;
  const changed = currentEpoch !== null && newEpoch !== null && currentEpoch !== newEpoch;
  const rewinding = changed && newEpoch! < currentEpoch!;

  return (
    <SummaryShell
      icon="⏭️"
      title="Set Cluster Epoch"
      subtitle={
        rewinding
          ? 'Rewinds the last-processed epoch, letting the bot re-run epochs it already handled'
          : 'Overrides the last-processed epoch, causing the bot to skip ahead'
      }
      tone="amber"
    >
      <DetailBlock>
        <Field
          label="Last processed epoch"
          hint="The bot skips any epoch at or below this number"
          value={
            changed ? (
              <ValueChange
                from={currentEpoch!.toLocaleString()}
                to={newEpoch!.toLocaleString()}
                tone="amber"
              />
            ) : (
              (newEpoch?.toLocaleString() ?? '—')
            )
          }
        />
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `acquire_epoch_lock` — bot claims exclusive processing of an epoch. */
export const DelegationAcquireEpochLockSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { clusterInfo } = useDelegationClusterInfo(instruction, connection);
  const bot = accountByName(instruction, 'bot', 2);

  const currentEpoch = toNumber(instruction.args?.current_epoch);
  const timeoutSlots = toNumber(instruction.args?.timeout_slots);

  return (
    <SummaryShell
      icon="🔒"
      title="Acquire Epoch Lock"
      subtitle="Claims exclusive rights to process an epoch so two bot instances can't run at once"
      tone="gray"
    >
      <DetailBlock>
        {currentEpoch !== null && <Field label="Epoch" value={currentEpoch.toLocaleString()} />}
        {timeoutSlots !== null && (
          <Field
            label="Timeout"
            value={`${timeoutSlots.toLocaleString()} slots`}
            hint="The lock expires automatically after this many slots"
          />
        )}
        <ClusterState
          lastEpoch={clusterInfo ? toNumber(clusterInfo.last_updated_epoch) : null}
          lockedUntilSlot={clusterInfo ? toNumber(clusterInfo.locked_until_slot) : null}
        />
        {bot && <AddressWithButtons address={bot} label="Bot" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `release_epoch_lock` — bot releases its own lock after finishing. */
export const DelegationReleaseEpochLockSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { clusterInfo } = useDelegationClusterInfo(instruction, connection);
  const bot = accountByName(instruction, 'bot', 2);

  return (
    <SummaryShell
      icon="🔓"
      title="Release Epoch Lock"
      subtitle="Releases the bot's processing lock so the next run can proceed"
      tone="green"
    >
      <DetailBlock>
        <ClusterState
          lastEpoch={clusterInfo ? toNumber(clusterInfo.last_updated_epoch) : null}
          lockedUntilSlot={clusterInfo ? toNumber(clusterInfo.locked_until_slot) : null}
        />
        {bot && <AddressWithButtons address={bot} label="Bot" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `force_release_lock` — admin break-glass for a lock left behind by a crashed bot. */
export const DelegationForceReleaseLockSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { clusterInfo } = useDelegationClusterInfo(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);
  const lockedUntilSlot = clusterInfo ? toNumber(clusterInfo.locked_until_slot) : null;

  return (
    <SummaryShell
      icon="🛠️"
      title="Force Release Epoch Lock"
      subtitle={
        lockedUntilSlot === 0
          ? 'Clears the processing lock — no lock is currently held'
          : 'Admin override that clears a stuck processing lock, e.g. one left behind by a crashed bot'
      }
      tone="amber"
    >
      <DetailBlock>
        <ClusterState
          lastEpoch={clusterInfo ? toNumber(clusterInfo.last_updated_epoch) : null}
          lockedUntilSlot={lockedUntilSlot}
        />
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};
