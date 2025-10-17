import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/useAccess';
import { waitForConfirmation } from '@/lib/transactionConfirmation';
import { addMemoToInstructions } from '@/lib/utils/memoInstruction';
import { createDeactivateStakeInstruction } from '@/lib/staking/validatorStakeUtils';
import { StakeAccountInfo as StakeAccountData } from '@/lib/staking/validatorStakeUtils';
import { useValidatorsMetadata } from '@/hooks/useValidatorMetadata';
import { Input } from '@/components/ui/input';
import { StakeAccountDisplay } from './StakeAccountDisplay';

type UndelegateStakeDialogProps = {
  stakeAccounts?: StakeAccountData[];
  vaultIndex?: number;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  preSelectedAccount?: StakeAccountData;
};

export function UndelegateStakeDialog({
  stakeAccounts = [],
  vaultIndex = 0,
  isOpen: externalIsOpen,
  onOpenChange: externalOnOpenChange,
  preSelectedAccount,
}: UndelegateStakeDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = externalOnOpenChange || setInternalIsOpen;
  const closeDialog = () => setIsOpen(false);

  const wallet = useWallet();
  const walletModal = useWalletModal();
  const [selectedAccount, setSelectedAccount] = useState<string>(preSelectedAccount?.address || '');
  const [memo, setMemo] = useState('');
  const { connection, programId, multisigAddress } = useMultisigData();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  const activeAccounts = stakeAccounts.filter(
    (account) => account.state === 'active' || account.state === 'activating'
  );

  // Get unique validator addresses for metadata
  const validatorAddresses = [
    ...activeAccounts.map((account) => account.delegatedValidator),
    preSelectedAccount?.delegatedValidator,
  ].filter((v): v is string => !!v);

  const { data: validatorMetadata } = useValidatorsMetadata(validatorAddresses);

  const undelegate = async () => {
    if (!wallet.publicKey || !multisigAddress || !selectedAccount) {
      throw 'Wallet not connected or no account selected';
    }

    const vaultAddress = multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
    })[0];

    const deactivateInstruction = createDeactivateStakeInstruction(
      new PublicKey(selectedAccount),
      vaultAddress
    );

    const instructions: TransactionInstruction[] = [deactivateInstruction];
    addMemoToInstructions(instructions, memo, vaultAddress);

    const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
      // @ts-ignore
      connection,
      new PublicKey(multisigAddress)
    );

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const undelegateMessage = new TransactionMessage({
      instructions,
      payerKey: vaultAddress,
      recentBlockhash: blockhash,
    });

    const transactionIndex = Number(multisigInfo.transactionIndex) + 1;
    const transactionIndexBN = BigInt(transactionIndex);

    const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: new PublicKey(multisigAddress),
      creator: wallet.publicKey,
      ephemeralSigners: 0,
      // @ts-ignore
      transactionMessage: undelegateMessage,
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
    toast.loading('Confirming...', { id: 'transaction' });

    const sent = await waitForConfirmation(connection, [signature]);
    if (!sent[0]) {
      throw `Transaction failed or unable to confirm. Check ${signature}`;
    }

    setSelectedAccount('');
    setMemo('');
    closeDialog();
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['stakeAccounts'] });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {externalIsOpen === undefined && (
        <DialogTrigger asChild>
          <Button
            variant="outline"
            disabled={!isMember || activeAccounts.length === 0}
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
            Undelegate
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unstake</DialogTitle>
          <DialogDescription>
            Deactivate a stake account. After deactivation, you'll need to wait for the cooldown
            period before withdrawing.
          </DialogDescription>
        </DialogHeader>

        {/* Account Info - No Selection Needed */}
        {preSelectedAccount && <StakeAccountDisplay account={preSelectedAccount} />}

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
            toast.promise(undelegate, {
              id: 'transaction',
              loading: 'Creating undelegate transaction...',
              success: 'Undelegate proposed.',
              error: (e) => `Failed to propose: ${e}`,
            })
          }
          disabled={!selectedAccount}
        >
          Unstake
        </Button>
      </DialogContent>
    </Dialog>
  );
}
