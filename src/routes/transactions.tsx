import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Suspense, useState } from 'react';
import CreateTransaction from '@/components/CreateTransactionButton';
import TransactionTable from '@/components/TransactionTable';
import TransactionTableMobile from '@/components/TransactionTableMobile';
import { useMultisig, useTransactions } from '@/hooks/useServices';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useAccess } from '@/hooks/useAccess';
import { useQueryClient } from '@tanstack/react-query';
import { submitBatchApprovals } from '@/lib/transaction/batchApprovals';
import { toast } from 'sonner';
import { CheckSquare, Loader2 } from 'lucide-react';

const TRANSACTIONS_PER_PAGE = 10;

export default function TransactionsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageParam = new URLSearchParams(location.search).get('page');
  let page = pageParam ? parseInt(pageParam, 10) : 1;
  if (page < 1) {
    page = 1;
  }
  const { multisigAddress, programId, connection } = useMultisigData();
  const { data } = useMultisig();
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const isMember = useAccess();
  const queryClient = useQueryClient();
  const [batchMode, setBatchMode] = useState(false);
  const [selectedTxs, setSelectedTxs] = useState<Set<number>>(new Set());
  const [isApproving, setIsApproving] = useState(false);

  // Check if we have a valid multisig
  if (!multisigAddress || !data) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div>Loading...</div>}>
          <div className="">
            <h1 className="text-3xl font-bold">Transactions</h1>
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                Please select a valid squad to view transactions.
              </p>
            </div>
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  const totalTransactions = Number(data ? data.transactionIndex : 0);
  const totalPages = Math.ceil(totalTransactions / TRANSACTIONS_PER_PAGE);

  const startIndex = totalTransactions - (page - 1) * TRANSACTIONS_PER_PAGE;
  const endIndex = Math.max(startIndex - TRANSACTIONS_PER_PAGE + 1, 1);

  const { data: latestTransactions } = useTransactions(startIndex, endIndex);

  const transactions = (latestTransactions || []).map((transaction) => {
    return {
      ...transaction,
      transactionPda: transaction.transactionPda[0].toBase58(),
    };
  });

  const toggleBatchMode = () => {
    if (batchMode) {
      setSelectedTxs(new Set());
    }
    setBatchMode(!batchMode);
  };

  const toggleTx = (index: number) => {
    setSelectedTxs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleBatchApprove = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }
    if (!multisigAddress || !programId || selectedTxs.size === 0) return;

    const items = transactions
      .filter((tx) => selectedTxs.has(Number(tx.index)))
      .map((tx) => ({
        transactionIndex: Number(tx.index),
        proposalStatus: tx.proposal?.status.__kind || 'None',
      }));

    setIsApproving(true);
    try {
      await submitBatchApprovals(items, connection, multisigAddress, programId, wallet);
      toast.success(`Approved ${items.length} proposals`);
      setSelectedTxs(new Set());
      setBatchMode(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
      ]);
    } catch (error: any) {
      toast.error(`Batch approval failed: ${error?.message || error}`);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">Loading transactions...</p>
            </div>
          </div>
        }
      >
        <div>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Transactions</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage and execute multisig transactions
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isMember && wallet.connected && (
                <>
                  {batchMode && selectedTxs.size > 0 && (
                    <Button
                      size="sm"
                      onClick={handleBatchApprove}
                      disabled={isApproving}
                    >
                      {isApproving ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckSquare className="mr-1.5 h-4 w-4" />
                      )}
                      Approve ({selectedTxs.size})
                    </Button>
                  )}
                  <Button
                    variant={batchMode ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={toggleBatchMode}
                    disabled={isApproving}
                  >
                    <CheckSquare className="mr-1.5 h-4 w-4" />
                    {batchMode ? 'Cancel' : 'Batch Approve'}
                  </Button>
                </>
              )}
              <CreateTransaction />
            </div>
          </div>

          <Suspense>
            {/* Desktop Table View */}
            <div className="hidden sm:block">
              <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border hover:bg-transparent">
                      <TableHead className="w-20 whitespace-nowrap font-semibold text-foreground">
                        Index
                      </TableHead>
                      <TableHead className="min-w-[150px] font-semibold text-foreground">
                        Proposal
                      </TableHead>
                      <TableHead className="whitespace-nowrap font-semibold text-foreground">
                        Status
                      </TableHead>
                      <TableHead className="whitespace-nowrap text-right font-semibold text-foreground">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <Suspense>
                    <TransactionTable
                      multisigPda={multisigAddress!}
                      transactions={transactions}
                      programId={programId!.toBase58()}
                      batchMode={batchMode}
                      selectedTxs={selectedTxs}
                      onToggleTx={toggleTx}
                    />
                  </Suspense>
                </Table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden">
              <TransactionTableMobile
                multisigPda={multisigAddress!}
                transactions={transactions}
                programId={programId!.toBase58()}
                batchMode={batchMode}
                selectedTxs={selectedTxs}
                onToggleTx={toggleTx}
              />
            </div>
          </Suspense>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {Math.max(endIndex, 0)} - {startIndex} of {totalTransactions} transactions
            </p>
            <Pagination>
              <PaginationContent>
                {page > 1 && (
                  <PaginationPrevious
                    onClick={() => navigate(`/${multisigAddress}/transactions?page=${page - 1}`)}
                    to={`/${multisigAddress}/transactions?page=${page - 1}`}
                  />
                )}
                <span className="mx-4 text-sm text-muted-foreground">
                  Page {page} of {totalPages || 1}
                </span>
                {page < totalPages && (
                  <PaginationNext
                    to={`/${multisigAddress}/transactions?page=${page + 1}`}
                    onClick={() => navigate(`/${multisigAddress}/transactions?page=${page + 1}`)}
                  />
                )}
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
