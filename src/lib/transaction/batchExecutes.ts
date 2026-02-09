import * as multisig from '@sqds/multisig';
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { waitForConfirmation } from '~/lib/transactionConfirmation';

export interface ExecuteItem {
  transactionIndex: number;
}

/**
 * Batch execute multiple approved proposals.
 * Each execution is a separate transaction (they're too large to combine).
 * All transactions are signed at once with signAllTransactions, then sent sequentially.
 */
export async function submitBatchExecutes(
  items: ExecuteItem[],
  connection: Connection,
  multisigPda: string,
  programId: PublicKey,
  wallet: WalletContextState,
  onProgress?: (msg: string) => void
): Promise<string[]> {
  if (!wallet.publicKey || !wallet.signAllTransactions) {
    throw new Error('Wallet must be connected and support signing multiple transactions');
  }

  const member = wallet.publicKey;
  const multisigPubkey = new PublicKey(multisigPda);

  onProgress?.(`Building ${items.length} execute transactions...`);

  // Build execute instructions for each item
  type TxBuildData = {
    instructions: any[];
    lookupTableAccounts?: any[];
  };

  const buildPromises = items.map(async (item) => {
    const transactionIndexBN = BigInt(item.transactionIndex);
    const [transactionPda] = multisig.getTransactionPda({
      multisigPda: multisigPubkey,
      index: transactionIndexBN,
      programId,
    });

    // Determine transaction type
    let txType: 'vault' | 'config' | 'unknown' = 'unknown';
    try {
      await multisig.accounts.VaultTransaction.fromAccountAddress(
        connection as any,
        transactionPda
      );
      txType = 'vault';
    } catch {
      try {
        await multisig.accounts.ConfigTransaction.fromAccountAddress(
          connection as any,
          transactionPda
        );
        txType = 'config';
      } catch {
        // Skip unknown types
      }
    }

    if (txType === 'vault') {
      const resp = await multisig.instructions.vaultTransactionExecute({
        multisigPda: multisigPubkey,
        connection: connection as any,
        member,
        transactionIndex: transactionIndexBN,
        programId,
      });
      return {
        instructions: [resp.instruction],
        lookupTableAccounts: resp.lookupTableAccounts,
      } as TxBuildData;
    } else if (txType === 'config') {
      const executeIx = multisig.instructions.configTransactionExecute({
        multisigPda: multisigPubkey,
        member,
        rentPayer: member,
        transactionIndex: transactionIndexBN,
        programId,
      });
      return {
        instructions: [executeIx],
        lookupTableAccounts: undefined,
      } as TxBuildData;
    }

    return null;
  });

  const buildResults = await Promise.all(buildPromises);
  const validBuilds = buildResults.filter((b): b is TxBuildData => b !== null);

  if (validBuilds.length === 0) {
    throw new Error('No executable transactions found');
  }

  onProgress?.('Requesting wallet signatures...');

  // Get fresh blockhash
  const { blockhash } = await connection.getLatestBlockhash();

  // Build versioned transactions
  const transactions = validBuilds.map((buildData) => {
    return new VersionedTransaction(
      new TransactionMessage({
        instructions: buildData.instructions,
        payerKey: member,
        recentBlockhash: blockhash,
      }).compileToV0Message(buildData.lookupTableAccounts)
    );
  });

  // Sign all at once
  const signedTransactions = await wallet.signAllTransactions(transactions);

  // Send sequentially
  const signatures: string[] = [];
  for (let i = 0; i < signedTransactions.length; i++) {
    onProgress?.(`Sending transaction ${i + 1} of ${signedTransactions.length}...`);

    const signature = await connection.sendRawTransaction(signedTransactions[i].serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    signatures.push(signature);
  }

  onProgress?.('Confirming transactions...');
  const results = await waitForConfirmation(connection, signatures, 30000);

  const failed = results.filter((r) => !r || r.err);
  if (failed.length > 0) {
    const successCount = results.length - failed.length;
    if (successCount > 0) {
      throw new Error(
        `${successCount} of ${results.length} transactions executed. ${failed.length} failed.`
      );
    }
    throw new Error('Transaction execution failed');
  }

  return signatures;
}
