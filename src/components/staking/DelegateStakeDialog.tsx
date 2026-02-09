import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { isPublickey } from '@/lib/isPublickey';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useValidatorMetadata } from '@/hooks/useValidatorMetadata';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/useAccess';
import { waitForConfirmation } from '@/lib/transactionConfirmation';
import { addMemoToInstructions } from '@/lib/utils/memoInstruction';
import {
  createStakeAccountWithSeedInstructions,
  createDelegateStakeInstruction,
  getMinimumStakeAmount,
  validateVoteAccount,
} from '@/lib/staking/validatorStakeUtils';

type DelegateStakeDialogProps = {
  vaultIndex?: number;
};

export function DelegateStakeDialog({ vaultIndex = 0 }: DelegateStakeDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeDialog = () => setIsOpen(false);
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [amount, setAmount] = useState<string>('');
  const [validatorAddress, setValidatorAddress] = useState('');
  const [memo, setMemo] = useState('');
  const { connection, programId, multisigAddress } = useMultisigData();
  const queryClient = useQueryClient();
  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const isMember = useAccess();
  const [minStake, setMinStake] = useState<number>(1);
  const { data: validatorInfo } = useValidatorMetadata(
    isPublickey(validatorAddress) ? validatorAddress : undefined
  );

  useState(() => {
    getMinimumStakeAmount(connection).then(setMinStake);
  });

  const delegate = async () => {
    if (!wallet.publicKey || !multisigAddress) {
      throw 'Wallet not connected';
    }

    // Validate that the address is a vote account
    const validatorPubkey = new PublicKey(validatorAddress);
    const validationError = await validateVoteAccount(connection, validatorPubkey);
    if (validationError) {
      throw validationError;
    }

    const vaultAddress = multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    })[0];

    // Use timestamp as unique seed for the stake account
    const seed = Date.now().toString().substring(0, 32);
    const lamports = parsedAmount * LAMPORTS_PER_SOL;

    // Create stake account with seed (no additional signature needed)
    const { instructions: createAccountInstructions, stakeAccount } =
      await createStakeAccountWithSeedInstructions(vaultAddress, seed, lamports);

    console.log('Creating stake account delegation:', {
      vaultAddress: vaultAddress.toBase58(),
      stakeAccount: stakeAccount.toBase58(),
      validator: validatorAddress,
      seed,
      amount: parsedAmount,
      lamports,
    });

    // Delegate to the validator
    const delegateInstruction = createDelegateStakeInstruction(
      stakeAccount,
      vaultAddress,
      new PublicKey(validatorAddress)
    );

    const instructions: TransactionInstruction[] = [
      ...createAccountInstructions,
      delegateInstruction,
    ];

    addMemoToInstructions(instructions, memo, vaultAddress);

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigAddress)
    );

    // Get initial blockhash for building the stake message
    const initialBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const stakeMessage = new TransactionMessage({
      instructions,
      payerKey: vaultAddress,
      recentBlockhash: initialBlockhash,
    });

    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const transactionIndexBN = BigInt(transactionIndex);

    const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: new PublicKey(multisigAddress),
      creator: wallet.publicKey,
      ephemeralSigners: 0,
      // @ts-ignore
      transactionMessage: stakeMessage,
      transactionIndex: transactionIndexBN,
      addressLookupTableAccounts: [],
      rentPayer: wallet.publicKey,
      vaultIndex: vaultIndex,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    const proposalIx = multisig.instructions.proposalCreate({
      multisigPda: new PublicKey(multisigAddress),
      creator: wallet.publicKey,
      isDraft: false,
      transactionIndex: transactionIndexBN,
      rentPayer: wallet.publicKey,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    const approveIx = multisig.instructions.proposalApprove({
      multisigPda: new PublicKey(multisigAddress),
      member: wallet.publicKey,
      transactionIndex: transactionIndexBN,
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    });

    // Get FRESH blockhash right before sending
    console.log('[DelegateStakeDialog] Fetching fresh blockhash');
    const freshBlockhash = (await connection.getLatestBlockhash()).blockhash;
    console.log('[DelegateStakeDialog] Got fresh blockhash:', freshBlockhash);

    const message = new TransactionMessage({
      instructions: [multisigTransactionIx, proposalIx, approveIx],
      payerKey: wallet.publicKey,
      recentBlockhash: freshBlockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    // Sign transaction first, then send manually
    // This avoids "Plugin Closed" issues with some wallets (especially Backpack)
    console.log('[DelegateStakeDialog] Requesting wallet signature');
    if (!wallet.signTransaction) {
      throw new Error('Wallet does not support transaction signing');
    }

    const signedTransaction = await wallet.signTransaction(transaction);
    console.log('[DelegateStakeDialog] Transaction signed, sending to network');

    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log('[DelegateStakeDialog] Transaction signature:', signature);
    toast.loading('Confirming...', { id: 'transaction' });

    const sent = await waitForConfirmation(connection, [signature]);
    if (!sent[0]) {
      throw `Transaction failed or unable to confirm. Check ${signature}`;
    }

    setAmount('');
    setValidatorAddress('');
    setMemo('');
    closeDialog();
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['stakeAccounts'] });
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
            } else {
              setIsOpen(true);
            }
          }}
        >
          Stake
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delegate Stake to Validator</DialogTitle>
          <DialogDescription>
            Create a stake account and delegate XNT to a validator
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            placeholder="Validator vote account address"
            type="text"
            value={validatorAddress}
            onChange={(e) => setValidatorAddress(e.target.value)}
          />

          {validatorAddress && !isPublickey(validatorAddress) && (
            <p className="text-xs text-red-500">Invalid validator address</p>
          )}

          {validatorInfo && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
              {validatorInfo.avatarUrl && (
                <img
                  src={validatorInfo.avatarUrl}
                  alt={validatorInfo.name || 'Validator'}
                  className="h-8 w-8 rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {validatorInfo.name || 'Unknown Validator'}
                </p>
                {validatorInfo.website && (
                  <a
                    href={validatorInfo.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    {validatorInfo.website}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <Input
          placeholder={`Amount (min ${minStake} XNT)`}
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {amount && (!isAmountValid || parsedAmount < minStake) && (
          <p className="text-xs text-red-500">
            {parsedAmount < minStake ? `Minimum stake is ${minStake} XNT` : 'Invalid amount'}
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
            toast.promise(delegate, {
              id: 'transaction',
              loading: 'Creating stake delegation...',
              success: 'Stake delegation proposed.',
              error: (e) => `Failed to propose: ${e}`,
            })
          }
          disabled={!isPublickey(validatorAddress) || !isAmountValid || parsedAmount < minStake}
        >
          Create Delegation
        </Button>
      </DialogContent>
    </Dialog>
  );
}
