import * as multisig from '@sqds/multisig';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { waitForConfirmation } from '~/lib/transactionConfirmation';

export interface ApprovalItem {
  transactionIndex: number;
  proposalStatus: string;
}

/**
 * Batch approve multiple proposals in a single transaction.
 * Each proposal gets proposalCreate (if needed) + proposalApprove instructions.
 */
export async function submitBatchApprovals(
  items: ApprovalItem[],
  connection: Connection,
  multisigPda: string,
  programId: PublicKey,
  wallet: WalletContextState
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet must be connected');
  }

  const transaction = new Transaction();
  transaction.feePayer = wallet.publicKey;

  for (const item of items) {
    const transactionIndexBN = BigInt(item.transactionIndex);
    const actualProgramId = programId;

    if (item.proposalStatus === 'None') {
      transaction.add(
        multisig.instructions.proposalCreate({
          multisigPda: new PublicKey(multisigPda),
          creator: wallet.publicKey,
          isDraft: false,
          transactionIndex: transactionIndexBN,
          rentPayer: wallet.publicKey,
          programId: actualProgramId,
        })
      );
    }

    if (item.proposalStatus === 'Draft') {
      transaction.add(
        multisig.instructions.proposalActivate({
          multisigPda: new PublicKey(multisigPda),
          member: wallet.publicKey,
          transactionIndex: transactionIndexBN,
          programId: actualProgramId,
        })
      );
    }

    transaction.add(
      multisig.instructions.proposalApprove({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        transactionIndex: transactionIndexBN,
        programId: actualProgramId,
      })
    );
  }

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;

  // Check size before signing
  try {
    const serialized = transaction.serialize({ verifySignatures: false });
    console.log('[BatchApproval] Transaction size:', serialized.length, 'bytes');
    if (serialized.length > 1232) {
      throw new Error(
        `Transaction too large (${serialized.length} bytes). Select fewer proposals.`
      );
    }
  } catch (e: any) {
    if (e.message?.includes('too large')) throw e;
    console.error('[BatchApproval] Serialization check failed:', e);
    throw new Error('Transaction too large. Select fewer proposals.');
  }

  const signedTransaction = await wallet.signTransaction(transaction);

  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  const results = await waitForConfirmation(connection, [signature], 30000);
  if (!results[0] || results[0].err) {
    throw new Error(`Transaction failed or unable to confirm. Signature: ${signature}`);
  }

  return signature;
}
