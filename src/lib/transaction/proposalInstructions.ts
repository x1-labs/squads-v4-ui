import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

/** Disabled reason for create buttons. Create needs the Initiate permission. */
export const NEEDS_INITIATE = 'Your wallet needs the Initiate permission to propose.';

/** Disabled reason for approve buttons. Approve needs the Vote permission. */
export const NEEDS_VOTE = 'Your wallet needs the Vote permission to approve.';

/**
 * Instructions for one send that creates a transaction and its proposal.
 * `createIx` is the config or vault transaction create instruction. With
 * `approve`, the creator also approves the proposal. Approve needs the Vote
 * permission, so set `approve` only when the creator has it.
 */
export function withProposal(
  createIx: TransactionInstruction,
  {
    multisigPda,
    creator,
    transactionIndex,
    programId,
    approve,
  }: {
    multisigPda: PublicKey;
    creator: PublicKey;
    transactionIndex: bigint;
    programId: PublicKey;
    approve: boolean;
  }
): TransactionInstruction[] {
  const instructions = [
    createIx,
    multisig.instructions.proposalCreate({
      multisigPda,
      creator,
      isDraft: false,
      transactionIndex,
      rentPayer: creator,
      programId,
    }),
  ];
  if (approve) {
    instructions.push(
      multisig.instructions.proposalApprove({
        multisigPda,
        member: creator,
        transactionIndex,
        programId,
      })
    );
  }
  return instructions;
}

/** Success text for a new proposal. Without the creator's approval, it says so. */
export function proposedMessage(message: string, approved: boolean): string {
  return approved ? message : `${message} It still needs approvals.`;
}
