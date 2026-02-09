import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Connection, PublicKey } from '@solana/web3.js';
import { TransactionDecoder } from '@/components/TransactionDecoder';
import { ApprovalStatus } from '@/components/ApprovalStatus';
import { useRpcUrl } from '@/hooks/useSettings';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useMultisig } from '@/hooks/useServices';
import { useMultisigAddress } from '@/hooks/useMultisigAddress';
import { useSquadConfig } from '@/hooks/useSquadConfig';
import * as multisig from '@sqds/multisig';
import { Button } from '@/components/ui/button';
import { SplitButton } from '@/components/ui/split-button';
import ApproveButton from '@/components/ApproveButton';
import RejectButton from '@/components/RejectButton';
import ExecuteButton from '@/components/ExecuteButton';
import CancelButton from '@/components/CancelButton';
import { getDecoderInstance } from '@/lib/transaction/decoderInstance';
import { extractTransactionTags } from '@/lib/instructions/extractor';
import { TransactionTag } from '@/lib/instructions/types';
import { TransactionTagList } from '@/components/TransactionTag';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAccess } from '@/hooks/useAccess';
import { useBatchApprovals } from '@/hooks/useBatchApprovals';
import { useBatchExecutes } from '@/hooks/useBatchExecutes';
import { toast } from 'sonner';

export default function TransactionDetailsPage() {
  const { transactionPda } = useParams<{ transactionPda: string }>();
  const navigate = useNavigate();
  const { rpcUrl } = useRpcUrl();
  const { programId } = useMultisigData();
  const { multisigAddress, setMultisigAddress } = useMultisigAddress();
  const { data: multisigConfig } = useMultisig();
  const { selectSquad, addSquad } = useSquadConfig();
  const wallet = useWallet();
  const isMember = useAccess();
  const { addItem: addToBatchApproval, hasItem: isInBatchApproval, remainingSlots: remainingApprovalSlots } = useBatchApprovals();
  const { addItem: addToBatchExecute, hasItem: isInBatchExecute } = useBatchExecutes();

  // Create connection with the configured RPC URL
  const connection = useMemo(() => {
    return new Connection(rpcUrl || 'https://rpc.testnet.x1.xyz', 'finalized');
  }, [rpcUrl]);

  const [transactionIndex, setTransactionIndex] = React.useState<bigint | null>(null);
  const [proposal, setProposal] = React.useState<multisig.generated.Proposal | null>(null);
  const [tags, setTags] = React.useState<TransactionTag[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  // Helper function to set up squad
  const setupSquad = (multisigPubkey: PublicKey) => {
    const squadAddr = multisigPubkey.toBase58();

    // Add to saved squads if not already there and select it
    addSquad.mutate({
      address: squadAddr,
      name: `Squad ${squadAddr.slice(0, 4)}...${squadAddr.slice(-4)}`,
    });
    selectSquad.mutate(squadAddr);
    setMultisigAddress.mutate(squadAddr);

    return multisigPubkey;
  };

  // Helper function to extract tags
  const extractTagsForTransaction = async (multisigPubkey: PublicKey, index: bigint) => {
    try {
      const decoder = getDecoderInstance(connection);
      const decoded = await decoder.decodeVaultTransaction(multisigPubkey, index, programId);
      if (!decoded.error && decoded.instructions.length > 0) {
        const extractedTags = extractTransactionTags(decoded);
        setTags(extractedTags.tags);
      }
    } catch (err) {
      console.debug('Failed to extract tags', err);
    }
  };

  // Helper function to fetch proposal
  const fetchProposal = async (multisigPubkey: PublicKey, index: bigint) => {
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: multisigPubkey,
      transactionIndex: index,
      programId: programId,
    });

    try {
      const proposalData = await multisig.accounts.Proposal.fromAccountAddress(
        connection as any,
        proposalPda
      );
      setProposal(proposalData);
    } catch (err) {
      console.debug('No proposal found for transaction');
    }
  };

  // Try to fetch as VaultTransaction
  const tryFetchVaultTransaction = async (transactionPubkey: PublicKey): Promise<boolean> => {
    try {
      const vaultTx = await multisig.accounts.VaultTransaction.fromAccountAddress(
        connection as any,
        transactionPubkey
      );
      const index = BigInt(vaultTx.index.toString());
      setTransactionIndex(index);

      const multisigPubkey = setupSquad(vaultTx.multisig);
      await extractTagsForTransaction(multisigPubkey, index);
      await fetchProposal(multisigPubkey, index);
      return true;
    } catch {
      return false;
    }
  };

  // Try to fetch as ConfigTransaction
  const tryFetchConfigTransaction = async (transactionPubkey: PublicKey): Promise<boolean> => {
    try {
      const configTx = await multisig.accounts.ConfigTransaction.fromAccountAddress(
        connection as any,
        transactionPubkey
      );
      const index = BigInt(configTx.index.toString());
      setTransactionIndex(index);

      const multisigPubkey = setupSquad(configTx.multisig);
      await extractTagsForTransaction(multisigPubkey, index);
      await fetchProposal(multisigPubkey, index);
      return true;
    } catch {
      return false;
    }
  };

  // Try to fetch as Batch
  const tryFetchBatch = async (transactionPubkey: PublicKey): Promise<boolean> => {
    try {
      const batch = await multisig.accounts.Batch.fromAccountAddress(
        connection as any,
        transactionPubkey
      );
      const index = BigInt(batch.index.toString());
      setTransactionIndex(index);

      const multisigPubkey = setupSquad(batch.multisig);
      await fetchProposal(multisigPubkey, index);
      // Note: Batch transactions don't have tags extracted
      return true;
    } catch {
      return false;
    }
  };

  React.useEffect(() => {
    const fetchTransactionDetails = async () => {
      if (!transactionPda || !programId) return;

      try {
        // Try to fetch the transaction to get its index and multisig
        const transactionPubkey = new PublicKey(transactionPda);

        // Try each transaction type in order
        const success =
          (await tryFetchVaultTransaction(transactionPubkey)) ||
          (await tryFetchConfigTransaction(transactionPubkey)) ||
          (await tryFetchBatch(transactionPubkey));

        if (!success) {
          console.error('Failed to fetch transaction details: Unknown transaction type');
        }
      } catch (error) {
        console.error('Error fetching transaction:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactionDetails();
  }, [transactionPda, connection, programId]);

  if (isLoading) {
    return (
      <div className="px-3 py-4 sm:container sm:mx-auto sm:py-8">
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">Loading transaction details...</p>
        </div>
      </div>
    );
  }

  if (!transactionPda) {
    return (
      <div className="px-3 py-4 sm:container sm:mx-auto sm:py-8">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-foreground">Transaction Not Found</h1>
          <p className="mb-4 text-muted-foreground">
            The requested transaction could not be found.
          </p>
          <Button onClick={() => navigate(multisigAddress ? `/${multisigAddress}/transactions` : '/transactions')}>Back to Transactions</Button>
        </div>
      </div>
    );
  }

  // Check if transaction is stale
  const isStale =
    transactionIndex !== null &&
    multisigConfig &&
    Number(multisigConfig.staleTransactionIndex) > Number(transactionIndex);

  // Check if current user has already approved, rejected or cancelled
  const walletPubkeyStr = wallet.publicKey?.toBase58();
  const approvedListStr = proposal?.approved?.map(m => m.toBase58()) || [];
  const hasUserApproved = walletPubkeyStr ? approvedListStr.includes(walletPubkeyStr) : false;
  const hasUserRejected = proposal?.rejected?.some((member) =>
    wallet.publicKey ? member.equals(wallet.publicKey) : false
  );
  const hasUserCancelled = proposal?.cancelled?.some((member) =>
    wallet.publicKey ? member.equals(wallet.publicKey) : false
  );
  const hasUserTakenNegativeAction = hasUserRejected || hasUserCancelled;

  // Determine which action buttons to show
  const proposalStatus = proposal?.status.__kind || 'None';
  const showApprove =
    !isStale && !hasUserApproved && !hasUserTakenNegativeAction && ['None', 'Draft', 'Active'].includes(proposalStatus);
  const showReject =
    !isStale && !hasUserApproved && !hasUserTakenNegativeAction && ['None', 'Draft', 'Active'].includes(proposalStatus);
  const showExecute = !isStale && !hasUserTakenNegativeAction && proposalStatus === 'Approved';
  const showCancel = !isStale && !hasUserTakenNegativeAction && proposalStatus === 'Approved';

  const actualProgramId = programId?.toBase58() || multisig.PROGRAM_ID.toBase58();

  const handleAddToBatch = () => {
    if (transactionIndex === null) return;

    const txIndex = Number(transactionIndex);
    const label = tags.length > 0
      ? tags.map(t => t.label).join(', ')
      : 'Transaction';

    const added = addToBatchApproval({
      transactionIndex: txIndex,
      proposalStatus: proposalStatus,
      label,
    });

    if (added) {
      toast.success(`Added #${txIndex} to batch approval`);
      navigate(`/${multisigAddress}/transactions`);
    } else if (isInBatchApproval(txIndex)) {
      toast.info('Already in batch');
    } else {
      toast.error('Batch is full');
    }
  };

  const handleAddToExecuteBatch = () => {
    if (transactionIndex === null) return;

    const txIndex = Number(transactionIndex);
    const label = tags.length > 0
      ? tags.map(t => t.label).join(', ')
      : 'Transaction';

    const added = addToBatchExecute({
      transactionIndex: txIndex,
      label,
    });

    if (added) {
      toast.success(`Added #${txIndex} to batch execute`);
      navigate(`/${multisigAddress}/transactions`);
    } else {
      toast.info('Already in batch');
    }
  };

  return (
    <div className="px-3 py-4 sm:container sm:mx-auto sm:py-8">
      {/* Header with tags on right */}
      <div className="mb-6">
        {/* Top row with back link and tags */}
        <div className="mb-4 flex items-start justify-between">
          <Link to={multisigAddress ? `/${multisigAddress}/transactions` : '/transactions'} className="text-sm text-primary hover:underline">
            ← Back to Transactions
          </Link>
          {/* Tags on the right */}
          {tags.length > 0 && (
            <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">
              <TransactionTagList tags={tags} size="sm" maxTags={10} showIcon={false} />
            </div>
          )}
        </div>

        {/* Main header content */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground sm:text-2xl">Transaction Details</h1>
              {isStale && proposalStatus !== 'Executed' && proposalStatus !== 'Cancelled' && (
                <div className="text-warning bg-warning/10 border-warning/20 flex items-center gap-1 rounded-md border px-2 py-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span className="text-xs font-medium">Stale</span>
                </div>
              )}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground sm:text-sm">
              <span className="inline sm:hidden">
                {transactionPda?.slice(0, 8)}...{transactionPda?.slice(-8)}
              </span>
              <span className="hidden sm:inline">{transactionPda}</span>
            </p>
          </div>
          {transactionIndex !== null && multisigAddress && wallet.connected && isMember && (
            <div className="flex flex-wrap gap-2">
              {showApprove && (
                <SplitButton
                  items={[{
                    label: hasUserApproved ? 'Already Approved' : isInBatchApproval(Number(transactionIndex)) ? 'In Batch' : 'Batch Approval',
                    onClick: handleAddToBatch,
                    disabled: hasUserApproved || isInBatchApproval(Number(transactionIndex)),
                  }]}
                >
                  <ApproveButton
                    multisigPda={multisigAddress}
                    transactionIndex={Number(transactionIndex)}
                    proposalStatus={proposalStatus}
                    programId={actualProgramId}
                  />
                </SplitButton>
              )}
              {showReject && (
                <RejectButton
                  multisigPda={multisigAddress}
                  transactionIndex={Number(transactionIndex)}
                  proposalStatus={proposalStatus}
                  programId={actualProgramId}
                />
              )}
              {showExecute && (
                <SplitButton
                  items={[{
                    label: isInBatchExecute(Number(transactionIndex)) ? 'In Batch' : 'Batch Execute',
                    onClick: handleAddToExecuteBatch,
                    disabled: isInBatchExecute(Number(transactionIndex)),
                  }]}
                >
                  <ExecuteButton
                    multisigPda={multisigAddress}
                    transactionIndex={Number(transactionIndex)}
                    proposalStatus={proposalStatus}
                    programId={actualProgramId}
                  />
                </SplitButton>
              )}
              {showCancel && (
                <CancelButton
                  multisigPda={multisigAddress}
                  transactionIndex={Number(transactionIndex)}
                  proposalStatus={proposalStatus}
                  programId={actualProgramId}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stale Transaction Warning */}
      {isStale && proposalStatus !== 'Executed' && proposalStatus !== 'Cancelled' && (
        <div className="border-warning/50 bg-warning/10 mb-6 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <svg
              className="text-warning mt-0.5 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h3 className="text-warning font-semibold">This transaction is stale</h3>
              <p className="text-warning/80 mt-1 text-sm">
                A newer transaction has been executed since this one was created. This transaction
                can no longer be executed and should be considered obsolete.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Proposal Status Card */}
      {proposal && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Approval Status</h2>
          <ApprovalStatus proposal={proposal} isStale={isStale || false} />
        </div>
      )}

      {/* Transaction Decoder */}
      {transactionIndex !== null && multisigAddress && (
        <div className="rounded-lg border border-border bg-card">
          <TransactionDecoder
            connection={connection}
            multisigPda={new PublicKey(multisigAddress)}
            transactionIndex={transactionIndex}
            programId={programId}
          />
        </div>
      )}
    </div>
  );
}
