import * as multisig from '@sqds/multisig';
import { PublicKey } from '@solana/web3.js';
import type {
  AddressLookupTableAccount,
  Connection,
  TransactionInstruction,
} from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { signSendAndConfirmV0 } from '~/lib/transaction/signSendAndConfirm';

export interface ExecuteItem {
  transactionIndex: number;
}

/**
 * Batch execute multiple approved proposals in a single transaction.
 *
 * Sends through the shared pipeline: priority fee, compute budget sized by
 * simulation (a vault execute CPIs into arbitrary programs, so the runtime
 * default is a poor guess either way), fresh blockhash, rebroadcast until expiry.
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
  const writableAccounts: PublicKey[] = [multisigPubkey];

  for (const item of items) {
    const transactionIndexBN = BigInt(item.transactionIndex);
    const [transactionPda] = multisig.getTransactionPda({
      multisigPda: multisigPubkey,
      index: transactionIndexBN,
      programId,
    });
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: multisigPubkey,
      transactionIndex: transactionIndexBN,
      programId,
    });
    writableAccounts.push(transactionPda, proposalPda);

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

  const progressText = {
    preparing: 'Simulating and pricing transaction...',
    signing: 'Requesting wallet signature...',
    confirming: 'Confirming...',
  };

  return signSendAndConfirmV0(connection, wallet, instructions, {
    lookupTables: uniqueLookupTables,
    writableAccounts,
    label: `BatchExecutes(${instructions.length})`,
    tooLargeHint: 'Select fewer transactions.',
    onStep: (step) => onProgress?.(progressText[step]),
  });
}
