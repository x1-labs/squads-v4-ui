import { Button } from './ui/button';
import { Input } from './ui/input';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import * as multisig from '@sqds/multisig';
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
  transactionIndex: number;
};

const ExtendProgramInput = ({ programInfos, transactionIndex }: ExtendProgramInputProps) => {
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const walletModal = useWalletModal();

  const [additionalBytes, setAdditionalBytes] = useState('');

  const { connection, multisigAddress, vaultIndex, programId, multisigVault } = useMultisigData();

  const bigIntTransactionIndex = BigInt(transactionIndex);

  const extendProgram = async () => {
    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw 'Wallet not connected';
    }
    if (!multisigVault) {
      throw 'Multisig vault not found';
    }
    if (!multisigAddress) {
      throw 'Multisig not found';
    }

    const bytesToAdd = parseInt(additionalBytes, 10);
    if (isNaN(bytesToAdd) || bytesToAdd <= 0) {
      throw 'Invalid number of bytes';
    }

    const vaultAddress = new PublicKey(multisigVault);
    const multisigPda = new PublicKey(multisigAddress);

    // BPF Loader ExtendProgram instruction (type 6)
    // Data format: 4 bytes instruction type + 4 bytes additional_bytes
    const extendData = Buffer.alloc(8);
    extendData.writeUInt32LE(6, 0); // instruction type
    extendData.writeUInt32LE(bytesToAdd, 4); // additional bytes

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
        pubkey: vaultAddress,
        isWritable: true,
        isSigner: true,
      },
    ];

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const transactionMessage = new TransactionMessage({
      instructions: [
        new TransactionInstruction({
          programId: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
          data: extendData,
          keys,
        }),
      ],
      payerKey: vaultAddress,
      recentBlockhash: blockhash,
    });

    const transactionIndexBN = BigInt(transactionIndex);

    const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
      multisigPda,
      creator: wallet.publicKey,
      ephemeralSigners: 0,
      // @ts-ignore
      transactionMessage,
      transactionIndex: transactionIndexBN,
      addressLookupTableAccounts: [],
      rentPayer: wallet.publicKey,
      vaultIndex: vaultIndex,
      programId,
    });
    const proposalIx = multisig.instructions.proposalCreate({
      multisigPda,
      creator: wallet.publicKey,
      isDraft: false,
      transactionIndex: bigIntTransactionIndex,
      rentPayer: wallet.publicKey,
      programId,
    });
    const approveIx = multisig.instructions.proposalApprove({
      multisigPda,
      member: wallet.publicKey,
      transactionIndex: bigIntTransactionIndex,
      programId,
    });

    const message = new TransactionMessage({
      instructions: [multisigTransactionIx, proposalIx, approveIx],
      payerKey: wallet.publicKey,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    // Sign transaction first, then send manually to avoid "Plugin Closed" errors
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

  const isValidBytes =
    additionalBytes.trim() !== '' &&
    !isNaN(parseInt(additionalBytes, 10)) &&
    parseInt(additionalBytes, 10) > 0;

  return (
    <div>
      <Input
        placeholder="Additional bytes (e.g. 10000)"
        type="number"
        min="1"
        onChange={(e) => setAdditionalBytes(e.target.value)}
        className="mb-3"
      />
      <p className="mb-3 text-sm text-muted-foreground">
        Extend the program account to allow for larger deployments. The vault will pay for the
        additional space.
      </p>
      <Button
        onClick={() =>
          toast.promise(extendProgram, {
            id: 'transaction',
            loading: 'Loading...',
            success: 'Program extension proposed.',
            error: (e) => `Failed to propose: ${e}`,
          })
        }
        disabled={
          !programId ||
          !isValidBytes ||
          !programInfos.programAddress ||
          !programInfos.programDataAddress
        }
      >
        Extend program
      </Button>
    </div>
  );
};

export default ExtendProgramInput;