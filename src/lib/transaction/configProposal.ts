import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

/**
 * Instructions that create a config transaction, its proposal and the
 * creator's approval, for one send.
 */
export function configProposalInstructions({
  multisigPda,
  actions,
  creator,
  transactionIndex,
  programId,
}: {
  multisigPda: PublicKey;
  actions: multisig.types.ConfigAction[];
  creator: PublicKey;
  transactionIndex: bigint;
  programId: PublicKey;
}): TransactionInstruction[] {
  return [
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
    multisig.instructions.proposalApprove({
      multisigPda,
      member: creator,
      transactionIndex,
      programId,
    }),
  ];
}
