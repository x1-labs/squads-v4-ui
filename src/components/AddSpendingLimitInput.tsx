import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useState } from 'react';
import { BN } from '@coral-xyz/anchor';
import * as multisig from '@sqds/multisig';
import { Keypair, PublicKey } from '@solana/web3.js';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMultisig } from '../hooks/useServices';
import { useMultisigData } from '../hooks/useMultisigData';
import { useMemberPermissions } from '../hooks/useAccess';
import { useNativeSymbol } from '../hooks/useNativeSymbol';
import { fetchSplToken, useSpendingLimits } from '../hooks/useSpendingLimits';
import { signSendAndConfirmV0 } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';
import { configProposalInstructions } from '../lib/transaction/configProposal';
import { isPublickey } from '~/lib/isPublickey';
import { formatError } from '@/lib/utils/errorHandler';
import {
  NATIVE_DECIMALS,
  NATIVE_MINT_KEY,
  PERIOD_LABELS,
  selectedCurrentMembers,
  parseAddressList,
  parseTokenAmount,
} from '@/lib/spendingLimits';

const Period = multisig.types.Period;

type AddSpendingLimitInputProps = {
  multisigPda: string;
  transactionIndex: number;
};

const AddSpendingLimitInput = ({ multisigPda, transactionIndex }: AddSpendingLimitInputProps) => {
  const { data: multisigConfig } = useMultisig();
  const { connection, programId, vaultIndex: selectedVaultIndex } = useMultisigData();
  const { data: existingLimits } = useSpendingLimits();
  const nativeSymbol = useNativeSymbol();
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const { canInitiate, canVote } = useMemberPermissions();
  const queryClient = useQueryClient();

  const [vaultIndexInput, setVaultIndexInput] = useState(String(selectedVaultIndex ?? 0));
  const [tokenKind, setTokenKind] = useState<'native' | 'spl'>('native');
  const [mintInput, setMintInput] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<multisig.types.Period>(Period.Day);
  const [members, setMembers] = useState<string[]>([]);
  const [destinationsInput, setDestinationsInput] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const vaultIndex = /^\d+$/.test(vaultIndexInput) ? Number(vaultIndexInput) : null;
  const vaultIndexValid = vaultIndex !== null && vaultIndex <= 255;

  const mintKey = tokenKind === 'spl' && isPublickey(mintInput) ? new PublicKey(mintInput) : null;
  const {
    data: splToken,
    isFetching: splTokenLoading,
    isError: splTokenError,
  } = useQuery({
    queryKey: ['splToken', connection.rpcEndpoint, mintKey?.toBase58()],
    queryFn: () => fetchSplToken(connection, mintKey!),
    enabled: !!mintKey,
  });
  const decimals =
    tokenKind === 'native' ? NATIVE_DECIMALS : mintKey ? (splToken?.decimals ?? null) : null;
  const symbol = tokenKind === 'native' ? nativeSymbol : (splToken?.symbol ?? 'tokens');

  const parsedAmount = amount && decimals !== null ? parseTokenAmount(amount, decimals) : null;
  const parsedDestinations = parseAddressList(destinationsInput);
  const memberKeys = selectedCurrentMembers(
    members,
    multisigConfig?.members.map((m) => m.key) ?? []
  );
  const otherLimitsOnVault =
    vaultIndex === null
      ? []
      : (existingLimits ?? []).filter((l) => l.account.vaultIndex === vaultIndex);
  const noDestinations = 'keys' in parsedDestinations && parsedDestinations.keys.length === 0;

  const formValid =
    vaultIndexValid &&
    decimals !== null &&
    !!parsedAmount &&
    'amount' in parsedAmount &&
    memberKeys.length > 0 &&
    'keys' in parsedDestinations;

  const toggleMember = (key: string) =>
    setMembers((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const addSpendingLimit = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }
    if (
      !formValid ||
      !parsedAmount ||
      'error' in parsedAmount ||
      'error' in parsedDestinations ||
      vaultIndex === null
    ) {
      throw 'Complete the form first.';
    }

    const instructions = configProposalInstructions({
      multisigPda: new PublicKey(multisigPda),
      actions: [
        {
          __kind: 'AddSpendingLimit',
          // Only seeds the SpendingLimit PDA. It does not sign.
          createKey: Keypair.generate().publicKey,
          vaultIndex,
          mint: tokenKind === 'native' ? NATIVE_MINT_KEY : mintKey!,
          amount: new BN(parsedAmount.amount.toString()),
          period,
          members: memberKeys,
          destinations: parsedDestinations.keys,
        },
      ],
      creator: wallet.publicKey,
      transactionIndex: BigInt(transactionIndex),
      programId,
      approve: canVote,
    });
    await signSendAndConfirmV0(connection, wallet, instructions, {
      label: 'AddSpendingLimitInput',
      onStep: toastSteps(),
    });
    setConfirmed(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['multisig'] }),
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="w-24 space-y-1">
          <Label htmlFor="sl-vault" className="text-xs">
            Vault index
          </Label>
          <Input
            id="sl-vault"
            type="text"
            inputMode="numeric"
            value={vaultIndexInput}
            onChange={(e) => setVaultIndexInput(e.target.value.trim())}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Token</Label>
          <Select value={tokenKind} onValueChange={(v) => setTokenKind(v as 'native' | 'spl')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="native">{nativeSymbol}</SelectItem>
              <SelectItem value="spl">SPL token</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {!vaultIndexValid && (
        <p className="text-xs text-destructive">Enter a vault index from 0 to 255.</p>
      )}

      {tokenKind === 'spl' && (
        <div className="space-y-1">
          <Input
            placeholder="Token mint address"
            type="text"
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value.trim())}
          />
          {mintInput && !mintKey && (
            <p className="text-xs text-destructive">Invalid mint address</p>
          )}
          {mintKey && !splTokenLoading && splTokenError && (
            <p className="text-xs text-destructive">Could not load the mint. Try again.</p>
          )}
          {mintKey && splTokenLoading && (
            <p className="text-xs text-muted-foreground">Loading mint...</p>
          )}
          {mintKey && !splTokenLoading && splToken && splToken.decimals === null && (
            <p className="text-xs text-destructive">This address is not a token mint.</p>
          )}
          {splToken && splToken.decimals !== null && (
            <p className="text-xs text-muted-foreground">
              {splToken.symbol}, {splToken.decimals} decimals
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor="sl-amount" className="text-xs">
            Amount per period ({symbol})
          </Label>
          <Input
            id="sl-amount"
            placeholder="0"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.trim())}
          />
        </div>
        <div className="w-44 space-y-1">
          <Label className="text-xs">Period</Label>
          <Select
            value={String(period)}
            onValueChange={(v) => setPeriod(Number(v) as multisig.types.Period)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[Period.Day, Period.Week, Period.Month, Period.OneTime].map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {parsedAmount && 'error' in parsedAmount && (
        <p className="text-xs text-destructive">{parsedAmount.error}</p>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Members who can use this limit</Label>
        {multisigConfig?.members.map((m) => {
          const key = m.key.toBase58();
          return (
            <div key={key} className="flex items-center space-x-2">
              <Checkbox
                id={`sl-member-${key}`}
                checked={members.includes(key)}
                onCheckedChange={() => toggleMember(key)}
              />
              <Label
                htmlFor={`sl-member-${key}`}
                className="break-all font-mono text-xs font-normal"
              >
                {key}
                {wallet.publicKey?.toBase58() === key && (
                  <span className="font-sans text-muted-foreground"> (you)</span>
                )}
              </Label>
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <Label htmlFor="sl-destinations" className="text-xs">
          Allowed destinations (one wallet address per line; leave empty for any address)
        </Label>
        <Textarea
          id="sl-destinations"
          rows={3}
          className="font-mono text-xs"
          value={destinationsInput}
          onChange={(e) => setDestinationsInput(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          For SPL tokens, enter the owner wallet, not its token account.
        </p>
        {'error' in parsedDestinations && (
          <p className="text-xs text-destructive">{parsedDestinations.error}</p>
        )}
      </div>

      <div className="border-warning/30 bg-warning/10 space-y-1 rounded-md border p-2">
        <p className="text-warning text-xs">
          A spending limit moves funds from the vault with no proposal, no approvals and no time
          lock. Any one listed member can spend the full amount: the amount is shared by all listed
          members, not given to each.
        </p>
        <p className="text-warning text-xs">
          Limits on the same vault add up.
          {otherLimitsOnVault.length > 0 &&
            ` Vault ${vaultIndex} already has ${otherLimitsOnVault.length} other spending limit${
              otherLimitsOnVault.length === 1 ? '' : 's'
            }.`}
        </p>
        {noDestinations && (
          <p className="text-warning text-xs font-semibold">
            No destinations are listed. Members can send to any address.
          </p>
        )}
        <div className="flex items-center space-x-2 pt-1">
          <Checkbox
            id="sl-confirm"
            checked={confirmed}
            onCheckedChange={(c) => setConfirmed(c === true)}
          />
          <Label htmlFor="sl-confirm" className="text-xs font-normal">
            I understand
          </Label>
        </div>
      </div>

      <Button
        onClick={() =>
          toast.promise(addSpendingLimit, {
            id: 'transaction',
            loading: 'Loading...',
            success: canVote
              ? 'Spending limit proposed.'
              : 'Spending limit proposed. It still needs approvals.',
            error: (e) => `Failed to propose: ${formatError(e)}`,
          })
        }
        disabled={!canInitiate || !formValid || !confirmed}
      >
        Add Spending Limit
      </Button>
    </div>
  );
};

export default AddSpendingLimitInput;
