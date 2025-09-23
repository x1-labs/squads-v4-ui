import React from 'react';
import { ValidatorsPanel } from '@/components/validators/ValidatorsPanel';

const ValidatorsPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Validators</h1>
        <p className="mt-2 text-muted-foreground">
          Manage validators where your Squad is the withdraw authority
        </p>
      </div>
      <ValidatorsPanel />
    </div>
  );
};

export default ValidatorsPage;