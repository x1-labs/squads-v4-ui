import { StakingPanel } from '@/components/staking/StakingPanel';
import { ValidatorStakePanel } from '@/components/staking/ValidatorStakePanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Suspense } from 'react';
import { useMultisigData } from '@/hooks/useMultisigData';

const StakePage = () => {
  const { multisigAddress } = useMultisigData();

  if (!multisigAddress) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<div>Loading...</div>}>
          <div className="">
            <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Staking</h1>
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                Please select a valid squad to view staking options.
              </p>
            </div>
          </div>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <div className="space-y-6">
          <div className="border-b border-border pb-4">
            <h1 className="text-2xl font-bold sm:text-3xl">Staking</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your XNT stake pools and validator delegations
            </p>
          </div>
          
          <StakingPanel />
          <ValidatorStakePanel />
        </div>
      </Suspense>
    </ErrorBoundary>
  );
};

export default StakePage;