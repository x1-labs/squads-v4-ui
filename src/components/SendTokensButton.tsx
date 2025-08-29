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
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
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
import { isPublickey } from '~/lib/isPublickey';
import { useMultisigData } from '~/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '../hooks/useAccess';
import { waitForConfirmation } from '../lib/transactionConfirmation';
import { formatError } from '@/lib/utils/errorHandler';
import { addMemoToInstructions } from '../lib/utils/memoInstruction';

type SendTokensProps = {
  tokenAccount: string;
  mint: string;
  decimals: number;
  multisigPda: string;
  vaultIndex: number;
  programId?: string;
};

const SendTokens = ({
  tokenAccount,
  mint,
  decimals,
  multisigPda,
  vaultIndex,
  programId,
}: SendTokensProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [amount, setAmount] = useState<string>('');
  const [recipient, setRecipient] = useState('');
  const [memo, setMemo] = useState('');

  const { connection } = useMultisigData();

  const queryClient = useQueryClient();
  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const isMember = useAccess();

  const [isOpen, setIsOpen] = useState(false);
  const closeDialog = () => setIsOpen(false);

  const transfer = async () => {
    if (!wallet.publicKey) {
      throw 'Wallet not connected';
    }

    const mintAccountInfo = await connection.getAccountInfo(new PublicKey(mint));
    const TOKEN_PROGRAM = mintAccountInfo?.owner || TOKEN_PROGRAM_ID;

    const recipientATA = getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(recipient),
      true,
      TOKEN_PROGRAM
    );

    const vaultAddress = multisig
      .getVaultPda({
        index: vaultIndex,
        multisigPda: new PublicKey(multisigPda),
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      })[0]
      .toBase58();

    const createRecipientATAInstruction = createAssociatedTokenAccountIdempotentInstruction(
      new PublicKey(vaultAddress),
      recipientATA,
      new PublicKey(recipient),
      new PublicKey(mint),
      TOKEN_PROGRAM
    );

    const transferInstruction = createTransferCheckedInstruction(
      new PublicKey(tokenAccount),
      new PublicKey(mint),
      recipientATA,
      new PublicKey(vaultAddress),
      parsedAmount * 10 ** decimals,
      decimals,
      [],
      TOKEN_PROGRAM
    );

    // Create instructions array and add memo if provided
    const instructions: TransactionInstruction[] = [
      createRecipientATAInstruction,
      transferInstruction,
    ];
    addMemoToInstructions(instructions, memo, new PublicKey(vaultAddress));

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigPda)
    );

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const transferMessage = new TransactionMessage({
      instructions,
      payerKey: new PublicKey(vaultAddress),
      recentBlockhash: blockhash,
    });

    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const transactionIndexBN = BigInt(transactionIndex);

    const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      ephemeralSigners: 0,
      // @ts-ignore
      transactionMessage: transferMessage,
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

    const signature = await wallet.sendTransaction(transaction, connection, {
      skipPreflight: true,
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

    // Check for errors in the transaction
    const status = sent[0];
    if (status.err) {
      console.error('Transaction error:', status.err);

      // Extract the actual error message
      let errorMessage = '';
      let errorCode = '';

      if (typeof status.err === 'string') {
        errorMessage = status.err;
        errorCode = status.err;
      } else if (typeof status.err === 'object') {
        errorMessage = JSON.stringify(status.err);
        errorCode = errorMessage;
      }

      // Provide helpful context for common errors
      if (errorCode.includes('ProgramAccountNotFound') || errorCode === 'ProgramAccountNotFound') {
        throw `Transaction failed: The vault's token account for this mint doesn't exist. The vault needs to receive some of this token first before it can send it. Transaction: ${signature}`;
      }
      if (errorCode.includes('InsufficientFunds') || errorCode === 'InsufficientFunds') {
        throw `Transaction failed: The vault has insufficient token balance to complete this transfer. Transaction: ${signature}`;
      }
      if (errorCode.includes('AccountNotFound') || errorCode === 'AccountNotFound') {
        throw `Transaction failed: One of the required accounts was not found. This might mean the recipient's token account needs to be created. Transaction: ${signature}`;
      }

      throw `Transaction failed: ${errorMessage || errorCode || 'Unknown error'}. Transaction: ${signature}`;
    }
    setAmount('');
    setRecipient('');
    setMemo('');
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    closeDialog();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={!isMember}
          onClick={(e) => {
            if (!wallet.publicKey) {
              e.preventDefault();
              walletModal.setVisible(true);
              return;
            }
          }}
        >
          Send Tokens
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer tokens</DialogTitle>
          <DialogDescription>
            Create a proposal to transfer tokens to another address.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Recipient"
          type="text"
          onChange={(e) => setRecipient(e.target.value.trim())}
        />
        {isPublickey(recipient) ? null : <p className="text-xs">Invalid recipient address</p>}
        <Input
          placeholder="Amount"
          type="number"
          onChange={(e) => setAmount(e.target.value.trim())}
        />
        {!isAmountValid && amount.length > 0 && (
          <p className="text-xs text-red-500">Invalid amount</p>
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
            toast.promise(transfer, {
              id: 'transaction',
              loading: 'Loading...',
              success: 'Transfer proposed.',
              error: (e) => `Failed to propose: ${formatError(e)}`,
            })
          }
          disabled={!isPublickey(recipient) || amount.length < 1 || !isAmountValid}
        >
          Transfer
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default SendTokens;
