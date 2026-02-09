import React from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { submitBatchApprovals, ApprovalItem } from '@/lib/transaction/batchApprovals';
import { Loader2 } from 'lucide-react';

type BatchApproveButtonProps = {
  multisigPda: string;
  programId: string;
  connection: Connection;
  staleTransactionIndex: number;
  transactionIndex: number;
};

const BatchApproveButton = ({
  multisigPda,
  programId,
  connection,
  staleTransactionIndex,
  transactionIndex,
}: BatchApproveButtonProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleBatchApprove = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }

    setIsLoading(true);
    const toastId = 'batch-approve';

    try {
      toast.loading('Scanning pending proposals...', { id: toastId });

      const actualProgramId = programId ? new PublicKey(programId) : multisig.PROGRAM_ID;
      const multisigPubkey = new PublicKey(multisigPda);

      // Fetch all proposals from staleTransactionIndex+1 to transactionIndex
      const startIdx = staleTransactionIndex + 1;
      const endIdx = transactionIndex;

      const items: ApprovalItem[] = [];

      // Fetch proposals in parallel
      const promises = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const idx = BigInt(i);
        const [proposalPda] = multisig.getProposalPda({
          multisigPda: multisigPubkey,
          transactionIndex: idx,
          programId: actualProgramId,
        });
        promises.push(
          multisig.accounts.Proposal.fromAccountAddress(connection as any, proposalPda)
            .then((proposal) => ({ index: i, proposal, status: proposal.status.__kind }))
            .catch(() => ({ index: i, proposal: null, status: 'None' as const }))
        );
      }

      const results = await Promise.all(promises);

      for (const result of results) {
        const { index, proposal, status } = result;

        // Skip non-approvable statuses
        if (!['None', 'Draft', 'Active'].includes(status)) continue;

        // Skip if user has already approved
        if (
          proposal?.approved?.some((member: PublicKey) =>
            wallet.publicKey ? member.equals(wallet.publicKey) : false
          )
        ) {
          continue;
        }

        items.push({
          transactionIndex: index,
          proposalStatus: status,
        });
      }

      if (items.length === 0) {
        toast.info('No pending proposals to approve', { id: toastId });
        return;
      }

      toast.loading(`Approving ${items.length} proposals...`, { id: toastId });

      await submitBatchApprovals(items, connection, multisigPda, actualProgramId, wallet);

      toast.success(`Approved ${items.length} proposals`, { id: toastId });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
      ]);

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes('User rejected')) {
        toast.dismiss(toastId);
      } else {
        toast.error(msg.length > 200 ? msg.substring(0, 200) + '...' : msg, { id: toastId });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleBatchApprove}
      disabled={isLoading}
      className="h-8 px-3 text-sm"
      variant="outline"
    >
      {isLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
      Batch Approve
    </Button>
  );
};

export default BatchApproveButton;
