import * as multisig from '@sqds/multisig';
import { PublicKey } from '@solana/web3.js';
import type { Connection, TransactionInstruction } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { signSendAndConfirm } from '~/lib/transaction/signSendAndConfirm';
import type { SendStep } from '~/lib/transaction/signSendAndConfirm';

export interface ApprovalItem {
  transactionIndex: number;
  proposalStatus: string;
}

/**
 * Batch approve multiple proposals in a single transaction.
 * Each proposal gets proposalCreate (if needed) + proposalApprove instructions.
 *
 * Sends through the shared pipeline, so it gets the same priority fee, sized
 * compute budget, fresh blockhash and rebroadcast-until-expiry as a single
 * approval. Throws `TransactionFailedError` / `TransactionExpiredError` with a
 * message that says whether anything landed.
 */
export async function submitBatchApprovals(
  items: ApprovalItem[],
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

  for (const item of items) {
    const transactionIndexBN = BigInt(item.transactionIndex);

    if (item.proposalStatus === 'None') {
      instructions.push(
        multisig.instructions.proposalCreate({
          multisigPda: multisigPubkey,
          creator: wallet.publicKey,
          isDraft: false,
          transactionIndex: transactionIndexBN,
          rentPayer: wallet.publicKey,
          programId,
        })
      );
    }

    if (item.proposalStatus === 'Draft') {
      instructions.push(
        multisig.instructions.proposalActivate({
          multisigPda: multisigPubkey,
          member: wallet.publicKey,
          transactionIndex: transactionIndexBN,
          programId,
        })
      );
    }

    instructions.push(
      multisig.instructions.proposalApprove({
        multisigPda: multisigPubkey,
        member: wallet.publicKey,
        transactionIndex: transactionIndexBN,
        programId,
      })
    );

    proposalPdas.push(
      multisig.getProposalPda({
        multisigPda: multisigPubkey,
        transactionIndex: transactionIndexBN,
        programId,
      })[0]
    );
  }

  return signSendAndConfirm(connection, wallet, instructions, {
    writableAccounts: [multisigPubkey, ...proposalPdas],
    label: `BatchApprovals(${items.length})`,
    tooLargeHint: 'Select fewer proposals.',
    onStep,
  });
}
