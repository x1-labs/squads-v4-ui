import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { useNativeSymbol } from '@/hooks/useNativeSymbol';
import { formatNativeAmount } from '@/lib/utils/formatters';
import { getGrantPda } from '@/lib/vesting/pdas';
import {
  checkGrantSchedule,
  describeSchedule,
  enumVariantName,
  formatTimestamp,
  scheduleName,
  toBigInt,
  toNumber,
} from '@/lib/vesting/values';
import { VestingGrantAccount } from '@/lib/vesting/accounts';
import {
  DetailBlock,
  Field,
  NativeAmountField,
  SummaryShell,
  ValueChange,
  accountByName,
  readPubkey,
} from './shared';
import { useVaultBalance, useVestingGrant, useVestingTreasury, useZeroDataRent } from './hooks';

function hasClaims(grant: VestingGrantAccount): boolean {
  return (
    (toBigInt(grant.principal_claimed) ?? BigInt(0)) > BigInt(0) ||
    (toBigInt(grant.yield_claimed) ?? BigInt(0)) > BigInt(0)
  );
}

/** Totals and claim progress of an existing grant. */
const GrantState: React.FC<{ grant: VestingGrantAccount }> = ({ grant }) => {
  const nativeSymbol = useNativeSymbol();
  return (
    <>
      <Field label="Status" value={enumVariantName(grant.status) ?? '—'} />
      <NativeAmountField label="Principal" lamports={grant.principal_total} symbol={nativeSymbol} />
      <NativeAmountField
        label="Principal claimed"
        lamports={grant.principal_claimed}
        symbol={nativeSymbol}
      />
      <NativeAmountField label="Yield" lamports={grant.yield_total} symbol={nativeSymbol} />
      <NativeAmountField
        label="Yield claimed"
        lamports={grant.yield_claimed}
        symbol={nativeSymbol}
      />
      <Field
        label="Schedule"
        value={`${formatTimestamp(grant.start_ts)} → ${formatTimestamp(grant.end_ts)}`}
        hint={`Cliff ${formatTimestamp(grant.cliff_ts)}`}
      />
    </>
  );
};

/** `create_grant` — adds a vesting grant for a beneficiary. */
export const VestingCreateGrantSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const nativeSymbol = useNativeSymbol();
  const { treasury } = useVestingTreasury(instruction, connection);
  const vault = accountByName(instruction, 'liquid_vault', 3) ?? treasury?.liquid_vault?.toBase58();
  const { balance } = useVaultBalance(connection, treasury?.claims_active ? vault : undefined);
  const rent = useZeroDataRent(connection);

  const args = instruction.args ?? {};
  const grantId = toBigInt(args.grant_id);
  const beneficiary = readPubkey(args.beneficiary);
  const principal = toBigInt(args.principal_total);
  const yieldTotal = toBigInt(args.yield_total);
  const start = toNumber(args.start_ts);
  const cliff = toNumber(args.cliff_ts);
  const end = toNumber(args.end_ts);
  const schedule = treasury ? scheduleName(treasury.principal_schedule) : null;

  const scheduleCheck =
    start !== null && cliff !== null && end !== null
      ? checkGrantSchedule(schedule, start, cliff, end)
      : null;

  const grantAccount = accountByName(instruction, 'grant', 2);
  let pdaMismatch = false;
  if (grantAccount && grantId !== null) {
    try {
      pdaMismatch = getGrantPda(instruction.programId, grantId).toBase58() !== grantAccount;
    } catch {
      pdaMismatch = true;
    }
  }

  // After activation, a late grant must already be funded in the vault.
  const outstanding = treasury ? toBigInt(treasury.total_outstanding) : null;
  const grantTotal = principal !== null && yieldTotal !== null ? principal + yieldTotal : null;
  const requiredAfter =
    treasury?.claims_active && outstanding !== null && grantTotal !== null && rent !== null
      ? outstanding + grantTotal + rent
      : null;
  const underfunded = requiredAfter !== null && balance !== null && balance < requiredAfter;
  const willFail = scheduleCheck?.valid === false || underfunded || principal === BigInt(0);

  return (
    <SummaryShell
      icon="📝"
      title="Create Vesting Grant"
      subtitle={
        willFail
          ? 'This grant will be rejected by the program — see below'
          : `Grant #${grantId?.toString() ?? '?'} for ${grantTotal !== null ? formatNativeAmount(grantTotal, nativeSymbol) : '?'} (principal + yield)`
      }
      tone={willFail ? 'red' : 'blue'}
    >
      <DetailBlock>
        <Field label="Grant id" value={grantId?.toString() ?? '—'} />
        {beneficiary && <AddressWithButtons address={beneficiary} label="Beneficiary" />}
        <NativeAmountField label="Principal" lamports={principal} symbol={nativeSymbol} />
        <NativeAmountField
          label="Fixed yield"
          lamports={yieldTotal}
          symbol={nativeSymbol}
          hint="All of it becomes claimable at the cliff"
        />
        <Field label="Start" value={formatTimestamp(args.start_ts)} />
        <Field label="Cliff" value={formatTimestamp(args.cliff_ts)} />
        <Field label="End" value={formatTimestamp(args.end_ts)} />
        {schedule && (
          <Field label="Treasury schedule" value={schedule} hint={describeSchedule(schedule)} />
        )}
        {scheduleCheck && !scheduleCheck.valid && (
          <Field
            label="Schedule check"
            value="Will be rejected"
            tone="red"
            hint={scheduleCheck.problem}
          />
        )}
        {treasury?.claims_active && (
          <NativeAmountField
            label="Vault balance"
            lamports={balance}
            symbol={nativeSymbol}
            tone={underfunded ? 'red' : 'green'}
            hint={
              requiredAfter !== null
                ? `Claims are active, so the vault must already hold owed + this grant + rent (${requiredAfter.toLocaleString('en-US')} lamports)`
                : undefined
            }
          />
        )}
        {pdaMismatch && (
          <Field
            label="Grant account"
            value="Does not match the grant id"
            tone="red"
            hint="The grant account must be the PDA of [“grant”, grant_id]; the program will reject this"
          />
        )}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `cancel_grant` — cancels a grant nobody has claimed from yet. */
export const VestingCancelGrantSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const nativeSymbol = useNativeSymbol();
  const { grant, address } = useVestingGrant(instruction, connection, 2);
  const claimed = grant ? hasClaims(grant) : false;
  const total =
    grant && toBigInt(grant.principal_total) !== null && toBigInt(grant.yield_total) !== null
      ? toBigInt(grant.principal_total)! + toBigInt(grant.yield_total)!
      : null;

  return (
    <SummaryShell
      icon="🗑️"
      title="Cancel Vesting Grant"
      subtitle={
        claimed
          ? 'The beneficiary has already claimed — this proposal will fail'
          : 'Cancels the whole grant, including any part that has already vested'
      }
      tone={claimed ? 'gray' : 'red'}
    >
      <DetailBlock>
        {grant && (
          <>
            <Field label="Grant id" value={toBigInt(grant.grant_id)?.toString() ?? '—'} />
            <AddressWithButtons address={grant.beneficiary.toBase58()} label="Beneficiary" />
            <GrantState grant={grant} />
          </>
        )}
        <NativeAmountField
          label="Released from outstanding"
          lamports={total}
          symbol={nativeSymbol}
          hint="The lamports stay in the vault as surplus; the program has no withdrawal instruction yet"
        />
        {address && <AddressWithButtons address={address} label="Grant account" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `replace_beneficiary` — reassigns a grant nobody has claimed from yet. */
export const VestingReplaceBeneficiarySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { grant, address } = useVestingGrant(instruction, connection, 2);
  const next = readPubkey(instruction.args?.new_beneficiary);
  const current = grant?.beneficiary?.toBase58();
  const claimed = grant ? hasClaims(grant) : false;
  const isNoop = Boolean(next && current && next === current);

  return (
    <SummaryShell
      icon="🔁"
      title="Replace Grant Beneficiary"
      subtitle={
        claimed
          ? 'The beneficiary has already claimed — this proposal will fail'
          : isNoop
            ? 'Already the beneficiary — this proposal changes nothing'
            : 'Redirects all unclaimed principal and yield of this grant to a new address'
      }
      tone={claimed || isNoop ? 'gray' : 'orange'}
    >
      <DetailBlock>
        {current && next && !isNoop && (
          <Field
            label="Beneficiary"
            value={
              <ValueChange
                from={`${current.slice(0, 4)}…${current.slice(-4)}`}
                to={`${next.slice(0, 4)}…${next.slice(-4)}`}
              />
            }
          />
        )}
        {current && <AddressWithButtons address={current} label="Current beneficiary" />}
        {next && <AddressWithButtons address={next} label="New beneficiary" />}
        {grant && <GrantState grant={grant} />}
        {address && <AddressWithButtons address={address} label="Grant account" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `claim_principal` / `claim_yield` — a beneficiary withdrawing vested funds. */
export const VestingClaimSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  const nativeSymbol = useNativeSymbol();
  const isYield = /yield/i.test(instruction.instructionName);
  const beneficiary = accountByName(instruction, 'beneficiary', 3);
  const grant = accountByName(instruction, 'grant', 1);

  return (
    <SummaryShell
      icon="💸"
      title={isYield ? 'Claim Grant Yield' : 'Claim Grant Principal'}
      subtitle={`The beneficiary withdraws ${isYield ? 'fixed yield' : 'vested principal'} from the vault`}
      tone="teal"
    >
      <DetailBlock>
        <NativeAmountField
          label="Amount"
          lamports={instruction.args?.amount}
          symbol={nativeSymbol}
        />
        {beneficiary && <AddressWithButtons address={beneficiary} label="Beneficiary" />}
        {grant && <AddressWithButtons address={grant} label="Grant account" />}
      </DetailBlock>
    </SummaryShell>
  );
};
