import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import {
  decodeSymbol,
  formatBps,
  formatDuration,
  formatLimit,
  formatTokenUnits,
  toBigInt,
} from '@/lib/warpBridge/values';
import {
  BridgeTokenTarget,
  DetailBlock,
  Field,
  SummaryShell,
  ValueChange,
  accountByName,
} from './shared';
import { useBridgeToken, useBridgeVault } from './hooks';

/** True when a submitted value differs from what is already on chain. */
function differs(submitted: unknown, current: unknown): boolean {
  if (typeof submitted === 'boolean' || typeof current === 'boolean') {
    return Boolean(submitted) !== Boolean(current);
  }
  const left = toBigInt(submitted);
  const right = toBigInt(current);
  if (left !== null && right !== null) return left !== right;
  return String(submitted) !== String(current);
}

/**
 * `register_token` — adds a token to the bridge registry, which is what makes
 * it bridgeable at all.
 */
export const BridgeRegisterTokenSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, registry } = useBridgeToken(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);

  const isNative = instruction.args?.is_native ?? null;
  const decimals =
    typeof instruction.args?.decimals === 'number' ? instruction.args.decimals : null;
  const symbol = typeof instruction.args?.symbol === 'string' ? instruction.args.symbol : null;

  return (
    <SummaryShell
      icon="🪙"
      title="Register Token"
      subtitle={
        registry
          ? `${symbol ?? 'This token'} is already registered — re-registering will fail`
          : `Makes ${symbol ?? 'a new token'} bridgeable`
      }
      tone={registry ? 'amber' : 'cyan'}
    >
      <DetailBlock>
        <BridgeTokenTarget
          localMint={localMint}
          symbol={symbol}
          decimals={decimals}
          isNative={isNative}
        />
        <Field
          label="Daily cap"
          value={formatLimit(instruction.args?.daily_cap, decimals, symbol, 'No cap')}
          hint="Total volume allowed per UTC day; 0 means uncapped"
        />
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `deregister_token` — removes a token from the registry, stopping all bridging for it. */
export const BridgeDeregisterTokenSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals, registry } = useBridgeToken(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);

  return (
    <SummaryShell
      icon="🚫"
      title="Deregister Token"
      subtitle={`Stops all bridging for ${symbol ?? 'this token'} and closes its registry entry`}
      tone="red"
    >
      <DetailBlock>
        <BridgeTokenTarget
          localMint={localMint}
          symbol={symbol}
          decimals={decimals}
          isNative={registry?.is_native ?? null}
        />
        {registry && (
          <Field
            label="Volume today"
            value={formatTokenUnits(registry.daily_volume, decimals, symbol)}
            hint="Volume already bridged this UTC day"
          />
        )}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `update_token_registry` — every field is optional, so the summary reports
 * which of them are actually included and how each one changes.
 */
export const BridgeUpdateTokenRegistrySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals, registry, loading } = useBridgeToken(
    instruction,
    connection
  );
  const admin = accountByName(instruction, 'admin', 2);

  const fields = [
    {
      key: 'paused',
      label: 'Bridging',
      hint: 'Pauses this token only; the rest of the bridge keeps running',
      format: (value: unknown) => (value ? 'Paused' : 'Active'),
    },
    {
      key: 'daily_cap',
      label: 'Daily cap',
      hint: 'Total volume allowed per UTC day; 0 means uncapped',
      format: (value: unknown) => formatLimit(value, decimals, symbol, 'No cap'),
    },
    {
      key: 'min_amount',
      label: 'Min per transfer',
      hint: 'Transfers below this are rejected; 0 means no minimum',
      format: (value: unknown) => formatLimit(value, decimals, symbol, 'No minimum'),
    },
    {
      key: 'max_amount',
      label: 'Max per transfer',
      hint: 'Transfers above this are rejected; 0 means no maximum',
      format: (value: unknown) => formatLimit(value, decimals, symbol, 'No maximum'),
    },
  ] as const;

  const included = fields.filter((field) => {
    const value = instruction.args?.[field.key];
    return value !== null && value !== undefined;
  });

  const changed = included.filter(
    (field) => registry && differs(instruction.args?.[field.key], (registry as any)[field.key])
  );

  const pausing = included.some(
    (field) => field.key === 'paused' && instruction.args?.paused === true
  );

  const subtitle = loading
    ? 'Comparing against the current registry entry…'
    : !registry
      ? `Sets ${included.length} setting${included.length === 1 ? '' : 's'} for ${symbol ?? 'this token'} (current entry unavailable)`
      : changed.length === 0
        ? `No effective change — all ${included.length} included setting${included.length === 1 ? '' : 's'} match the current entry`
        : `${changed.length} of ${included.length} included setting${included.length === 1 ? '' : 's'} change for ${symbol ?? 'this token'}`;

  return (
    <SummaryShell
      icon={pausing ? '⏸️' : '⚙️'}
      title="Update Token Registry"
      subtitle={subtitle}
      tone={pausing ? 'red' : changed.length > 0 ? 'amber' : 'blue'}
    >
      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
      </DetailBlock>

      {included.length > 0 && (
        <DetailBlock>
          {included.map((field) => {
            const submitted = instruction.args?.[field.key];
            const current = registry ? (registry as any)[field.key] : undefined;
            const isChanged = registry && differs(submitted, current);

            return (
              <Field
                key={field.key}
                label={field.label}
                hint={field.hint}
                value={
                  isChanged ? (
                    <ValueChange
                      from={field.format(current)}
                      to={field.format(submitted)}
                      tone={field.key === 'paused' && submitted === true ? 'red' : 'amber'}
                    />
                  ) : (
                    <span className={registry ? 'text-muted-foreground' : ''}>
                      {field.format(submitted)}
                      {registry ? ' (unchanged)' : ''}
                    </span>
                  )
                }
              />
            );
          })}
        </DetailBlock>
      )}

      {included.length < fields.length && (
        <div className="text-xs text-muted-foreground">
          {fields.length - included.length} setting
          {fields.length - included.length === 1 ? '' : 's'} not included — left at the current
          value.
        </div>
      )}

      {admin && (
        <DetailBlock>
          <AddressWithButtons address={admin} label="Admin" />
        </DetailBlock>
      )}
    </SummaryShell>
  );
};

/** `set_token_fees` — per-token bridging fees, taken in the token itself. */
export const BridgeSetTokenFeesSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals, registry } = useBridgeToken(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);

  const flatFee = instruction.args?.flat_fee_amount;
  const bps = instruction.args?.percentage_fee_bps;
  const collector = instruction.args?.fee_collector_ata;

  const flatChanged = registry && differs(flatFee, registry.flat_fee_amount);
  const bpsChanged = registry && differs(bps, registry.percentage_fee_bps);

  return (
    <SummaryShell
      icon="🧾"
      title="Set Token Fees"
      subtitle={`Fees charged in ${symbol ?? 'the token itself'} on every bridge-out`}
      tone="gray"
    >
      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
      </DetailBlock>
      <DetailBlock>
        <Field
          label="Flat fee"
          hint="Charged once per bridge-out, in token units"
          value={
            flatChanged ? (
              <ValueChange
                from={formatTokenUnits(registry.flat_fee_amount, decimals, symbol)}
                to={formatTokenUnits(flatFee, decimals, symbol)}
              />
            ) : (
              formatTokenUnits(flatFee, decimals, symbol)
            )
          }
        />
        <Field
          label="Percentage fee"
          hint="Share of each transfer, in basis points"
          value={
            bpsChanged ? (
              <ValueChange from={formatBps(registry.percentage_fee_bps)} to={formatBps(bps)} />
            ) : (
              formatBps(bps)
            )
          }
        />
        {collector && <AddressWithButtons address={String(collector)} label="Fees to" />}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `set_whale_limits` — transfers at or above the threshold are held for a delay
 * before they can be claimed.
 */
export const BridgeSetWhaleLimitsSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals, registry } = useBridgeToken(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);

  const threshold = instruction.args?.whale_threshold;
  const delay = instruction.args?.whale_delay_seconds;

  const thresholdChanged = registry && differs(threshold, registry.whale_threshold);
  const delayChanged = registry && differs(delay, registry.whale_delay_seconds);
  const disabling = toBigInt(threshold) === BigInt(0);

  return (
    <SummaryShell
      icon="🐋"
      title="Set Whale Limits"
      subtitle={
        disabling
          ? `Removes the delayed-claim requirement for ${symbol ?? 'this token'}`
          : `Large ${symbol ?? 'token'} transfers are held before they can be claimed`
      }
      tone="amber"
    >
      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
      </DetailBlock>
      <DetailBlock>
        <Field
          label="Whale threshold"
          hint="Transfers at or above this amount are delayed; 0 disables the delay"
          value={
            thresholdChanged ? (
              <ValueChange
                from={formatLimit(registry.whale_threshold, decimals, symbol, 'Disabled')}
                to={formatLimit(threshold, decimals, symbol, 'Disabled')}
              />
            ) : (
              formatLimit(threshold, decimals, symbol, 'Disabled')
            )
          }
        />
        <Field
          label="Claim delay"
          hint="How long a whale transfer waits before the recipient may claim it"
          value={
            delayChanged ? (
              <ValueChange
                from={formatDuration(registry.whale_delay_seconds)}
                to={formatDuration(delay)}
              />
            ) : (
              formatDuration(delay)
            )
          }
        />
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `initialize_vault` — creates the vault that custodies a native token. */
export const BridgeInitializeVaultSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals, registry } = useBridgeToken(instruction, connection);
  const vaultAccount = accountByName(instruction, 'vault');
  const admin = accountByName(instruction, 'admin');

  return (
    <SummaryShell
      icon="🏦"
      title="Initialize Vault"
      subtitle={`Creates the vault that holds locked ${symbol ?? 'token'} — run once per native token`}
      tone="teal"
    >
      <DetailBlock>
        <BridgeTokenTarget
          localMint={localMint}
          symbol={symbol}
          decimals={decimals}
          isNative={registry?.is_native ?? null}
        />
        {vaultAccount && <AddressWithButtons address={vaultAccount} label="Vault" />}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `set_vault_balance` — admin override of the vault's recorded locked total.
 * This is accounting-only and does not move tokens, so the summary says so.
 */
export const BridgeSetVaultBalanceSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals } = useBridgeToken(instruction, connection);
  const vaultAccount = accountByName(instruction, 'vault', 1);
  const admin = accountByName(instruction, 'admin', 2);
  const { vault } = useBridgeVault(instruction, connection, localMint);

  const totalLocked = instruction.args?.total_locked;
  const changed = vault && differs(totalLocked, vault.total_locked);

  return (
    <SummaryShell
      icon="🧮"
      title="Set Vault Balance"
      subtitle="Overwrites the vault's recorded locked total — accounting only, no tokens move"
      tone="amber"
    >
      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
        <Field
          label="Total locked"
          hint="Must match the vault's real token balance or bridging math will drift"
          value={
            changed ? (
              <ValueChange
                from={formatTokenUnits(vault.total_locked, decimals, symbol)}
                to={formatTokenUnits(totalLocked, decimals, symbol)}
              />
            ) : (
              formatTokenUnits(totalLocked, decimals, symbol)
            )
          }
        />
        {vaultAccount && <AddressWithButtons address={vaultAccount} label="Vault" />}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/**
 * `transfer_mint_authority` — hands the wrapped token's mint authority to
 * another key, which is as consequential as it sounds.
 */
export const BridgeTransferMintAuthoritySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals } = useBridgeToken(instruction, connection);
  const newAuthority = accountByName(instruction, 'new_authority');
  const admin = accountByName(instruction, 'admin');

  return (
    <SummaryShell
      icon="⚠️"
      title="Transfer Mint Authority"
      subtitle={`Hands the right to mint ${symbol ?? 'this wrapped token'} to another key`}
      tone="red"
    >
      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
        {newAuthority && <AddressWithButtons address={newAuthority} label="New auth" />}
        <div className="text-xs text-muted-foreground">
          Whoever holds mint authority can create this token at will. Moving it away from the bridge
          breaks bridging for this token unless the new holder mints on the bridge&apos;s behalf.
        </div>
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};

/** `migrate_token_registry` — reallocates a registry entry to the current layout. */
export const BridgeMigrateTokenRegistrySummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const { localMint, symbol, decimals, registry } = useBridgeToken(instruction, connection);
  const admin = accountByName(instruction, 'admin', 2);

  return (
    <SummaryShell
      icon="📦"
      title="Migrate Token Registry"
      subtitle={`Upgrades the ${symbol ?? 'token'} registry entry to the current account layout`}
      tone="amber"
    >
      <DetailBlock>
        <BridgeTokenTarget localMint={localMint} symbol={symbol} decimals={decimals} />
        {registry && (
          <Field
            label="Current entry"
            value={`${decodeSymbol(registry.symbol) ?? 'Unknown'} · ${registry.paused ? 'paused' : 'active'}`}
            hint="Existing settings are preserved; only the account layout changes"
          />
        )}
        {admin && <AddressWithButtons address={admin} label="Admin" />}
      </DetailBlock>
    </SummaryShell>
  );
};
