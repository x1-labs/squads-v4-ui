import React, { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Connection, PublicKey } from '@solana/web3.js';
import { TransactionDecoder } from '@/components/TransactionDecoder';
import { ApprovalStatus } from '@/components/ApprovalStatus';
import { useRpcUrl } from '@/hooks/useSettings';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useMultisig } from '@/hooks/useServices';
import * as multisig from '@sqds/multisig';
import { Button } from '@/components/ui/button';
import ApproveButton from '@/components/ApproveButton';
import RejectButton from '@/components/RejectButton';
import ExecuteButton from '@/components/ExecuteButton';
import CancelButton from '@/components/CancelButton';
import { SimpleDecoder } from '@/lib/transaction/simpleDecoder';
import { extractTransactionTags } from '@/lib/tags/extractor';
import { TransactionTag } from '@/lib/tags/types';
import { TransactionTagList } from '@/components/TransactionTag';

export default function TransactionDetailsPage() {
  const { transactionPda } = useParams<{ transactionPda: string }>();
  const navigate = useNavigate();
  const { rpcUrl } = useRpcUrl();
  const { multisigAddress, programId } = useMultisigData();
  const { data: multisigConfig } = useMultisig();

  // Create connection with the configured RPC URL
  const connection = useMemo(() => {
    return new Connection(rpcUrl || 'https://rpc.testnet.x1.xyz', 'finalized');
  }, [rpcUrl]);

  // Extract transaction index and proposal from the PDA
  const [transactionIndex, setTransactionIndex] = React.useState<bigint | null>(null);
  const [proposal, setProposal] = React.useState<multisig.generated.Proposal | null>(null);
  const [transactionType, setTransactionType] = React.useState<'vault' | 'config' | 'unknown'>(
    'unknown'
  );
  const [tags, setTags] = React.useState<TransactionTag[]>([]);

  React.useEffect(() => {
    const fetchTransactionDetails = async () => {
      if (!transactionPda || !multisigAddress || !programId) return;

      try {
        // Try to fetch the transaction to get its index
        const transactionPubkey = new PublicKey(transactionPda);
        const multisigPubkey = new PublicKey(multisigAddress);

        // Try to fetch as VaultTransaction first
        try {
          const vaultTx = await multisig.accounts.VaultTransaction.fromAccountAddress(
            connection as any,
            transactionPubkey
          );
          const index = BigInt(vaultTx.index.toString());
          setTransactionIndex(index);
          setTransactionType('vault');

          // Extract tags
          try {
            const decoder = new SimpleDecoder(connection);
            const decoded = await decoder.decodeVaultTransaction(multisigPubkey, index, programId);
            if (!decoded.error && decoded.instructions.length > 0) {
              const extractedTags = extractTransactionTags(decoded);
              setTags(extractedTags.tags);
            }
          } catch (err) {
            console.debug('Failed to extract tags', err);
          }

          // Fetch the proposal
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
            console.log('No proposal found for transaction');
          }
        } catch {
          // Try as ConfigTransaction
          try {
            const configTx = await multisig.accounts.ConfigTransaction.fromAccountAddress(
              connection as any,
              transactionPubkey
            );
            const index = BigInt(configTx.index.toString());
            setTransactionIndex(index);
            setTransactionType('config');

            // Extract tags
            try {
              const decoder = new SimpleDecoder(connection);
              const decoded = await decoder.decodeVaultTransaction(
                multisigPubkey,
                index,
                programId
              );
              if (!decoded.error && decoded.instructions.length > 0) {
                const extractedTags = extractTransactionTags(decoded);
                setTags(extractedTags.tags);
              }
            } catch (err) {
              console.debug('Failed to extract tags', err);
            }

            // Fetch the proposal
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
              console.log('No proposal found for transaction');
            }
          } catch {
            // Try as Batch
            try {
              const batch = await multisig.accounts.Batch.fromAccountAddress(
                connection as any,
                transactionPubkey
              );
              const index = BigInt(batch.index.toString());
              setTransactionIndex(index);

              // Fetch the proposal
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
                console.log('No proposal found for transaction');
              }
            } catch (error) {
              console.error('Failed to fetch transaction details:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching transaction:', error);
      }
    };

    fetchTransactionDetails();
  }, [transactionPda, connection, multisigAddress, programId]);

  if (!transactionPda) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-foreground">Transaction Not Found</h1>
          <p className="mb-4 text-muted-foreground">
            The requested transaction could not be found.
          </p>
          <Button onClick={() => navigate('/transactions')}>Back to Transactions</Button>
        </div>
      </div>
    );
  }

  // Check if transaction is stale
  const isStale =
    transactionIndex !== null &&
    multisigConfig &&
    Number(multisigConfig.staleTransactionIndex) > Number(transactionIndex);

  // Determine which action buttons to show
  const proposalStatus = proposal?.status.__kind || 'None';
  const showApprove = !isStale && ['None', 'Draft', 'Active'].includes(proposalStatus);
  const showReject = !isStale && ['None', 'Draft', 'Active'].includes(proposalStatus);
  const showExecute = !isStale && proposalStatus === 'Approved';
  const showCancel = !isStale && proposalStatus === 'Approved';

  return (
    <div className="container mx-auto py-8">
      {/* Header with tags on right */}
      <div className="mb-6">
        {/* Top row with back link and tags */}
        <div className="mb-4 flex items-start justify-between">
          <Link to="/transactions" className="text-sm text-primary hover:underline">
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
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">Transaction Details</h1>
              {transactionType !== 'unknown' && (
                <span
                  className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                    transactionType === 'vault'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  }`}
                >
                  {transactionType === 'vault' ? 'Vault Transaction' : 'Config Transaction'}
                </span>
              )}
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
            <p className="mt-1 font-mono text-sm text-muted-foreground">{transactionPda}</p>
          </div>
          {transactionIndex !== null && multisigAddress && (
            <div className="flex gap-2">
              {showApprove && (
                <ApproveButton
                  multisigPda={multisigAddress}
                  transactionIndex={Number(transactionIndex)}
                  proposalStatus={proposalStatus}
                  programId={programId?.toBase58() || multisig.PROGRAM_ID.toBase58()}
                />
              )}
              {showReject && (
                <RejectButton
                  multisigPda={multisigAddress}
                  transactionIndex={Number(transactionIndex)}
                  proposalStatus={proposalStatus}
                  programId={programId?.toBase58() || multisig.PROGRAM_ID.toBase58()}
                />
              )}
              {showExecute && (
                <ExecuteButton
                  multisigPda={multisigAddress}
                  transactionIndex={Number(transactionIndex)}
                  proposalStatus={proposalStatus}
                  programId={programId?.toBase58() || multisig.PROGRAM_ID.toBase58()}
                />
              )}
              {showCancel && (
                <CancelButton
                  multisigPda={multisigAddress}
                  transactionIndex={Number(transactionIndex)}
                  proposalStatus={proposalStatus}
                  programId={programId?.toBase58() || multisig.PROGRAM_ID.toBase58()}
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
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
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
