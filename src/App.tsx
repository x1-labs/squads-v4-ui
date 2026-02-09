import React, { Suspense } from 'react';
import { Wallet } from './components/Wallet';
import { QueryClientProvider } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckSquare } from 'lucide-react';
import { Toaster } from './components/ui/sonner';
import TabNav from './components/TabNav';
import { ThemeProvider } from './contexts/ThemeContext';

import HomePage from './routes/_index';
import ConfigPage from './routes/config';
import CreatePage from './routes/create';
import SettingsPage from './routes/settings';
import TransactionsPage from './routes/transactions';
import TransactionDetailsPage from './routes/transaction-details';
import ProgramsPage from './routes/programs';
import StakePage from './routes/stake';
import ValidatorsPage from './routes/validators';
import { Routes, Route, BrowserRouter } from 'react-router-dom';

import './styles/global.css'; // ✅ Load Tailwind styles
import { ErrorBoundary } from './components/ErrorBoundary';
import { AutoAddEnvSquads } from './components/AutoAddEnvSquads';
import { BatchTransactionsProvider } from './hooks/useBatchTransactions';
import { BatchApprovalsProvider } from './hooks/useBatchApprovals';
import { BatchExecutesProvider } from './hooks/useBatchExecutes';

const App = () => {
  const queryClient = new QueryClient();

  // @ts-ignore
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Wallet>
          <BatchTransactionsProvider>
          <BatchApprovalsProvider>
          <BatchExecutesProvider>
          <BrowserRouter>
            <div className="flex h-screen min-w-full flex-col bg-background dark:bg-background md:flex-row">
              <Suspense fallback={null}>
                <AutoAddEnvSquads />
              </Suspense>
              <Suspense>
                <TabNav />
              </Suspense>
              <div className="mt-16 space-y-2 p-3 pb-24 pt-4 md:ml-auto md:mt-1 md:w-9/12 md:space-y-4 md:p-8 md:pt-6">
                <ErrorBoundary>
                  <Suspense fallback={<p>Loading...</p>}>
                    <Routes>
                      <Route index path="/" element={<HomePage />} />
                      <Route path="/config" element={<ConfigPage />} />
                      <Route path="/create" element={<CreatePage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/:multisigAddress" element={<HomePage />} />
                      <Route path="/:multisigAddress/config" element={<ConfigPage />} />
                      <Route path="/:multisigAddress/stake" element={<StakePage />} />
                      <Route path="/:multisigAddress/transactions" element={<TransactionsPage />} />
                      <Route path="/:multisigAddress/transactions/:transactionPda" element={<TransactionDetailsPage />} />
                      <Route path="/:multisigAddress/programs" element={<ProgramsPage />} />
                      <Route path="/:multisigAddress/validators" element={<ValidatorsPage />} />
                      <Route path="*" element={<p>404 - Not Found</p>} /> {/* Catch-all route */}
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </div>

              <Toaster
                expand
                visibleToasts={3}
                icons={{
                  error: <AlertTriangle className="h-4 w-4 text-red-600" />,
                  success: <CheckSquare className="h-4 w-4 text-green-600" />,
                }}
              />
            </div>
          </BrowserRouter>
          </BatchExecutesProvider>
          </BatchApprovalsProvider>
          </BatchTransactionsProvider>
        </Wallet>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
