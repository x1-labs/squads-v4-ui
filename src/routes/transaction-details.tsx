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

// Analyze transaction to detect transfer types (same logic as TransactionProgramBadge)
const analyzeTransactionType = (vaultTx: any): string | null => {
  try {
    if (!vaultTx.message || !vaultTx.message.instructions) return null;

    const instructions = vaultTx.message.instructions;
    const accountKeys = vaultTx.message.accountKeys;

    // Check each instruction
    for (const instruction of instructions) {
      const programIdKey = accountKeys[instruction.programIdIndex];
      const programIdStr =
        programIdKey instanceof PublicKey
          ? programIdKey.toBase58()
          : typeof programIdKey === 'string'
            ? programIdKey
            : new PublicKey(programIdKey).toBase58();

      // System Program Transfer (SOL transfer)
      if (programIdStr === '11111111111111111111111111111111') {
        const data = instruction.data;
        // System transfer instruction starts with 2 (u32 little-endian: 0x02000000)
        if (
          data &&
          data.length >= 4 &&
          data[0] === 2 &&
          data[1] === 0 &&
          data[2] === 0 &&
          data[3] === 0
        ) {
          return 'SOL Transfer';
        }
      }

      // SPL Token Transfer
      if (programIdStr === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        const data = instruction.data;
        // Token transfer instruction is 3, transferChecked is 12
        if (data && data.length > 0 && (data[0] === 3 || data[0] === 12)) {
          return 'SPL Token Transfer';
        }
      }

      // Token-2022 Transfer
      if (programIdStr === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
        const data = instruction.data;
        // Token transfer instruction is 3, transferChecked is 12
        if (data && data.length > 0 && (data[0] === 3 || data[0] === 12)) {
          return 'Token-2022 Transfer';
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error analyzing transaction type:', error);
    return null;
  }
};

export default function TransactionDetailsPage() {
  const { transactionPda } = useParams<{ transactionPda: string }>();
  const navigate = useNavigate();
  const { rpcUrl } = useRpcUrl();
  const { multisigAddress, programId } = useMultisigData();
  const { data: multisigConfig } = useMultisig();

  // Create connection with the configured RPC URL
  const connection = useMemo(() => {
    return new Connection(rpcUrl || 'https://api.mainnet-beta.solana.com', 'confirmed');
  }, [rpcUrl]);

  // Extract transaction index and proposal from the PDA
  const [transactionIndex, setTransactionIndex] = React.useState<bigint | null>(null);
  const [proposal, setProposal] = React.useState<multisig.generated.Proposal | null>(null);
  const [transactionType, setTransactionType] = React.useState<string>('Transaction');

  React.useEffect(() => {
    const fetchTransactionDetails = async () => {
      if (!transactionPda || !multisigAddress || !programId) return;

      try {
        // Try to fetch the transaction to get its index
        const transactionPubkey = new PublicKey(transactionPda);
        const multisigPubkey = new PublicKey(multisigAddress);

        // Try as VaultTransaction first
        try {
          const vaultTx = await multisig.accounts.VaultTransaction.fromAccountAddress(
            connection as any,
            transactionPubkey
          );
          const index = BigInt(vaultTx.index.toString());
          setTransactionIndex(index);

          // Detect transaction type
          const txType = analyzeTransactionType(vaultTx);
          if (txType) {
            setTransactionType(txType);
          } else {
            setTransactionType('Transaction');
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
            setTransactionType('Config Transaction');

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
              setTransactionType('Batch Transaction');

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
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            to="/transactions"
            className="mb-2 inline-block text-sm text-primary hover:underline"
          >
            ← Back to Transactions
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{transactionType} Details</h1>
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
            <div className="flex-1">
              <p className="text-warning text-sm font-medium">This transaction is stale</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {proposalStatus === 'Rejected'
                  ? 'This transaction was rejected before becoming stale.'
                  : 'This transaction has been superseded by newer transactions and can no longer be executed. No actions are available for stale transactions.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Approval Status Card */}
      {proposal && (
        <div className="mb-6 rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Approval Status</h2>
          <ApprovalStatus proposal={proposal} compact={false} isStale={isStale || false} />
        </div>
      )}

      {/* Transaction Decoder */}
      <div className="rounded-lg border border-border bg-card shadow-sm">
        {transactionIndex !== null && multisigAddress && programId ? (
          <TransactionDecoder
            connection={connection}
            multisigPda={new PublicKey(multisigAddress)}
            transactionIndex={transactionIndex}
            programId={programId}
          />
        ) : (
          <div className="p-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="mt-2 text-sm text-muted-foreground">Loading transaction details...</p>
          </div>
        )}
      </div>
    </div>
  );
}
