import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import * as multisig from '@sqds/multisig';
import { PublicKey } from '@solana/web3.js';
import { toast } from 'sonner';
import { useMultisig } from '../hooks/useServices';
import { signSendAndConfirmV0 } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';
import { proposedMessage, withProposal } from '../lib/transaction/proposalInstructions';
import { useQueryClient } from '@tanstack/react-query';
import { useMultisigData } from '../hooks/useMultisigData';
import { useProposePermissions } from '../hooks/useProposePermissions';
import { DisabledReason } from './DisabledReason';
import { TIME_LOCK_UNITS, formatDuration, parseTimeLockInput } from '@/lib/timeLock';
import type { TimeLockUnit } from '@/lib/timeLock';

type ChangeTimeLockInputProps = {
  multisigPda: string;
  transactionIndex: number;
};

const ChangeTimeLockInput = ({ multisigPda, transactionIndex }: ChangeTimeLockInputProps) => {
  const { data: multisigConfig } = useMultisig();
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<TimeLockUnit>('hours');
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const queryClient = useQueryClient();
  const { canInitiate, canVote, initiateReason } = useProposePermissions();
  const { connection, programId } = useMultisigData();

  const parsed = value ? parseTimeLockInput(value, unit) : null;
  const newTimeLock = parsed && 'seconds' in parsed ? parsed.seconds : null;
  const currentTimeLock = multisigConfig?.timeLock ?? 0;

  const changeTimeLock = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      return;
    }
    if (!parsed || 'error' in parsed) {
      throw parsed ? parsed.error : 'Enter a time lock.';
    }

    const bigIntTransactionIndex = BigInt(transactionIndex);
    const program = programId ? new PublicKey(programId) : multisig.PROGRAM_ID;
    const setTimeLockIx = multisig.instructions.configTransactionCreate({
      multisigPda: new PublicKey(multisigPda),
      actions: [{ __kind: 'SetTimeLock', newTimeLock: parsed.seconds }],
      creator: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      rentPayer: wallet.publicKey,
      programId: program,
    });
    const proposalIxs = withProposal(setTimeLockIx, {
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      programId: program,
      approve: canVote,
    });

    await signSendAndConfirmV0(connection, wallet, proposalIxs, {
      label: 'ChangeTimeLockInput',
      onStep: toastSteps(),
    });
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['multisig'] });
  };

  return (
    <div>
      <p className="mb-3 text-sm">Current Time Lock: {formatDuration(currentTimeLock)}</p>
      <div className="mb-3 flex gap-2">
        <Input
          placeholder="0"
          type="text"
          inputMode="decimal"
          onChange={(e) => setValue(e.target.value.trim())}
        />
        <Select value={unit} onValueChange={(u) => setUnit(u as TimeLockUnit)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(TIME_LOCK_UNITS).map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {parsed && 'error' in parsed && (
        <p className="mb-3 text-xs text-destructive">{parsed.error}</p>
      )}
      <div className="border-warning/30 bg-warning/10 mb-3 rounded-md border p-2">
        <p className="text-warning text-xs">
          Executing this change makes every pending proposal stale. Stale proposals cannot be
          approved or rejected, and only already-approved vault transactions can still execute. The
          change itself must wait the current time lock ({formatDuration(currentTimeLock)}) after
          approval.
        </p>
      </div>
      <DisabledReason reason={initiateReason}>
        <Button
          onClick={() =>
            toast.promise(changeTimeLock, {
              id: 'transaction',
              loading: 'Loading...',
              success: proposedMessage('Time lock change proposed.', canVote),
              error: (e) => `Failed to propose: ${e}`,
            })
          }
          disabled={!canInitiate || newTimeLock === null || newTimeLock === currentTimeLock}
        >
          Change Time Lock
        </Button>
      </DisabledReason>
    </div>
  );
};

export default ChangeTimeLockInput;
