import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import * as bs58 from 'bs58';
import { Button } from './ui/button';
import { useState } from 'react';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { Message, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { simulateEncodedTransaction } from '@/lib/transaction/simulateEncodedTransaction';
import { importTransaction } from '@/lib/transaction/importTransaction';
import { useMultisigData } from '@/hooks/useMultisigData';
import invariant from 'invariant';
import { VaultSelector } from './VaultSelector';
import { useMultisig } from '@/hooks/useServices';

const CreateTransaction = () => {
  const wallet = useWallet();

  const [tx, setTx] = useState('');
  const [open, setOpen] = useState(false);

  const { connection, multisigAddress, vaultIndex, programId } = useMultisigData();
  const { data: multisigConfig } = useMultisig();
  
  // Check if this is a controlled multisig
  const isControlled = multisigConfig?.configAuthority && 
    multisigConfig.configAuthority.toBase58() !== '11111111111111111111111111111111';

  const getSampleMessage = async () => {
    invariant(programId, 'Program ID not found');
    invariant(multisigAddress, 'Multisig address not found. Please create a multisig first.');
    invariant(wallet.publicKey, 'Wallet ID not found');
    let memo = 'Hello from Solana land!';
    const vaultAddress = multisig.getVaultPda({
      index: vaultIndex,
      multisigPda: new PublicKey(multisigAddress),
      programId: programId,
    })[0];

    const dummyMessage = Message.compile({
      instructions: [
        new TransactionInstruction({
          keys: [
            {
              pubkey: wallet.publicKey,
              isSigner: true,
              isWritable: true,
            },
          ],
          data: Buffer.from(memo, 'utf-8'),
          programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        }),
      ],
      payerKey: vaultAddress,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    });

    const encoded = bs58.default.encode(dummyMessage.serialize());

    setTx(encoded);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
      <DialogTrigger
        className={`h-10 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground ${!wallet || !wallet.publicKey ? `bg-primary/50 hover:bg-primary/50` : `hover:bg-primary/90`}`}
        disabled={!wallet || !wallet.publicKey}
      >
        Import Transaction
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Transaction</DialogTitle>
          <DialogDescription>
            Propose a transaction from a base58 encoded transaction message (not a transaction).
          </DialogDescription>
        </DialogHeader>
        
        {isControlled && (
          <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
            <div className="flex items-start gap-2">
              <svg className="h-4 w-4 text-warning mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-warning">Controlled Multisig</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Configuration transactions are not supported for controlled multisigs. Only regular vault transactions can be created.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className={`flex items-center justify-between gap-2`}>
          <p>Using Vault Index:</p>
          <VaultSelector />
        </div>
        <Input
          placeholder="Paste base58 encoded transaction..."
          type="text"
          defaultValue={tx}
          onChange={(e) => setTx(e.target.value.trim())}
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            onClick={() => {
              toast('Note: Simulations may fail on alt-SVM', {
                description: 'Please verify via an explorer before submitting.',
              });
              toast.promise(simulateEncodedTransaction(tx, connection, wallet), {
                id: 'simulation',
                loading: 'Building simulation...',
                success: 'Simulation successful.',
                error: (e) => {
                  return `${e}`;
                },
              });
            }}
          >
            Simulate
          </Button>
          {multisigAddress && (
            <Button
              onClick={() =>
                toast.promise(
                  importTransaction(
                    tx,
                    connection,
                    multisigAddress,
                    programId.toBase58(),
                    vaultIndex,
                    wallet
                  ),
                  {
                    id: 'transaction',
                    loading: 'Building transaction...',
                    success: () => {
                      setOpen(false);
                      return 'Transaction proposed.';
                    },
                    error: (e) => `Failed to propose: ${e}`,
                  }
                )
              }
            >
              Import
            </Button>
          )}
        </div>
        <button
          onClick={() => getSampleMessage()}
          disabled={!wallet || !wallet.publicKey}
          className="flex cursor-pointer justify-end text-xs text-stone-400 underline hover:text-stone-200"
        >
          Click to use a sample memo for testing
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTransaction;
