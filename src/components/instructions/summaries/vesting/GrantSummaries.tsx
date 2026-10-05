import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { useNativeSymbol } from '@/hooks/useNativeSymbol';
import { formatNativeAmount, shortenAddress } from '@/lib/utils/formatters';
import { getGrantPda, getLiquidVaultPda, getTreasuryPda } from '@/lib/vesting/pdas';
import {
  VESTING_ERRORS,
  checkAccountFree,
  checkAdminGuards,
  checkCoverage,
  checkGrantUntouched,
  checkTreasuryAccount,
  checkU64,
  checkVaultAccount,
  emptyPreflight,
  rejectConstraint,
} from '@/lib/vesting/preflight';
import {
  checkGrantSchedule,
  describeSchedule,
  enumVariantName,
  formatTimestamp,
  scheduleName,
  toBigInt,
} from '@/lib/vesting/values';
import { GRANT_ACCOUNT_SIZE, VestingGrantAccount } from '@/lib/vesting/accounts';
import {
  DetailBlock,
  Field,
  NativeAmountField,
  PreflightBlock,
  SummaryShell,
  ValueChange,
  accountByName,
  preflightHeadline,
  readPubkeyArg,
} from './shared';
import {
  grantFacts,
  treasuryFacts,
  useAccountExists,
  useRentExemption,
  useVaultBalance,
  useVestingGrant,
  useVestingTreasury,
  useZeroDataRent,
} from './hooks';

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

function grantPdaFor(programId: string, grantId: bigint | null): string | undefined {
  if (grantId === null) return undefined;
  try {
    return getGrantPda(programId, grantId).toBase58();
  } catch {
    return undefined;
  }
}

/** `create_grant` — adds a vesting grant for a beneficiary. */
export const VestingCreateGrantSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const nativeSymbol = useNativeSymbol();
  const { treasury, loading: treasuryLoading } = useVestingTreasury(instruction, connection);
  const facts = treasuryFacts(treasury);

  const args = instruction.args ?? {};
  const grantId = toBigInt(args.grant_id);
  const beneficiary = readPubkeyArg(args.beneficiary);
  const principal = toBigInt(args.principal_total);
  const yieldTotal = toBigInt(args.yield_total);
  const start = toBigInt(args.start_ts);
  const cliff = toBigInt(args.cliff_ts);
  const end = toBigInt(args.end_ts);
  const schedule = treasury ? scheduleName(treasury.principal_schedule) : null;
  const grantTotal = principal !== null && yieldTotal !== null ? principal + yieldTotal : null;

  const signer = accountByName(instruction, 'admin', 1);
  const grantAccount = accountByName(instruction, 'grant', 2);
  const vaultAccount = accountByName(instruction, 'liquid_vault', 3);
  const expectedGrant = grantPdaFor(instruction.programId, grantId);

  // An existing account at the grant PDA makes `init` fail.
  const { exists: grantExists, loading: grantLoading } = useAccountExists(
    connection,
    expectedGrant
  );
  // The admin pays the new grant account's rent (`payer = admin`).
  const { balance: payerBalance, loading: payerLoading } = useVaultBalance(connection, signer);
  const { rent: grantRent, loading: grantRentLoading } = useRentExemption(
    connection,
    GRANT_ACCOUNT_SIZE
  );
  // After activation, a late grant must already be funded in the vault.
  const needsCoverage = facts?.claimsActive === true;
  const { balance, loading: balanceLoading } = useVaultBalance(
    connection,
    needsCoverage ? (vaultAccount ?? facts?.liquidVault) : undefined
  );
  const { rent, loading: rentLoading } = useZeroDataRent(connection);
  const loading =
    treasuryLoading ||
    grantLoading ||
    balanceLoading ||
    rentLoading ||
    payerLoading ||
    grantRentLoading;

  const preflight = emptyPreflight();
  checkTreasuryAccount(
    preflight,
    accountByName(instruction, 'treasury', 0),
    getTreasuryPda(instruction.programId).toBase58()
  );
  checkAdminGuards(preflight, facts, signer, true);
  if (principal === BigInt(0)) {
    preflight.rejections.push({
      error: 'InvalidAmount',
      code: VESTING_ERRORS.InvalidAmount,
      reason: 'Principal must be greater than 0',
    });
  }
  if (start !== null && cliff !== null && end !== null) {
    const check = checkGrantSchedule(schedule, start, cliff, end);
    if (check.status === 'invalid') {
      preflight.rejections.push({
        error: 'InvalidSchedule',
        code: VESTING_ERRORS.InvalidSchedule,
        reason: check.problem,
      });
    } else if (check.status === 'unverified') {
      preflight.unverified.push(`Schedule rules not verified: ${check.problem}`);
    }
  }
  checkU64(preflight, grantTotal, 'Principal plus yield');
  checkU64(
    preflight,
    facts?.outstanding != null && grantTotal !== null ? facts.outstanding + grantTotal : null,
    'Total outstanding after this grant'
  );
  if (!expectedGrant) {
    preflight.unverified.push('Grant id could not be decoded — grant account not verified');
  } else {
    if (grantAccount && grantAccount !== expectedGrant) {
      rejectConstraint(
        preflight,
        'ConstraintSeeds',
        'The grant account is not the PDA of ["grant", grant_id]'
      );
    }
    checkAccountFree(preflight, grantExists, `Grant #${grantId?.toString()}`);
  }
  if (signer) {
    if (payerBalance === null || grantRent === null) {
      preflight.unverified.push(
        'Admin balance could not be read — rent for the new grant account not verified'
      );
    } else if (payerBalance < grantRent) {
      preflight.rejections.push({
        error: 'InsufficientFundsForRent',
        reason: `The admin cannot pay the grant account's rent (${grantRent.toLocaleString()} lamports)`,
      });
    }
  }
  checkVaultAccount(
    preflight,
    facts,
    vaultAccount,
    getLiquidVaultPda(instruction.programId).toBase58()
  );
  if (needsCoverage) {
    const required =
      facts?.outstanding != null && grantTotal !== null && rent !== null
        ? facts.outstanding + grantTotal + rent
        : null;
    checkCoverage(preflight, balance, required, 'everything owed plus this grant plus rent');
  }

  const headline = preflightHeadline(preflight, loading, {
    subtitle: `Grant #${grantId?.toString() ?? '?'} for ${
      grantTotal !== null ? formatNativeAmount(grantTotal, nativeSymbol) : '?'
    } (principal + yield)`,
    tone: 'blue',
  });

  return (
    <SummaryShell
      icon="📝"
      title="Create Vesting Grant"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <PreflightBlock preflight={preflight} loading={loading} />
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
        {needsCoverage && (
          <NativeAmountField
            label="Vault balance"
            lamports={balance}
            symbol={nativeSymbol}
            hint="Claims are active, so the vault must already hold owed + this grant + rent"
          />
        )}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `cancel_grant` — cancels an Active grant nobody has claimed from yet. */
export const VestingCancelGrantSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const nativeSymbol = useNativeSymbol();
  const { treasury, loading: treasuryLoading } = useVestingTreasury(instruction, connection);
  const { grant, address, loading: grantLoading } = useVestingGrant(instruction, connection, 2);
  const loading = treasuryLoading || grantLoading;

  const preflight = emptyPreflight();
  checkTreasuryAccount(
    preflight,
    accountByName(instruction, 'treasury', 0),
    getTreasuryPda(instruction.programId).toBase58()
  );
  checkAdminGuards(
    preflight,
    treasuryFacts(treasury),
    accountByName(instruction, 'admin', 1),
    true
  );
  checkGrantUntouched(preflight, grantFacts(grant));

  const principal = grant ? toBigInt(grant.principal_total) : null;
  const yieldTotal = grant ? toBigInt(grant.yield_total) : null;
  const total = principal !== null && yieldTotal !== null ? principal + yieldTotal : null;
  const headline = preflightHeadline(preflight, loading, {
    subtitle: 'Cancels the whole grant, including any part that has already vested',
    tone: 'red',
  });

  return (
    <SummaryShell
      icon="🗑️"
      title="Cancel Vesting Grant"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <PreflightBlock preflight={preflight} loading={loading} />
        {grant && (
          <>
            <Field label="Grant id" value={toBigInt(grant.grant_id)?.toString() ?? '—'} />
            <AddressWithButtons address={grant.beneficiary.toBase58()} label="Beneficiary" />
            <GrantState grant={grant} />
          </>
        )}
        {preflight.rejections.length === 0 && (
          <NativeAmountField
            label="Released from outstanding"
            lamports={total}
            symbol={nativeSymbol}
            hint="The lamports stay in the vault as surplus; the program has no withdrawal instruction yet"
          />
        )}
        {address && <AddressWithButtons address={address} label="Grant account" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `replace_beneficiary` — reassigns an Active grant nobody has claimed from yet. */
export const VestingReplaceBeneficiarySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { treasury, loading: treasuryLoading } = useVestingTreasury(instruction, connection);
  const { grant, address, loading: grantLoading } = useVestingGrant(instruction, connection, 2);
  const loading = treasuryLoading || grantLoading;
  const next = readPubkeyArg(instruction.args?.new_beneficiary);
  const current = grant?.beneficiary?.toBase58();

  const preflight = emptyPreflight();
  checkTreasuryAccount(
    preflight,
    accountByName(instruction, 'treasury', 0),
    getTreasuryPda(instruction.programId).toBase58()
  );
  checkAdminGuards(
    preflight,
    treasuryFacts(treasury),
    accountByName(instruction, 'admin', 1),
    true
  );
  checkGrantUntouched(preflight, grantFacts(grant));
  const isNoop = Boolean(next && current && next === current);
  const headline = preflightHeadline(preflight, loading, {
    subtitle: isNoop
      ? 'Already the beneficiary — this proposal changes nothing'
      : 'Redirects all unclaimed principal and yield of this grant to a new address',
    tone: isNoop ? 'gray' : 'orange',
  });

  return (
    <SummaryShell
      icon="🔁"
      title="Replace Grant Beneficiary"
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <PreflightBlock preflight={preflight} loading={loading} />
        {current && next && !isNoop && (
          <Field
            label="Beneficiary"
            value={<ValueChange from={shortenAddress(current)} to={shortenAddress(next)} />}
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
export const VestingClaimSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const nativeSymbol = useNativeSymbol();
  const isYield = /yield/i.test(instruction.instructionName);
  const beneficiary = accountByName(instruction, 'beneficiary', 3);
  const { treasury, loading: treasuryLoading } = useVestingTreasury(instruction, connection);
  const { grant, address, loading: grantLoading } = useVestingGrant(instruction, connection, 1);
  const facts = treasuryFacts(treasury);
  const vaultAccount = accountByName(instruction, 'liquid_vault', 2);
  const { balance, loading: balanceLoading } = useVaultBalance(
    connection,
    vaultAccount ?? facts?.liquidVault
  );
  const { rent, loading: rentLoading } = useZeroDataRent(connection);
  const loading = treasuryLoading || grantLoading || balanceLoading || rentLoading;
  const amount = toBigInt(instruction.args?.amount);

  const preflight = emptyPreflight();
  checkTreasuryAccount(
    preflight,
    accountByName(instruction, 'treasury', 0),
    getTreasuryPda(instruction.programId).toBase58()
  );
  checkVaultAccount(
    preflight,
    facts,
    vaultAccount,
    getLiquidVaultPda(instruction.programId).toBase58()
  );
  if (amount === BigInt(0)) {
    preflight.rejections.push({
      error: 'InvalidAmount',
      code: VESTING_ERRORS.InvalidAmount,
      reason: 'The amount must be greater than 0',
    });
  }
  if (!facts) {
    preflight.unverified.push(
      'Treasury account could not be read — pause and activation not verified'
    );
  } else {
    if (facts.paused) {
      preflight.rejections.push({
        error: 'Paused',
        code: VESTING_ERRORS.Paused,
        reason: 'The treasury is paused',
      });
    }
    if (!facts.claimsActive) {
      preflight.rejections.push({
        error: 'ClaimsNotActive',
        code: VESTING_ERRORS.ClaimsNotActive,
        reason: 'Claims have not been activated yet',
      });
    }
    if (amount !== null && facts.outstanding !== null && amount > facts.outstanding) {
      preflight.rejections.push({
        error: 'MathOverflow',
        code: VESTING_ERRORS.MathOverflow,
        reason: 'The amount exceeds the treasury’s total outstanding',
      });
    }
  }
  if (amount !== null && amount > BigInt(0)) {
    // The vault must keep its rent-exempt floor after the transfer.
    checkCoverage(
      preflight,
      balance,
      rent !== null ? amount + rent : null,
      'this claim plus its rent-exempt floor'
    );
  }
  if (grant) {
    if (enumVariantName(grant.status) !== 'Active') {
      preflight.rejections.push({
        error: 'InvalidState',
        code: VESTING_ERRORS.InvalidState,
        reason: 'The grant is not Active',
      });
    }
    if (beneficiary && grant.beneficiary.toBase58() !== beneficiary) {
      rejectConstraint(
        preflight,
        'ConstraintAddress',
        'The signer is not this grant’s beneficiary'
      );
    }
    // Upper bound that does not depend on time: what is left of the grant. The
    // vested share of principal is checked by the program at execution.
    const total = toBigInt(isYield ? grant.yield_total : grant.principal_total);
    const claimed = toBigInt(isYield ? grant.yield_claimed : grant.principal_claimed);
    if (amount !== null && total !== null && claimed !== null && amount > total - claimed) {
      preflight.rejections.push({
        error: 'AmountExceedsClaimable',
        code: VESTING_ERRORS.AmountExceedsClaimable,
        reason: `The amount exceeds the ${isYield ? 'yield' : 'principal'} left in this grant`,
      });
    }
  } else {
    preflight.unverified.push(
      'Grant account could not be read — status and beneficiary not verified'
    );
  }
  const headline = preflightHeadline(preflight, loading, {
    subtitle: `The beneficiary withdraws ${isYield ? 'fixed yield' : 'vested principal'} from the vault`,
    tone: 'teal',
  });

  return (
    <SummaryShell
      icon="💸"
      title={isYield ? 'Claim Grant Yield' : 'Claim Grant Principal'}
      subtitle={headline.subtitle}
      tone={headline.tone}
    >
      <DetailBlock>
        <PreflightBlock preflight={preflight} loading={loading} />
        <NativeAmountField
          label="Amount"
          lamports={instruction.args?.amount}
          symbol={nativeSymbol}
          hint={
            isYield
              ? 'All fixed yield is claimable from the cliff'
              : 'The vested share of principal is checked by the program at execution'
          }
        />
        {beneficiary && <AddressWithButtons address={beneficiary} label="Beneficiary" />}
        {address && <AddressWithButtons address={address} label="Grant account" />}
      </DetailBlock>
    </SummaryShell>
  );
};
