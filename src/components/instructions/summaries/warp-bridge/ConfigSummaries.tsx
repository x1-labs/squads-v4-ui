import React from 'react';
import { PublicKey } from '@solana/web3.js';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { formatNativeAmount } from '@/lib/utils/formatters';
import { useNativeSymbol } from '@/hooks/useNativeSymbol';
import {
  describeRole,
  formatBps,
  formatChainId,
  formatPauseReason,
  toBigInt,
  toNumber,
} from '@/lib/warpBridge/values';
import {
  GuardianList,
  DetailBlock,
  Field,
  SummaryShell,
  ValueChange,
  accountByName,
} from './shared';
import { useBridgeConfig, useBridgeRoles } from './hooks';

function readPubkey(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value === 'string') return value;
  try {
    return new PublicKey(value as any).toBase58();
  } catch {
    return undefined;
  }
}

/** `initialize` — one-time creation of the bridge config. */
export const BridgeInitializeSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  const nativeSymbol = useNativeSymbol();
  const guardians = (instruction.args?.guardians ?? []).map((g: unknown) => readPubkey(g) ?? '?');
  const threshold = toNumber(instruction.args?.threshold);
  const config = accountByName(instruction, 'config', 0);
  const admin = accountByName(instruction, 'admin', 1);
  const feeCollector = readPubkey(instruction.args?.fee_collector);

  return (
    <SummaryShell
      icon="🚀"
      title="Initialize Bridge"
      subtitle={`Creates the bridge config with a ${threshold ?? '?'}-of-${guardians.length} guardian set — run once per deployment`}
      tone="purple"
    >
      <DetailBlock>
        {config && <AddressWithButtons address={config} label="Config" />}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
        <Field
          label="Flat fee"
          value={formatNativeAmount(
            toBigInt(instruction.args?.flat_fee_lamports) ?? 0,
            nativeSymbol
          )}
          hint="Charged per bridge operation, in native currency"
        />
        <Field label="Percentage fee" value={formatBps(instruction.args?.percentage_fee_bps)} />
        {feeCollector && <AddressWithButtons address={feeCollector} label="Fees to" />}
      </DetailBlock>
      <DetailBlock>
        <Field
          label="Threshold"
          value={`${threshold ?? '?'} of ${guardians.length}`}
          hint="Guardian signatures required to approve an incoming transfer"
        />
        <GuardianList guardians={guardians} />
      </DetailBlock>
    </SummaryShell>
  );
};

/** `set_fees` — global bridge fees, charged in the chain's native currency. */
export const BridgeSetFeesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const nativeSymbol = useNativeSymbol();
  const { config } = useBridgeConfig(instruction, connection);
  const admin = accountByName(instruction, 'admin', 1);

  const flatFee = toBigInt(instruction.args?.flat_fee_lamports);
  const bps = toNumber(instruction.args?.percentage_fee_bps);
  const currentFlat = config ? toBigInt(config.flat_fee_lamports) : null;
  const currentBps = config ? toNumber(config.percentage_fee_bps) : null;

  const flatChanged = currentFlat !== null && flatFee !== null && currentFlat !== flatFee;
  const bpsChanged = currentBps !== null && bps !== null && currentBps !== bps;
  const anyChange = flatChanged || bpsChanged;

  return (
    <SummaryShell
      icon="💰"
      title="Set Bridge Fees"
      subtitle={
        config && !anyChange
          ? 'No change — both fees match the current config'
          : 'Updates the fees charged on every bridge operation'
      }
      tone={anyChange ? 'amber' : 'gray'}
    >
      <DetailBlock>
        <Field
          label="Flat fee"
          hint="Charged once per bridge operation, in native currency"
          value={
            flatChanged ? (
              <ValueChange
                from={formatNativeAmount(currentFlat!, nativeSymbol)}
                to={formatNativeAmount(flatFee!, nativeSymbol)}
              />
            ) : (
              formatNativeAmount(flatFee ?? 0, nativeSymbol)
            )
          }
        />
        <Field
          label="Percentage fee"
          hint="Share of each transfer, in basis points"
          value={
            bpsChanged ? (
              <ValueChange from={formatBps(currentBps)} to={formatBps(bps)} />
            ) : (
              formatBps(bps)
            )
          }
        />
        {config && (
          <Field
            label="Fees to"
            value={<span className="break-all text-xs">{config.fee_collector.toBase58()}</span>}
          />
        )}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `set_chain_id` — identifies which chain this deployment is. The program
 * validates sequence encoding against it, so a wrong value halts transfers.
 */
export const BridgeSetChainIdSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config } = useBridgeConfig(instruction, connection);
  const admin = accountByName(instruction, 'admin', 1);

  const chainId = toNumber(instruction.args?.chain_id);
  const currentChainId = config ? toNumber(config.chain_id) : null;
  const changed = currentChainId !== null && chainId !== null && currentChainId !== chainId;

  return (
    <SummaryShell
      icon="🔗"
      title="Set Chain ID"
      subtitle={
        changed
          ? 'Changes which chain this deployment identifies as — mismatched IDs halt transfers in both directions'
          : 'Sets which chain this deployment identifies as'
      }
      tone={changed ? 'red' : 'blue'}
    >
      <DetailBlock>
        <Field
          label="Chain"
          hint="Used to validate sequence-number encoding on bridge-in and bridge-out"
          value={
            changed ? (
              <ValueChange
                from={formatChainId(currentChainId)}
                to={formatChainId(chainId)}
                tone="red"
              />
            ) : (
              formatChainId(chainId)
            )
          }
        />
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `transfer_admin` — hands over full admin control of the bridge. */
export const BridgeTransferAdminSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config } = useBridgeConfig(instruction, connection);
  const newAdmin = readPubkey(instruction.args?.new_admin);
  const signer = accountByName(instruction, 'admin', 1);
  const currentAdmin = config?.admin?.toBase58();
  const isNoop = Boolean(newAdmin && currentAdmin && newAdmin === currentAdmin);

  return (
    <SummaryShell
      icon="🔑"
      title="Transfer Bridge Admin"
      subtitle={
        isNoop
          ? 'Already the admin — this proposal changes nothing'
          : 'Hands full admin control of the bridge to a new key'
      }
      tone={isNoop ? 'gray' : 'red'}
    >
      <DetailBlock>
        {currentAdmin && (
          <Field
            label="Current admin"
            value={<span className="break-all text-xs">{currentAdmin}</span>}
          />
        )}
        {newAdmin && <AddressWithButtons address={newAdmin} label="New admin" />}
        <div className="text-xs text-muted-foreground">
          The admin can pause the bridge, rotate guardians, change fees, and register or deregister
          tokens. Transferring it is irreversible without the new key&apos;s cooperation.
        </div>
        {signer && <AddressWithButtons address={signer} label="Signer" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `pause` — halts all bridging, recording who paused it and why. */
export const BridgePauseSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config } = useBridgeConfig(instruction, connection);
  const authority = accountByName(instruction, 'authority', 2);
  const alreadyPaused = config?.paused === true;

  return (
    <SummaryShell
      icon="⏸️"
      title="Pause Bridge"
      subtitle={
        alreadyPaused
          ? 'The bridge is already paused — this proposal changes nothing'
          : 'Halts all bridging in and out until the bridge is unpaused'
      }
      tone={alreadyPaused ? 'gray' : 'red'}
    >
      <DetailBlock>
        <Field label="Reason" value={formatPauseReason(instruction.args?.reason)} />
        {config && (
          <Field
            label="Current state"
            value={config.paused ? 'Paused' : 'Active'}
            tone={config.paused ? 'red' : 'green'}
          />
        )}
        {authority && <AddressWithButtons address={authority} label="Authority" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `unpause` — resumes bridging. */
export const BridgeUnpauseSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config } = useBridgeConfig(instruction, connection);
  const admin = accountByName(instruction, 'admin', 1);
  const isPaused = config?.paused === true;

  return (
    <SummaryShell
      icon="▶️"
      title="Unpause Bridge"
      subtitle={
        config && !isPaused
          ? 'The bridge is not paused — this proposal changes nothing'
          : 'Resumes bridging in and out'
      }
      tone={config && !isPaused ? 'gray' : 'green'}
    >
      <DetailBlock>
        {config && isPaused && (
          <>
            <Field label="Paused for" value={formatPauseReason(config.pause_reason)} />
            <AddressWithButtons address={config.paused_by.toBase58()} label="Paused by" />
          </>
        )}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `initialize_roles` — one-time creation of the delegated-roles account. */
export const BridgeInitializeRolesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const roles = accountByName(instruction, 'roles', 1);
  const admin = accountByName(instruction, 'admin', 2);

  return (
    <SummaryShell
      icon="🧑‍🤝‍🧑"
      title="Initialize Roles"
      subtitle="Creates the account holding delegated pauser, fee-manager and registrar keys — run once per deployment"
      tone="indigo"
    >
      <DetailBlock>
        {roles && <AddressWithButtons address={roles} label="Roles" />}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `set_role` — grants or revokes one delegated role. */
export const BridgeSetRoleSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { roles } = useBridgeRoles(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);

  const role = describeRole(instruction.args?.role_type);
  const newHolder = readPubkey(instruction.args?.pubkey);
  const revoking = instruction.args?.pubkey === null || instruction.args?.pubkey === undefined;

  const currentHolder = roles && role.field ? readPubkey(roles[role.field]) : undefined;

  return (
    <SummaryShell
      icon={revoking ? '🔒' : '🔑'}
      title={revoking ? `Revoke ${role.label} Role` : `Grant ${role.label} Role`}
      subtitle={revoking ? `Removes the ${role.label.toLowerCase()} delegation` : role.description}
      tone={revoking ? 'amber' : 'indigo'}
    >
      <DetailBlock>
        <Field label="Role" value={role.label} hint={role.description} />
        {roles && (
          <Field
            label="Current holder"
            value={
              currentHolder ? (
                <span className="break-all text-xs">{currentHolder}</span>
              ) : (
                <span className="text-muted-foreground">Unset</span>
              )
            }
          />
        )}
        {newHolder && <AddressWithButtons address={newHolder} label="New holder" />}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `set_v1_bridge_in_disabled` — retires the legacy single-transaction bridge-in
 * path once staged v2 consensus is live.
 */
export const BridgeSetV1DisabledSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config } = useBridgeConfig(instruction, connection);
  const admin = accountByName(instruction, 'admin', 1);

  const disabled = instruction.args?.disabled === true;
  const currentlyDisabled = config?.v1_in_disabled === true;
  const changed = config !== null && currentlyDisabled !== disabled;

  return (
    <SummaryShell
      icon={disabled ? '🛑' : '↩️'}
      title={disabled ? 'Disable Legacy Bridge-In' : 'Re-enable Legacy Bridge-In'}
      subtitle={
        config && !changed
          ? `Legacy bridge-in is already ${disabled ? 'disabled' : 'enabled'} — this proposal changes nothing`
          : disabled
            ? 'Retires the v1 bridge-in path; only staged v2 guardian consensus will be accepted'
            : 'Allows the legacy v1 bridge-in path again alongside staged v2 consensus'
      }
      tone={config && !changed ? 'gray' : disabled ? 'amber' : 'red'}
    >
      <DetailBlock>
        <Field
          label="Legacy bridge-in"
          hint="v1 accepts guardian signatures in one transaction; v2 stages them in a signature set first"
          value={
            changed ? (
              <ValueChange
                from={currentlyDisabled ? 'Disabled' : 'Enabled'}
                to={disabled ? 'Disabled' : 'Enabled'}
              />
            ) : disabled ? (
              'Disabled'
            ) : (
              'Enabled'
            )
          }
        />
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `migrate_config` — reallocates the config account to the current layout. */
export const BridgeMigrateConfigSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { config } = useBridgeConfig(instruction, connection);
  const admin = accountByName(instruction, 'admin', 1);

  return (
    <SummaryShell
      icon="📦"
      title="Migrate Bridge Config"
      subtitle="Upgrades the config account to the current layout; existing settings are preserved"
      tone="amber"
    >
      <DetailBlock>
        {config && (
          <>
            <Field label="Chain" value={formatChainId(config.chain_id)} />
            <Field
              label="Guardians"
              value={`${toNumber(config.threshold) ?? '?'} of ${toNumber(config.num_guardians) ?? '?'}`}
            />
            <Field
              label="Bridge state"
              value={config.paused ? 'Paused' : 'Active'}
              tone={config.paused ? 'red' : 'green'}
            />
          </>
        )}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};
