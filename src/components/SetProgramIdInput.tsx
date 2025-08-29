'use client';

import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { isPublickey } from '~/lib/isPublickey';
import { useProgramId } from '~/hooks/useSettings'; // Now using React Query!

const SetProgramIdInput = () => {
  const { programId: storedProgramId, setProgramId } = useProgramId(); // Use React Query
  const [programId, setProgramIdState] = useState(storedProgramId || '');

  const publicKeyTest = isPublickey(programId);

  const onSubmit = async () => {
    if (publicKeyTest) {
      await setProgramId.mutateAsync(programId); // Use React Query mutation
      setProgramIdState(''); // Clear input field after submission
    } else {
      throw 'Please enter a valid program.';
    }
  };

  return (
    <div>
      <Input
        onChange={(e) => setProgramIdState(e.target.value.trim())}
        placeholder={storedProgramId || 'DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941'}
        value={programId} // Sync input state with stored value
        className=""
      />
      {!publicKeyTest && programId.length > 0 && (
        <p className="mt-2 text-xs text-red-500">Please enter a valid key.</p>
      )}
      <Button
        onClick={() =>
          toast.promise(onSubmit(), {
            loading: 'Updating Program ID...',
            success: 'Program ID set successfully.',
            error: (err) => `${err}`,
          })
        }
        disabled={!publicKeyTest && programId.length > 0}
        className="mt-2"
      >
        Set Program ID
      </Button>
    </div>
  );
};

export default SetProgramIdInput;
