import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { Button } from './ui/button';
import { useState, useEffect } from 'react';
import {
  createMintToCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
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

type MintTokensProps = {
  mint: string;
  decimals: number;
  multisigPda: string;
  vaultIndex: number;
  programId?: string;
};

const MintTokens = ({ mint, decimals, multisigPda, vaultIndex, programId }: MintTokensProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [amount, setAmount] = useState<string>('');
  const [recipient, setRecipient] = useState('');
  const [memo, setMemo] = useState('');
  const [hasMintAuthority, setHasMintAuthority] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const { connection } = useMultisigData();

  const queryClient = useQueryClient();
  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const isMember = useAccess();

  const [isOpen, setIsOpen] = useState(false);
  const closeDialog = () => setIsOpen(false);

  // Compute vault address
  const vaultAddress = multisig
    .getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigPda),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    })[0]
    .toBase58();

  // Check if vault has mint authority
  useEffect(() => {
    async function checkMintAuthority() {
      setLoading(true);
      try {
        const mintAccountInfo = await connection.getAccountInfo(new PublicKey(mint));
        const tokenProgram = mintAccountInfo?.owner || TOKEN_PROGRAM_ID;

        const mintInfo = await getMint(connection, new PublicKey(mint), 'confirmed', tokenProgram);

        const hasMintAuth =
          mintInfo.mintAuthority !== null &&
          mintInfo.mintAuthority.toBase58() === vaultAddress;

        setHasMintAuthority(hasMintAuth);
      } catch (error) {
        console.error('Failed to check mint authority:', error);
        setHasMintAuthority(false);
      } finally {
        setLoading(false);
      }
    }

    checkMintAuthority();
  }, [mint, vaultAddress, connection]);

  const mintTokens = async () => {
    if (!wallet.publicKey) {
      throw 'Wallet not connected';
    }

    const mintAccountInfo = await connection.getAccountInfo(new PublicKey(mint));
    const TOKEN_PROGRAM = mintAccountInfo?.owner || TOKEN_PROGRAM_ID;

    const recipientPubkey = new PublicKey(recipient);
    const recipientATA = getAssociatedTokenAddressSync(
      new PublicKey(mint),
      recipientPubkey,
      true,
      TOKEN_PROGRAM
    );

    const vaultPubkey = new PublicKey(vaultAddress);

    // Create ATA for recipient if it doesn't exist
    const createRecipientATAInstruction = createAssociatedTokenAccountIdempotentInstruction(
      vaultPubkey,
      recipientATA,
      recipientPubkey,
      new PublicKey(mint),
      TOKEN_PROGRAM
    );

    // Create mint instruction
    const mintInstruction = createMintToCheckedInstruction(
      new PublicKey(mint), // mint
      recipientATA, // destination
      vaultPubkey, // authority
      BigInt(Math.floor(parsedAmount * 10 ** decimals)), // amount
      decimals, // decimals
      [], // multiSigners
      TOKEN_PROGRAM
    );

    // Create instructions array and add memo if provided
    const instructions: TransactionInstruction[] = [createRecipientATAInstruction, mintInstruction];
    addMemoToInstructions(instructions, memo, vaultPubkey);

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigPda)
    );

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const mintMessage = new TransactionMessage({
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
      transactionMessage: mintMessage,
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

      if (errorCode.includes('InvalidMintAuthority')) {
        throw `Transaction failed: The vault is not the mint authority for this token. Transaction: ${signature}`;
      }

      throw `Transaction failed: ${errorMessage || errorCode || 'Unknown error'}. Transaction: ${signature}`;
    }

    setAmount('');
    setRecipient('');
    setMemo('');
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['tokens'] });
    closeDialog();
  };

  // Don't render if vault doesn't have mint authority
  if (loading) {
    return null;
  }

  if (!hasMintAuthority) {
    return null;
  }

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
          Mint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mint tokens</DialogTitle>
          <DialogDescription>
            Create a proposal to mint new tokens. The vault is the mint authority for this token.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Recipient address"
          type="text"
          onChange={(e) => setRecipient(e.target.value.trim())}
        />
        {recipient.length > 0 && !isPublickey(recipient) && (
          <p className="text-xs text-red-500">Invalid recipient address</p>
        )}
        <Input
          placeholder="Amount to mint"
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
            toast.promise(mintTokens, {
              id: 'transaction',
              loading: 'Loading...',
              success: 'Mint proposed.',
              error: (e) => `Failed to propose: ${formatError(e)}`,
            })
          }
          disabled={!isPublickey(recipient) || amount.length < 1 || !isAmountValid}
        >
          Mint Tokens
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default MintTokens;
