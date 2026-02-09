import * as multisig from '@sqds/multisig';
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { waitForConfirmation } from '~/lib/transactionConfirmation';

export interface BatchProposalItem {
  instructions: TransactionInstruction[];
  vaultIndex: number;
  label: string;
}

export interface BatchProgress {
  total: number;
  signed: number;
  sent: number;
  confirmed: number;
  failed: number;
  currentStep: 'preparing' | 'signing' | 'sending' | 'confirming' | 'done' | 'error';
  errors: string[];
}

export async function submitBatchProposals(
  items: BatchProposalItem[],
  connection: Connection,
  multisigPda: string,
  programId: PublicKey,
  wallet: WalletContextState,
  onProgress: (progress: BatchProgress) => void
): Promise<{ succeeded: number; failed: number }> {
  if (!wallet.publicKey || !wallet.signAllTransactions) {
    throw new Error('Wallet must be connected and support signAllTransactions');
  }

  const progress: BatchProgress = {
    total: items.length,
    signed: 0,
    sent: 0,
    confirmed: 0,
    failed: 0,
    currentStep: 'preparing',
    errors: [],
  };
  onProgress({ ...progress });

  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    // @ts-ignore
    connection,
    new PublicKey(multisigPda)
  );

  const currentTransactionIndex = Number(multisigInfo.transactionIndex);
  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  // Build all transactions
  const transactions: VersionedTransaction[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const transactionIndex = currentTransactionIndex + 1 + i;
    const transactionIndexBN = BigInt(transactionIndex);

    const vaultAddress = multisig.getVaultPda({
      index: item.vaultIndex,
      multisigPda: new PublicKey(multisigPda),
      programId,
    })[0];

    const innerMessage = new TransactionMessage({
      instructions: item.instructions,
      payerKey: vaultAddress,
      recentBlockhash: blockhash,
    });

    const vaultTransactionIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      ephemeralSigners: 0,
      // @ts-ignore
      transactionMessage: innerMessage,
      transactionIndex: transactionIndexBN,
      addressLookupTableAccounts: [],
      rentPayer: wallet.publicKey,
      vaultIndex: item.vaultIndex,
      programId,
    });

    const proposalIx = multisig.instructions.proposalCreate({
      multisigPda: new PublicKey(multisigPda),
      creator: wallet.publicKey,
      isDraft: false,
      transactionIndex: transactionIndexBN,
      rentPayer: wallet.publicKey,
      programId,
    });

    const approveIx = multisig.instructions.proposalApprove({
      multisigPda: new PublicKey(multisigPda),
      member: wallet.publicKey,
      transactionIndex: transactionIndexBN,
      programId,
    });

    const message = new TransactionMessage({
      instructions: [vaultTransactionIx, proposalIx, approveIx],
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
    }).compileToV0Message();

    transactions.push(new VersionedTransaction(message));
  }

  // Sign all transactions at once
  progress.currentStep = 'signing';
  onProgress({ ...progress });

  let signedTransactions: VersionedTransaction[];
  try {
    signedTransactions = await wallet.signAllTransactions(transactions);
    progress.signed = items.length;
    onProgress({ ...progress });
  } catch (error: any) {
    progress.currentStep = 'error';
    progress.errors.push(`Signing failed: ${error?.message || error}`);
    onProgress({ ...progress });
    throw new Error('Transaction signing was cancelled or failed');
  }

  // Send transactions sequentially
  progress.currentStep = 'sending';
  onProgress({ ...progress });

  const signatures: string[] = [];
  for (let i = 0; i < signedTransactions.length; i++) {
    try {
      const signature = await connection.sendRawTransaction(
        signedTransactions[i].serialize(),
        {
          skipPreflight: false,
          maxRetries: 3,
        }
      );
      signatures.push(signature);
      progress.sent = i + 1;
      onProgress({ ...progress });
    } catch (error: any) {
      progress.failed++;
      progress.errors.push(`${items[i].label}: ${error?.message || error}`);
      signatures.push('');
      onProgress({ ...progress });
    }
  }

  // Confirm in batches
  progress.currentStep = 'confirming';
  onProgress({ ...progress });

  const validSignatures = signatures.filter((s) => s !== '');
  if (validSignatures.length > 0) {
    // Confirm in groups of 5 to avoid overwhelming the RPC
    const batchSize = 5;
    for (let i = 0; i < validSignatures.length; i += batchSize) {
      const batch = validSignatures.slice(i, i + batchSize);
      try {
        const statuses = await waitForConfirmation(connection, batch, 30000);
        for (const status of statuses) {
          if (status && !status.err) {
            progress.confirmed++;
          } else {
            progress.failed++;
          }
        }
      } catch {
        progress.failed += batch.length;
      }
      onProgress({ ...progress });
    }
  }

  progress.currentStep = 'done';
  onProgress({ ...progress });

  return {
    succeeded: progress.confirmed,
    failed: progress.failed,
  };
}
