import * as multisig from '@sqds/multisig';
import { PublicKey } from '@solana/web3.js';
import type { Connection, TransactionInstruction } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { signSendAndConfirm } from '~/lib/transaction/signSendAndConfirm';
import type { SendStep } from '~/lib/transaction/signSendAndConfirm';

/**
 * Batch cancel multiple Approved proposals in a single transaction, one
 * proposalCancel per proposal.
 *
 * The program allows cancel on a stale proposal, which is the main use: a stale
 * Approved vault transaction can still be executed until it is cancelled.
 * Callers must drop proposals the member already voted to cancel, or that are
 * no longer Approved; either makes the whole transaction fail.
 */
export async function submitBatchCancels(
  transactionIndexes: number[],
  connection: Connection,
  multisigPda: string,
  programId: PublicKey,
  wallet: WalletContextState,
  onStep?: (step: SendStep) => void
): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet must be connected');
  }

  const multisigPubkey = new PublicKey(multisigPda);
  const instructions: TransactionInstruction[] = [];
  const proposalPdas: PublicKey[] = [];

  for (const index of transactionIndexes) {
    const transactionIndex = BigInt(index);

    instructions.push(
      multisig.instructions.proposalCancel({
        multisigPda: multisigPubkey,
        member: wallet.publicKey,
        transactionIndex,
        programId,
      })
    );

    proposalPdas.push(
      multisig.getProposalPda({ multisigPda: multisigPubkey, transactionIndex, programId })[0]
    );
  }

  return signSendAndConfirm(connection, wallet, instructions, {
    writableAccounts: [multisigPubkey, ...proposalPdas],
    label: `BatchCancels(${transactionIndexes.length})`,
    tooLargeHint: 'Select fewer proposals.',
    onStep,
  });
}
