import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useState } from 'react';
import { BN } from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { isPublickey } from '~/lib/isPublickey';
import { useMultisigData } from '~/hooks/useMultisigData';
import { signSendAndConfirmV0 } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';
import { formatError } from '@/lib/utils/errorHandler';
import { formatTokenAmount } from '@/lib/utils/formatters';
import { parseTokenAmount, spendingLimitState, validateSpend } from '@/lib/spendingLimits';
import type { SpendingLimitEntry } from '@/hooks/useSpendingLimits';

type UseSpendingLimitButtonProps = {
  multisigPda: string;
  limit: SpendingLimitEntry;
};

const UseSpendingLimitButton = ({ multisigPda, limit }: UseSpendingLimitButtonProps) => {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const { connection, programId } = useMultisigData();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [memo, setMemo] = useState('');

  const { account, token } = limit;
  const decimals = token.decimals;
  const allowedDestinations = account.destinations;
  const remaining = spendingLimitState(account, Date.now() / 1000).remaining;

  const parsed = amount && decimals !== null ? parseTokenAmount(amount, decimals) : null;
  const destinationKey = isPublickey(destination) ? new PublicKey(destination) : null;
  const spendError =
    parsed && 'amount' in parsed && destinationKey
      ? validateSpend({
          amount: parsed.amount,
          remaining,
          destination: destinationKey,
          destinations: allowedDestinations,
        })
      : null;
  const canSend =
    !!parsed && 'amount' in parsed && !!destinationKey && spendError === null && decimals !== null;

  const send = async () => {
    if (!wallet.publicKey) {
      throw 'Wallet not connected';
    }
    if (!parsed || 'error' in parsed || !destinationKey || decimals === null) {
      throw 'Enter a destination and an amount.';
    }
    const error = validateSpend({
      amount: parsed.amount,
      remaining: spendingLimitState(account, Date.now() / 1000).remaining,
      destination: destinationKey,
      destinations: allowedDestinations,
    });
    if (error) throw error;

    const instructions: TransactionInstruction[] = [];
    if (!token.native) {
      if (!token.tokenProgram) throw 'Cannot read the token mint.';
      // spending_limit_use requires an existing destination token account.
      const destinationAta = getAssociatedTokenAddressSync(
        token.mint,
        destinationKey,
        true,
        token.tokenProgram
      );
      instructions.push(
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          destinationAta,
          destinationKey,
          token.mint,
          token.tokenProgram
        )
      );
    }
    instructions.push(
      multisig.instructions.spendingLimitUse({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        spendingLimit: limit.address,
        mint: token.native ? undefined : token.mint,
        vaultIndex: account.vaultIndex,
        // The SDK types this as number, but it serializes a BN. A number loses precision above 2^53.
        amount: new BN(parsed.amount.toString()) as unknown as number,
        decimals,
        destination: destinationKey,
        tokenProgram: token.tokenProgram ?? undefined,
        memo: memo.trim() || undefined,
        programId,
      })
    );

    await signSendAndConfirmV0(connection, wallet, instructions, {
      label: 'UseSpendingLimitButton',
      onStep: toastSteps(),
    });
    setAmount('');
    setDestination('');
    setMemo('');
    setIsOpen(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['spendingLimits'] }),
      queryClient.invalidateQueries({ queryKey: ['balance'] }),
      queryClient.invalidateQueries({ queryKey: ['tokenBalances'] }),
    ]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={decimals === null || remaining === 0n}>
          Send
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send with spending limit</DialogTitle>
          <DialogDescription>
            Send {token.symbol} from vault {account.vaultIndex} now. This needs no proposal and no
            approvals. Remaining:{' '}
            {decimals !== null ? formatTokenAmount(remaining, decimals, token.symbol) : '-'}
          </DialogDescription>
        </DialogHeader>
        {allowedDestinations.length > 0 ? (
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger>
              <SelectValue placeholder="Destination" />
            </SelectTrigger>
            <SelectContent>
              {allowedDestinations.map((d) => (
                <SelectItem key={d.toBase58()} value={d.toBase58()}>
                  <span className="font-mono text-xs">{d.toBase58()}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <>
            <Input
              placeholder="Destination address"
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value.trim())}
            />
            {destination && !destinationKey && (
              <p className="text-xs text-destructive">Invalid destination address</p>
            )}
          </>
        )}
        <Input
          placeholder={`Amount (${token.symbol})`}
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.trim())}
        />
        {parsed && 'error' in parsed && <p className="text-xs text-destructive">{parsed.error}</p>}
        {spendError && <p className="text-xs text-destructive">{spendError}</p>}
        <Input
          placeholder="Memo (optional)"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={200}
        />
        <Button
          onClick={() =>
            toast.promise(send, {
              id: 'transaction',
              loading: 'Loading...',
              success: 'Sent.',
              error: (e) => `Failed to send: ${formatError(e)}`,
            })
          }
          disabled={!canSend}
        >
          Send
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default UseSpendingLimitButton;
