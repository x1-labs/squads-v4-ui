import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { useNativeSymbol } from '@/hooks/useNativeSymbol';
import { describeSchedule, scheduleName, toBigInt } from '@/lib/vesting/values';
import {
  DetailBlock,
  Field,
  NativeAmountField,
  SummaryShell,
  accountByName,
  readPubkey,
} from './shared';
import { useVaultBalance, useVestingTreasury, useZeroDataRent } from './hooks';

/** `initialize_treasury` — one-time creation of the treasury and its schedule. */
export const VestingInitializeTreasurySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
}) => {
  const schedule = scheduleName(instruction.args?.principal_schedule);
  const admin = accountByName(instruction, 'admin', 1);
  const vault = accountByName(instruction, 'liquid_vault', 2);

  return (
    <SummaryShell
      icon="🏦"
      title="Initialize Vesting Treasury"
      subtitle="Creates the treasury, fixes its principal schedule for good, and makes the signer admin"
      tone="purple"
    >
      <DetailBlock>
        <Field
          label="Principal schedule"
          value={schedule ?? 'Unknown'}
          hint={`${describeSchedule(schedule)}. This cannot be changed after initialization.`}
        />
        {admin && <AddressWithButtons address={admin} label="Admin (signer)" />}
        {vault && <AddressWithButtons address={vault} label="Liquid vault" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `pause(paused)` — freezes or resumes claims and grant changes. */
export const VestingPauseSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { treasury } = useVestingTreasury(instruction, connection);
  const pausing = instruction.args?.paused === true;
  const admin = accountByName(instruction, 'admin', 1);
  const isNoop = Boolean(treasury && treasury.paused === pausing);

  return (
    <SummaryShell
      icon={pausing ? '⏸️' : '▶️'}
      title={pausing ? 'Pause Vesting' : 'Unpause Vesting'}
      subtitle={
        isNoop
          ? `Already ${pausing ? 'paused' : 'unpaused'} — this proposal changes nothing`
          : pausing
            ? 'Stops all claims and every grant change until unpaused'
            : 'Reopens claims and grant changes'
      }
      tone={isNoop ? 'gray' : pausing ? 'red' : 'green'}
    >
      <DetailBlock>
        {treasury && (
          <Field
            label="Current state"
            value={treasury.paused ? 'Paused' : 'Active'}
            tone={treasury.paused ? 'red' : 'green'}
          />
        )}
        <div className="text-xs text-muted-foreground">
          While paused, beneficiaries cannot claim and the admin cannot create, cancel or reassign
          grants. Only pause and admin transfer still work.
        </div>
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `transfer_admin(new_admin)` — immediate, single-step admin handover. */
export const VestingTransferAdminSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { treasury } = useVestingTreasury(instruction, connection);
  const newAdmin = readPubkey(instruction.args?.new_admin);
  const signer = accountByName(instruction, 'admin', 1);
  const currentAdmin = treasury?.admin?.toBase58();
  const isNoop = Boolean(newAdmin && currentAdmin && newAdmin === currentAdmin);

  return (
    <SummaryShell
      icon="🔑"
      title="Transfer Vesting Admin"
      subtitle={
        isNoop
          ? 'Already the admin — this proposal changes nothing'
          : 'Immediately hands full admin control of the vesting treasury to a new key'
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
          Takes effect at once, with no acceptance step. The new admin must be able to sign — for a
          Squads handoff use the multisig&apos;s vault address, not the multisig account. The admin
          creates, cancels and reassigns grants, activates claims and pauses the program.
        </div>
        {signer && <AddressWithButtons address={signer} label="Signer" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `activate_claims` — one-way switch that opens claiming once the vault covers everything owed. */
export const VestingActivateClaimsSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const nativeSymbol = useNativeSymbol();
  const { treasury } = useVestingTreasury(instruction, connection);
  const vault = accountByName(instruction, 'liquid_vault', 2) ?? treasury?.liquid_vault?.toBase58();
  const { balance } = useVaultBalance(connection, vault);
  const rent = useZeroDataRent(connection);

  const outstanding = treasury ? toBigInt(treasury.total_outstanding) : null;
  const required = outstanding !== null && rent !== null ? outstanding + rent : null;
  const covered = required !== null && balance !== null ? balance >= required : null;
  const alreadyActive = treasury?.claims_active === true;

  return (
    <SummaryShell
      icon="🔓"
      title="Activate Claims"
      subtitle={
        alreadyActive
          ? 'Claims are already active — this proposal will fail'
          : covered === false
            ? 'The vault does not yet cover everything owed — this proposal will fail'
            : 'Opens claiming for every grant. This is one-way: claims cannot be turned off again'
      }
      tone={alreadyActive || covered === false ? 'gray' : 'green'}
    >
      <DetailBlock>
        <NativeAmountField
          label="Owed (total outstanding)"
          lamports={outstanding}
          symbol={nativeSymbol}
        />
        <NativeAmountField
          label="Vault balance"
          lamports={balance}
          symbol={nativeSymbol}
          tone={covered === false ? 'red' : covered ? 'green' : undefined}
          hint={
            required !== null
              ? `Must be at least owed + rent (${required.toLocaleString('en-US')} lamports)`
              : undefined
          }
        />
        {vault && <AddressWithButtons address={vault} label="Liquid vault" />}
      </DetailBlock>
    </SummaryShell>
  );
};
