import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Button } from './ui/button';
import { useState } from 'react';
import { createBurnCheckedInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { useMultisigData } from '~/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../hooks/useAccess';
import { waitForConfirmation } from '../lib/transactionConfirmation';
import { formatError } from '@/lib/utils/errorHandler';
import { addMemoToInstructions } from '../lib/utils/memoInstruction';

type BurnTokensProps = {
  tokenAccount: string;
  mint: string;
  decimals: number;
  balance: number;
  multisigPda: string;
  vaultIndex: number;
  programId?: string;
};

const BurnTokens = ({
  tokenAccount,
  mint,
  decimals,
  balance,
  multisigPda,
  vaultIndex,
  programId,
}: BurnTokensProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [amount, setAmount] = useState<string>('');
  const [memo, setMemo] = useState('');

  const { connection } = useMultisigData();

  const queryClient = useQueryClient();
  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= balance;
  const isMember = useAccess();

  const [isOpen, setIsOpen] = useState(false);
  const closeDialog = () => setIsOpen(false);

  const burnTokens = async () => {
    if (!wallet.publicKey) {
      throw 'Wallet not connected';
    }

    const mintAccountInfo = await connection.getAccountInfo(new PublicKey(mint));
    const TOKEN_PROGRAM = mintAccountInfo?.owner || TOKEN_PROGRAM_ID;

    const vaultAddress = multisig
      .getVaultPda({
        index: vaultIndex,
        multisigPda: new PublicKey(multisigPda),
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      })[0]
      .toBase58();

    const vaultPubkey = new PublicKey(vaultAddress);

    // Create burn instruction
    const burnInstruction = createBurnCheckedInstruction(
      new PublicKey(tokenAccount), // token account to burn from
      new PublicKey(mint), // mint
      vaultPubkey, // owner/authority
      BigInt(Math.floor(parsedAmount * 10 ** decimals)), // amount
      decimals, // decimals
      [], // multiSigners
      TOKEN_PROGRAM
    );

    // Create instructions array and add memo if provided
    const instructions: TransactionInstruction[] = [burnInstruction];
    addMemoToInstructions(instructions, memo, vaultPubkey);

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigPda)
    );

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const burnMessage = new TransactionMessage({
      instructions,
      payerKey: vaultPubkey,
      recentBlockhash: blockhash,
    });

    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const transactionIndexBN = BigInt(transactionIndex);

    const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      ephemeralSigners: 0,
      // @ts-ignore
      transactionMessage: burnMessage,
      transactionIndex: transactionIndexBN,
      addressLookupTableAccounts: [],
      rentPayer: wallet.publicKey,
      vaultIndex: vaultIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });
    const proposalIx = multisig.instructions.proposalCreate({
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      isDraft: false,
      transactionIndex: transactionIndexBN,
      rentPayer: wallet.publicKey,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });
    const approveIx = multisig.instructions.proposalApprove({
      multisigPda: new PublicKey(multisigPda),
      member: wallet.publicKey,
      transactionIndex: transactionIndexBN,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    const message = new TransactionMessage({
      instructions: [multisigTransactionIx, proposalIx, approveIx],
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    if (!wallet.signTransaction) {
      throw new Error('Wallet does not support transaction signing');
    }

    const signedTransaction = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    console.log('Transaction signature', signature);
    toast.loading('Confirming...', {
      id: 'transaction',
    });

    const sent = await waitForConfirmation(connection, [signature]);
    console.log('Transaction confirmation status:', sent);

    if (!sent || !sent[0]) {
      throw `Transaction failed: Unable to confirm transaction. Check explorer for signature: ${signature}`;
    }

    const status = sent[0];
    if (status.err) {
      console.error('Transaction error:', status.err);

      let errorMessage = '';
      let errorCode = '';

      if (typeof status.err === 'string') {
        errorMessage = status.err;
        errorCode = status.err;
      } else if (typeof status.err === 'object') {
        errorMessage = JSON.stringify(status.err);
        errorCode = errorMessage;
      }

      if (errorCode.includes('InsufficientFunds')) {
        throw `Transaction failed: Insufficient token balance to burn. Transaction: ${signature}`;
      }

      throw `Transaction failed: ${errorMessage || errorCode || 'Unknown error'}. Transaction: ${signature}`;
    }

    setAmount('');
    setMemo('');
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    closeDialog();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!isMember}
          onClick={(e) => {
            if (!wallet.publicKey) {
              e.preventDefault();
              walletModal.setVisible(true);
              return;
            }
          }}
        >
          Burn
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Burn tokens</DialogTitle>
          <DialogDescription>
            Create a proposal to burn tokens from the vault. Available balance: {balance.toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Amount to burn"
          type="number"
          onChange={(e) => setAmount(e.target.value.trim())}
        />
        {amount.length > 0 && !isAmountValid && (
          <p className="text-xs text-red-500">
            {parsedAmount > balance
              ? 'Amount exceeds available balance'
              : 'Invalid amount'}
          </p>
        )}
        <Input
          placeholder="Memo (optional)"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={200}
        />
        {memo.length > 0 && (
          <p className="text-xs text-muted-foreground">{memo.length}/200 characters</p>
        )}
        <Button
          onClick={() =>
            toast.promise(burnTokens, {
              id: 'transaction',
              loading: 'Loading...',
              success: 'Burn proposed.',
              error: (e) => `Failed to propose: ${formatError(e)}`,
            })
          }
          disabled={amount.length < 1 || !isAmountValid}
        >
          Burn Tokens
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default BurnTokens;
