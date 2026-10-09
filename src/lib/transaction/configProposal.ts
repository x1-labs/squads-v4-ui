import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

/**
 * Instructions that create a config transaction and its proposal, for one
 * send. With `approve`, the creator also approves it. Approve needs the Vote
 * permission, so set `approve` only when the creator has it.
 */
export function configProposalInstructions({
  multisigPda,
  actions,
  creator,
  transactionIndex,
  programId,
  approve,
}: {
  multisigPda: PublicKey;
  actions: multisig.types.ConfigAction[];
  creator: PublicKey;
  transactionIndex: bigint;
  programId: PublicKey;
  approve: boolean;
}): TransactionInstruction[] {
  const instructions = [
    multisig.instructions.configTransactionCreate({
      multisigPda,
      actions,
      creator,
      transactionIndex,
      rentPayer: creator,
      programId,
    }),
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
