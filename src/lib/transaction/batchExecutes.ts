import * as multisig from '@sqds/multisig';
import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { waitForConfirmation } from '~/lib/transactionConfirmation';

export interface ExecuteItem {
  transactionIndex: number;
}

/**
 * Batch execute multiple approved proposals in a single transaction.
 */
export async function submitBatchExecutes(
  items: ExecuteItem[],
  connection: Connection,
  multisigPda: string,
  programId: PublicKey,
  wallet: WalletContextState,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet must be connected');
  }

  const member = wallet.publicKey;
  const multisigPubkey = new PublicKey(multisigPda);

  onProgress?.('Building execute transaction...');

  const instructions: TransactionInstruction[] = [];
  const allLookupTables: AddressLookupTableAccount[] = [];

  for (const item of items) {
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
      instructions.push(resp.instruction);
      if (resp.lookupTableAccounts) {
        allLookupTables.push(...resp.lookupTableAccounts);
      }
    } else if (txType === 'config') {
      const executeIx = multisig.instructions.configTransactionExecute({
        multisigPda: multisigPubkey,
        member,
        rentPayer: member,
        transactionIndex: transactionIndexBN,
        programId,
      });
      instructions.push(executeIx);
    }
  }

  if (instructions.length === 0) {
    throw new Error('No executable transactions found');
  }

  // Deduplicate lookup tables by address
  const uniqueLookupTables = Array.from(
    new Map(allLookupTables.map((t) => [t.key.toBase58(), t])).values()
  );

  const { blockhash } = await connection.getLatestBlockhash();

  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions,
      payerKey: member,
      recentBlockhash: blockhash,
    }).compileToV0Message(uniqueLookupTables)
  );

  // Check size before signing
  const serialized = transaction.serialize();
  if (serialized.length > 1232) {
    throw new Error(
      `Transaction too large (${serialized.length} bytes). Select fewer transactions.`
    );
  }

  onProgress?.('Requesting wallet signature...');

  const signedTransaction = await wallet.signTransaction(transaction);

  onProgress?.('Sending transaction...');

  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  onProgress?.('Confirming...');

  const results = await waitForConfirmation(connection, [signature], 30000);
  if (!results[0] || results[0].err) {
    throw new Error(`Transaction failed or unable to confirm. Signature: ${signature}`);
  }

  return signature;
}
