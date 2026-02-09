import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Suspense } from 'react';
import CreateTransaction from '@/components/CreateTransactionButton';
import TransactionTable from '@/components/TransactionTable';
import TransactionTableMobile from '@/components/TransactionTableMobile';
import { useMultisig, useTransactions } from '@/hooks/useServices';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BatchApprovalPanel } from '@/components/batch/BatchApprovalPanel';
import { BatchExecutePanel } from '@/components/batch/BatchExecutePanel';

const TRANSACTIONS_PER_PAGE = 10;

export default function TransactionsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const pageParam = new URLSearchParams(location.search).get('page');
  let page = pageParam ? parseInt(pageParam, 10) : 1;
  if (page < 1) {
    page = 1;
  }
  const { multisigAddress, programId } = useMultisigData();
  const { data } = useMultisig();

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
            <CreateTransaction />
          </div>

          <BatchApprovalPanel />
          <BatchExecutePanel />

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
