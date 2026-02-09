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

  // Combine all instructions from all batch items into one list
  const allInstructions: TransactionInstruction[] = [];
  for (const item of items) {
    allInstructions.push(...item.instructions);
  }

  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  const innerMessage = new TransactionMessage({
    instructions: allInstructions,
    payerKey: vaultAddress,
    recentBlockhash: blockhash,
  });

  const transactionIndex = BigInt(Number(multisigInfo.transactionIndex) + 1);

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

  const message = new TransactionMessage({
    instructions: [vaultTransactionIx, proposalIx, approveIx],
    payerKey: wallet.publicKey,
    recentBlockhash: freshBlockhash,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);

  // Sign
  onProgress({ currentStep: 'signing' });
  const signedTransaction = await wallet.signTransaction(transaction);

  // Send
  onProgress({ currentStep: 'sending' });
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  // Confirm
  onProgress({ currentStep: 'confirming' });
  const results = await waitForConfirmation(connection, [signature], 30000);
  if (!results[0] || results[0].err) {
    throw new Error(`Transaction failed or unable to confirm. Signature: ${signature}`);
  }

  onProgress({ currentStep: 'done' });
}
