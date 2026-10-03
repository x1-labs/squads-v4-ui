import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { useNativeSymbol } from '@/hooks/useNativeSymbol';
import { getLiquidVaultPda, getTreasuryPda } from '@/lib/vesting/pdas';
import {
  VESTING_ERRORS,
  checkAccountFree,
  checkAdminGuards,
  checkCoverage,
  checkTreasuryAccount,
  checkVaultAccount,
  emptyPreflight,
} from '@/lib/vesting/preflight';
import { describeSchedule, scheduleName } from '@/lib/vesting/values';
import {
  DetailBlock,
  Field,
  NativeAmountField,
  PreflightBlock,
  SummaryShell,
  accountByName,
  preflightHeadline,
  readPubkeyArg,
} from './shared';
import {
  treasuryFacts,
  useAccountExists,
  useVaultBalance,
  useVestingTreasury,
  useZeroDataRent,
} from './hooks';

/** `initialize_treasury` — one-time creation of the treasury and its schedule. */
export const VestingInitializeTreasurySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const treasuryPda = getTreasuryPda(instruction.programId).toBase58();
  // `init` fails if the treasury already exists; a failed read stays unverified.
  const { exists, loading } = useAccountExists(connection, treasuryPda);
  const schedule = scheduleName(instruction.args?.principal_schedule);
  const admin = accountByName(instruction, 'admin', 1);
  const vault = accountByName(instruction, 'liquid_vault', 2);

  const preflight = emptyPreflight();
  checkTreasuryAccount(
    preflight,
    accountByName(instruction, 'treasury', 0),
    getTreasuryPda(instruction.programId).toBase58()
  );
  checkAccountFree(preflight, exists, 'This deployment’s treasury');
  checkVaultAccount(preflight, null, vault, getLiquidVaultPda(instruction.programId).toBase58());
  const headline = preflightHeadline(preflight, loading, {
    subtitle:
      'Creates the treasury, fixes its principal schedule for good, and makes the signer admin',
    tone: 'purple',
  });

  return (
    <SummaryShell
      icon="🏦"
      title="Initialize Vesting Treasury"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <PreflightBlock preflight={preflight} loading={loading} />
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

/** `pause(paused)` — freezes or resumes claims and grant changes. Works while paused. */
export const VestingPauseSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { treasury, loading } = useVestingTreasury(instruction, connection);
  const pausing = instruction.args?.paused === true;
  const admin = accountByName(instruction, 'admin', 1);

  const preflight = emptyPreflight();
  checkTreasuryAccount(
    preflight,
    accountByName(instruction, 'treasury', 0),
    getTreasuryPda(instruction.programId).toBase58()
  );
  checkAdminGuards(preflight, treasuryFacts(treasury), admin, false);
  const isNoop = Boolean(treasury && treasury.paused === pausing);
  const headline = preflightHeadline(preflight, loading, {
    subtitle: isNoop
      ? `Already ${pausing ? 'paused' : 'unpaused'} — this proposal changes nothing`
      : pausing
        ? 'Stops all claims and every grant change until unpaused'
        : 'Reopens claims and grant changes',
    tone: isNoop ? 'gray' : pausing ? 'red' : 'green',
  });

  return (
    <SummaryShell
      icon={pausing ? '⏸️' : '▶️'}
      title={pausing ? 'Pause Vesting' : 'Unpause Vesting'}
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <PreflightBlock preflight={preflight} loading={loading} />
        {treasury && (
          <Field
            label="Current state"
            value={treasury.paused ? 'Paused' : 'Active'}
            tone={treasury.paused ? 'red' : 'green'}
          />
        )}
        <div className="text-xs text-muted-foreground">
          While paused, beneficiaries cannot claim and the admin cannot create, cancel or reassign
          grants or activate claims. Pause and admin transfer still work.
        </div>
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `transfer_admin(new_admin)` — immediate, single-step admin handover. Works while paused. */
export const VestingTransferAdminSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { treasury, loading } = useVestingTreasury(instruction, connection);
  const newAdmin = readPubkeyArg(instruction.args?.new_admin);
  const signer = accountByName(instruction, 'admin', 1);
  const currentAdmin = treasury?.admin?.toBase58();

  const preflight = emptyPreflight();
  checkTreasuryAccount(
    preflight,
    accountByName(instruction, 'treasury', 0),
    getTreasuryPda(instruction.programId).toBase58()
  );
  checkAdminGuards(preflight, treasuryFacts(treasury), signer, false);
  const isNoop = Boolean(newAdmin && currentAdmin && newAdmin === currentAdmin);
  const headline = preflightHeadline(preflight, loading, {
    subtitle: isNoop
      ? 'Already the admin — this proposal changes nothing'
      : 'Immediately hands full admin control of the vesting treasury to a new key',
    tone: isNoop ? 'gray' : 'red',
  });

  return (
    <SummaryShell
      icon="🔑"
      title="Transfer Vesting Admin"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <PreflightBlock preflight={preflight} loading={loading} />
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
  const { treasury, loading: treasuryLoading } = useVestingTreasury(instruction, connection);
  const facts = treasuryFacts(treasury);
  const signer = accountByName(instruction, 'admin', 1);
  const vault = accountByName(instruction, 'liquid_vault', 2) ?? facts?.liquidVault;
  const { balance, loading: balanceLoading } = useVaultBalance(connection, vault);
  const { rent, loading: rentLoading } = useZeroDataRent(connection);
  const loading = treasuryLoading || balanceLoading || rentLoading;

  const required =
    facts?.outstanding !== null && facts?.outstanding !== undefined && rent !== null
      ? facts.outstanding + rent
      : null;

  const preflight = emptyPreflight();
  checkTreasuryAccount(
    preflight,
    accountByName(instruction, 'treasury', 0),
    getTreasuryPda(instruction.programId).toBase58()
  );
  checkAdminGuards(preflight, facts, signer, true);
  if (facts?.claimsActive) {
    preflight.rejections.push({
      error: 'InvalidState',
      code: VESTING_ERRORS.InvalidState,
      reason: 'Claims are already active',
    });
  }
  checkVaultAccount(
    preflight,
    facts,
    accountByName(instruction, 'liquid_vault', 2),
    getLiquidVaultPda(instruction.programId).toBase58()
  );
  checkCoverage(preflight, balance, required, 'everything owed plus rent');
  const headline = preflightHeadline(preflight, loading, {
    subtitle: 'Opens claiming for every grant. This is one-way: claims cannot be turned off again',
    tone: 'green',
  });

  return (
    <SummaryShell
      icon="🔓"
      title="Activate Claims"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <PreflightBlock preflight={preflight} loading={loading} />
        <NativeAmountField
          label="Owed (total outstanding)"
          lamports={facts?.outstanding}
          symbol={nativeSymbol}
        />
        <NativeAmountField
          label="Vault balance"
          lamports={balance}
          symbol={nativeSymbol}
          hint={
            required !== null
              ? `Must be at least owed + rent (${required.toLocaleString()} lamports)`
              : undefined
          }
        />
        {vault && <AddressWithButtons address={vault} label="Liquid vault" />}
      </DetailBlock>
    </SummaryShell>
  );
};
