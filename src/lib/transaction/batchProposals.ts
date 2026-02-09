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
  currentStep: 'preparing' | 'signing' | 'sending' | 'confirming' | 'done' | 'error';
  error?: string;
}

/**
 * Combines all batch items into a single vault transaction / proposal.
 * All instructions are merged into one TransactionMessage executed by the vault.
 */
export async function submitBatchProposal(
  items: BatchProposalItem[],
  connection: Connection,
  multisigPda: string,
  programId: PublicKey,
  wallet: WalletContextState,
  onProgress: (progress: BatchProgress) => void
): Promise<void> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet must be connected');
  }

  onProgress({ currentStep: 'preparing' });

  console.log('[BatchProposal] Starting batch submission with', items.length, 'items');
  for (let i = 0; i < items.length; i++) {
    console.log(`[BatchProposal] Item ${i}: "${items[i].label}" - ${items[i].instructions.length} instructions`);
    for (let j = 0; j < items[i].instructions.length; j++) {
      const ix = items[i].instructions[j];
      console.log(`[BatchProposal]   ix[${j}]: programId=${ix.programId.toBase58()}, keys=${ix.keys.length}, data=${ix.data.length} bytes`);
    }
  }

  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    // @ts-ignore
    connection,
    new PublicKey(multisigPda)
  );

  // All items must use the same vault index
  const vaultIndex = items[0].vaultIndex;

  const vaultAddress = multisig.getVaultPda({
    index: vaultIndex,
    multisigPda: new PublicKey(multisigPda),
    programId,
  })[0];

  console.log('[BatchProposal] vaultAddress:', vaultAddress.toBase58());
  console.log('[BatchProposal] vaultIndex:', vaultIndex);

  // Combine all instructions from all batch items into one list
  const allInstructions: TransactionInstruction[] = [];
  for (const item of items) {
    allInstructions.push(...item.instructions);
  }

  console.log('[BatchProposal] Total inner instructions:', allInstructions.length);

  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  const innerMessage = new TransactionMessage({
    instructions: allInstructions,
    payerKey: vaultAddress,
    recentBlockhash: blockhash,
  });

  console.log('[BatchProposal] Inner message created');

  const transactionIndex = BigInt(Number(multisigInfo.transactionIndex) + 1);
  console.log('[BatchProposal] transactionIndex:', transactionIndex.toString());

  const vaultTransactionIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: new PublicKey(multisigPda),
    creator: wallet.publicKey,
    ephemeralSigners: 0,
    // @ts-ignore
    transactionMessage: innerMessage,
    transactionIndex,
    addressLookupTableAccounts: [],
    rentPayer: wallet.publicKey,
    vaultIndex,
    programId,
  });

  console.log('[BatchProposal] vaultTransactionCreate ix: keys=', vaultTransactionIx.keys.length, 'data=', vaultTransactionIx.data.length, 'bytes');

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: new PublicKey(multisigPda),
    creator: wallet.publicKey,
    isDraft: false,
    transactionIndex,
    rentPayer: wallet.publicKey,
    programId,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: new PublicKey(multisigPda),
    member: wallet.publicKey,
    transactionIndex,
    programId,
  });

  const freshBlockhash = (await connection.getLatestBlockhash()).blockhash;

  console.log('[BatchProposal] Building outer transaction...');

  const message = new TransactionMessage({
    instructions: [vaultTransactionIx, proposalIx, approveIx],
    payerKey: wallet.publicKey,
    recentBlockhash: freshBlockhash,
  }).compileToV0Message();

  console.log('[BatchProposal] V0 message compiled');

  const transaction = new VersionedTransaction(message);

  let serialized: Uint8Array;
  try {
    serialized = transaction.serialize();
  } catch (e) {
    console.error('[BatchProposal] Serialization failed:', e);
    throw new Error('Transaction too large. Remove some operations and try again.');
  }
  console.log('[BatchProposal] Serialized transaction size:', serialized.length, 'bytes (limit: 1232)');

  if (serialized.length > 1232) {
    throw new Error(
      `Transaction too large (${serialized.length} bytes, limit 1232). Remove some operations and try again.`
    );
  }

  // Sign
  onProgress({ currentStep: 'signing' });
  console.log('[BatchProposal] Requesting wallet signature...');
  const signedTransaction = await wallet.signTransaction(transaction);
  console.log('[BatchProposal] Transaction signed');

  // Send
  onProgress({ currentStep: 'sending' });
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  console.log('[BatchProposal] Transaction sent, signature:', signature);

  // Confirm
  onProgress({ currentStep: 'confirming' });
  const results = await waitForConfirmation(connection, [signature], 30000);
  if (!results[0] || results[0].err) {
    throw new Error(`Transaction failed or unable to confirm. Signature: ${signature}`);
  }

  onProgress({ currentStep: 'done' });
}
