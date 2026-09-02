import * as multisig from '@sqds/multisig';
import { PublicKey, TransactionMessage } from '@solana/web3.js';
import type { Connection, TransactionInstruction } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { signSendAndConfirmV0 } from '~/lib/transaction/signSendAndConfirm';
import { addMemoToInstructions } from '~/lib/utils/memoInstruction';
import {
  simulateVaultInstructions,
  describeVaultSimulationError,
} from '~/lib/transaction/simulateVaultInstructions';

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
  onProgress: (progress: BatchProgress) => void,
  memo?: string
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

  if (memo) {
    addMemoToInstructions(allInstructions, memo, vaultAddress);
  }

  // Simulate the vault's instructions against live chain state BEFORE anyone signs.
  // A VaultTransaction executes atomically, so a single failing instruction (e.g. a
  // stake that isn't fully cooled down, or a full-balance close whose amount drifted)
  // would revert the whole proposal — after the multisig members already spent their
  // signatures approving it. A genuine revert here means nothing is submitted and no
  // signatures are wasted. If the simulation itself can't run (RPC hiccup), warn and
  // proceed rather than hard-block a proposal that would otherwise succeed.
  const simulation = await simulateVaultInstructions(
    connection,
    wallet.publicKey,
    allInstructions
  );
  if (!simulation.ok) {
    if (simulation.simulated) {
      throw new Error(describeVaultSimulationError(simulation));
    }
    console.warn('Pre-proposal simulation could not run; proceeding without it:', simulation.error);
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

  const [transactionPda] = multisig.getTransactionPda({
    multisigPda: new PublicKey(multisigPda),
    index: transactionIndex,
    programId,
  });
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: new PublicKey(multisigPda),
    transactionIndex,
    programId,
  });

  // Priority fee, compute budget, fresh blockhash, sign, rebroadcast until it
  // confirms or the blockhash expires. Sizes the packet after the budget
  // instructions are in, so its "too large" is the real number.
  await signSendAndConfirmV0(connection, wallet, [vaultTransactionIx, proposalIx, approveIx], {
    writableAccounts: [new PublicKey(multisigPda), transactionPda, proposalPda],
    label: `BatchProposal(${allInstructions.length} ops)`,
    tooLargeHint: 'Remove some operations and try again.',
    onStep: (step) => onProgress({ currentStep: step }),
  });

  onProgress({ currentStep: 'done' });
}
