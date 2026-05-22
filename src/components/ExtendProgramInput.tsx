import { Button } from './ui/button';
import { Input } from './ui/input';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Info } from 'lucide-react';
import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { toast } from 'sonner';
import { SimplifiedProgramInfo } from '../hooks/useProgram';
import { useMultisigData } from '../hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';

type ExtendProgramInputProps = {
  programInfos: SimplifiedProgramInfo;
};

const ExtendProgramInput = ({
  programInfos,
}: ExtendProgramInputProps) => {
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const walletModal = useWalletModal();

  const [additionalBytes, setAdditionalBytes] = useState('');

  const { connection } = useMultisigData();

  const parsedBytes = parseInt(additionalBytes, 10);
  const isValidBytes = !isNaN(parsedBytes) && parsedBytes > 0;

  const extendProgram = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw 'Wallet not connected';
    }

    const extendData = Buffer.alloc(8);
    extendData.writeUInt32LE(6, 0);
    extendData.writeUInt32LE(parsedBytes, 4);

    const keys: AccountMeta[] = [
      {
        pubkey: new PublicKey(programInfos.programDataAddress),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: new PublicKey(programInfos.programAddress),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: wallet.publicKey,
        isWritable: true,
        isSigner: true,
      },
    ];

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const message = new TransactionMessage({
      instructions: [
        new TransactionInstruction({
          programId: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
          data: extendData,
          keys,
        }),
      ],
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    if (!wallet.signTransaction) {
      throw new Error('Wallet does not support transaction signing');
    }

    const signedTransaction = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    console.log('Transaction signature', signature);
    toast.loading('Confirming...', {
      id: 'transaction',
    });
    const sent = await waitForConfirmation(connection, [signature]);
    if (!sent[0]) {
      throw `Transaction failed or unable to confirm. Check ${signature}`;
    }
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
  };

  return (
    <div>
      <div className="mb-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
          <div className="text-sm text-blue-400">
            Extend is sent directly from your wallet (not through the multisig) because the BPF
            Loader does not support this instruction via CPI. No upgrade authority is required.
          </div>
        </div>
      </div>
      <Input
        placeholder="Additional Bytes"
        type="number"
        min="1"
        onChange={(e) => setAdditionalBytes(e.target.value)}
        className="mb-3"
      />
      <Button
        onClick={() =>
          toast.promise(extendProgram, {
            id: 'transaction',
            loading: 'Extending program...',
            success: 'Program extended successfully.',
            error: (e) => `Failed to extend: ${e}`,
          })
        }
        disabled={
          !wallet.publicKey ||
          !isValidBytes ||
          !programInfos.programAddress ||
          !programInfos.programDataAddress
        }
      >
        Extend Program
      </Button>
    </div>
  );
};

export default ExtendProgramInput;
