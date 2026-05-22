import { Button } from './ui/button';
import { Input } from './ui/input';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AlertCircle } from 'lucide-react';
import * as multisig from '@sqds/multisig';
import {
  AccountMeta,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { toast } from 'sonner';
import { isPublickey } from '@/lib/isPublickey';
import { SimplifiedProgramInfo } from '../hooks/useProgram';
import { useMultisigData } from '../hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';

type CreateProgramUpgradeInputProps = {
  programInfos: SimplifiedProgramInfo;
  transactionIndex: number;
};

const CreateProgramUpgradeInput = ({
  programInfos,
  transactionIndex,
}: CreateProgramUpgradeInputProps) => {
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const walletModal = useWalletModal();

  const [bufferAddress, setBufferAddress] = useState('');
  const [spillAddress, setSpillAddress] = useState('');
  const [bufferWarning, setBufferWarning] = useState<string | null>(null);
  const [checkingBuffer, setCheckingBuffer] = useState(false);

  const { connection, multisigAddress, vaultIndex, programId, multisigVault } = useMultisigData();

  const bigIntTransactionIndex = BigInt(transactionIndex);

  useEffect(() => {
    if (!isPublickey(bufferAddress) || !multisigVault) {
      setBufferWarning(null);
      return;
    }

    let cancelled = false;
    setCheckingBuffer(true);
    setBufferWarning(null);

    const checkBufferAuthority = async () => {
      try {
        const accountInfo = await connection.getAccountInfo(new PublicKey(bufferAddress));

        if (cancelled) return;

        if (!accountInfo) {
          setBufferWarning('Buffer account not found on-chain.');
          return;
        }

        const data = accountInfo.data;
        const accountType = data.readUInt32LE(0);
        if (accountType !== 1) {
          setBufferWarning('Account is not a BPF Loader buffer.');
          return;
        }

        const hasAuthority = data[4] === 1;
        if (!hasAuthority) {
          setBufferWarning('Buffer has no authority set (immutable).');
          return;
        }

        const authority = new PublicKey(data.slice(5, 37));
        const vaultAddress = new PublicKey(multisigVault);

        if (!authority.equals(vaultAddress)) {
          const shortAuth = `${authority.toBase58().slice(0, 8)}...${authority.toBase58().slice(-4)}`;
          setBufferWarning(
            `Buffer authority (${shortAuth}) does not match the multisig vault. ` +
            `Transfer it first:\n` +
            `solana program set-buffer-authority ${bufferAddress} --new-buffer-authority ${multisigVault}`
          );
        } else {
          setBufferWarning(null);
        }
      } catch {
        if (!cancelled) {
          setBufferWarning('Failed to verify buffer authority.');
        }
      } finally {
        if (!cancelled) {
          setCheckingBuffer(false);
        }
      }
    };

    checkBufferAuthority();

    return () => { cancelled = true; };
  }, [bufferAddress, multisigVault, connection]);

  const changeUpgradeAuth = async () => {
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
    const vaultAddress = new PublicKey(multisigVault);
    const multisigPda = new PublicKey(multisigAddress);
    const upgradeData = Buffer.alloc(4);
    upgradeData.writeInt32LE(3, 0);

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
        pubkey: new PublicKey(bufferAddress),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: new PublicKey(spillAddress),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: SYSVAR_CLOCK_PUBKEY,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: vaultAddress,
        isWritable: false,
        isSigner: true,
      },
    ];

    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const transactionMessage = new TransactionMessage({
      instructions: [
        new TransactionInstruction({
          programId: new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'),
          data: upgradeData,
          keys,
        }),
      ],
      payerKey: new PublicKey(vaultAddress),
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
  return (
    <div>
      <Input
        placeholder="Buffer Address"
        type="text"
        onChange={(e) => setBufferAddress(e.target.value)}
        className="mb-3"
      />
      <Input
        placeholder="Buffer Refund (Spill Address)"
        type="text"
        onChange={(e) => setSpillAddress(e.target.value)}
        className="mb-3"
      />
      {bufferWarning && (
        <div className="mb-3 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-500" />
            <div className="whitespace-pre-wrap text-sm text-yellow-500">{bufferWarning}</div>
          </div>
        </div>
      )}
      <Button
        onClick={() =>
          toast.promise(changeUpgradeAuth, {
            id: 'transaction',
            loading: 'Loading...',
            success: 'Upgrade authority change proposed.',
            error: (e) => `Failed to propose: ${e}`,
          })
        }
        disabled={
          !programId ||
          !isPublickey(bufferAddress) ||
          !isPublickey(spillAddress) ||
          !isPublickey(programInfos.programAddress) ||
          !isPublickey(programInfos.authority) ||
          !isPublickey(programInfos.programDataAddress) ||
          !!bufferWarning ||
          checkingBuffer
        }
      >
        Create upgrade
      </Button>
    </div>
  );
};

export default CreateProgramUpgradeInput;
