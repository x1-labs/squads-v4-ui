import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from './ui/button';
import RemoveSpendingLimitButton from './RemoveSpendingLimitButton';
import UseSpendingLimitButton from './UseSpendingLimitButton';
import { useSpendingLimits } from '@/hooks/useSpendingLimits';
import type { SpendingLimitEntry } from '@/hooks/useSpendingLimits';
import { useMultisig } from '@/hooks/useServices';
import { formatTokenAmount } from '@/lib/utils/formatters';
import { formatDuration } from '@/lib/timeLock';
import { PERIOD_LABELS, removedMembers, spendingLimitState } from '@/lib/spendingLimits';

type SpendingLimitsListProps = {
  multisigPda: string;
  transactionIndex: number;
};

const SpendingLimitsList = ({ multisigPda, transactionIndex }: SpendingLimitsListProps) => {
  const { data: limits, isPending, isError, error, refetch, isFetching } = useSpendingLimits();

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading spending limits...</p>;
  }
  if (isError) {
    return (
      <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
        <p className="text-sm text-destructive">
          Could not load spending limits. This multisig can have limits that are not shown.
        </p>
        <p className="break-all text-xs text-muted-foreground">{String(error)}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          Retry
        </Button>
      </div>
    );
  }
  if (limits.length === 0) {
    return <p className="text-sm">None</p>;
  }

  return (
    <div className="space-y-6">
      {limits.map((limit) => (
        <SpendingLimitItem
          key={limit.address.toBase58()}
          limit={limit}
          multisigPda={multisigPda}
          transactionIndex={transactionIndex}
        />
      ))}
    </div>
  );
};

const SpendingLimitItem = ({
  limit,
  multisigPda,
  transactionIndex,
}: {
  limit: SpendingLimitEntry;
  multisigPda: string;
  transactionIndex: number;
}) => {
  const { data: multisigConfig } = useMultisig();
  const { publicKey } = useWallet();
  const { account, token } = limit;
  const nowSeconds = Date.now() / 1000;
  const { remaining, nextReset } = spendingLimitState(account, nowSeconds);
  const removed = new Set(
    removedMembers(account.members, multisigConfig?.members.map((m) => m.key) ?? []).map((k) =>
      k.toBase58()
    )
  );
  const canUse = !!publicKey && account.members.some((m) => m.equals(publicKey));
  const amountText = (value: { toString(): string }) =>
    token.decimals !== null
      ? formatTokenAmount(BigInt(value.toString()), token.decimals, token.symbol)
      : `${value.toString()} base units (${token.symbol})`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 text-xs sm:text-sm">
          <p className="break-all">
            <span className="text-muted-foreground">Address:</span>{' '}
            <span className="font-mono">{limit.address.toBase58()}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Vault:</span> {account.vaultIndex}
            <span className="text-muted-foreground"> | Token:</span> {token.symbol}
            {!token.native && (
              <span className="break-all font-mono text-xs text-muted-foreground">
                {' '}
                ({token.mint.toBase58()})
              </span>
            )}
          </p>
          <p>
            <span className="text-muted-foreground">Amount:</span> {amountText(account.amount)}{' '}
            <span className="text-muted-foreground">| Period:</span> {PERIOD_LABELS[account.period]}
          </p>
          <p>
            <span className="text-muted-foreground">Remaining:</span> {amountText(remaining)}
            {nextReset !== null && (
              <>
                {' '}
                <span className="text-muted-foreground">| Resets after:</span>{' '}
                {new Date(nextReset * 1000).toLocaleString()}
                {nextReset > nowSeconds && (
                  <span className="text-muted-foreground">
                    {' '}
                    (in {formatDuration(Math.ceil(nextReset - nowSeconds))})
                  </span>
                )}
              </>
            )}
            {nextReset === null && <span className="text-muted-foreground"> | Never resets</span>}
          </p>
        </div>
        <div className="flex gap-2 self-end sm:self-auto">
          {canUse && <UseSpendingLimitButton multisigPda={multisigPda} limit={limit} />}
          <RemoveSpendingLimitButton
            multisigPda={multisigPda}
            transactionIndex={transactionIndex}
            spendingLimit={limit.address}
          />
        </div>
      </div>

      <div className="text-xs sm:text-sm">
        <p className="text-muted-foreground">Members (share one amount):</p>
        <ul className="mt-1 space-y-1">
          {account.members.map((member) => (
            <li key={member.toBase58()} className="break-all font-mono text-xs">
              {member.toBase58()}
              {publicKey?.equals(member) && (
                <span className="font-sans text-muted-foreground"> (you)</span>
              )}
              {removed.has(member.toBase58()) && (
                <span className="text-warning ml-2 font-sans font-semibold">
                  Not a multisig member. It can still use this limit until the limit is removed.
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="text-xs sm:text-sm">
        <p className="text-muted-foreground">Destinations:</p>
        {account.destinations.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {account.destinations.map((d: PublicKey) => (
              <li key={d.toBase58()} className="break-all font-mono text-xs">
                {d.toBase58()}
              </li>
            ))}
          </ul>
        ) : (
          <div className="border-warning/30 bg-warning/10 mt-1 rounded-md border p-2">
            <p className="text-warning text-xs">
              Any address. Members can send funds to any address with no proposal.
            </p>
          </div>
        )}
      </div>
      <hr />
    </div>
  );
};

export default SpendingLimitsList;
