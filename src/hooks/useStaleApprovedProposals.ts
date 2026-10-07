import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { useMultisigData } from './useMultisigData';
import { useMultisig } from './useServices';
import { getMultipleAccountsInfoChunked } from '@/lib/proposals';

export interface StaleApprovedProposal {
  transactionIndex: number;
  /** Members who have already voted to cancel. */
  canceledBy: PublicKey[];
}

/**
 * Transaction kinds the program will still execute when stale. A stale config
 * transaction is refused (config_transaction_execute.rs), so it is harmless.
 */
const STILL_EXECUTABLE = [
  multisig.generated.vaultTransactionDiscriminator,
  multisig.generated.batchDiscriminator,
];

function isStillExecutable(data: Buffer): boolean {
  return STILL_EXECUTABLE.some((d) => d.every((byte, i) => data[i] === byte));
}

/**
 * Stale proposals that are still Approved and still executable. The program
 * executes a stale vault or batch transaction if it was approved before it went
 * stale, so these stay live until canceled, while the list shows them as plain
 * "Stale". Reads every proposal up to the multisig's stale index, so it finds
 * them on any page.
 *
 * Keyed under 'proposal' so the cancel flows' invalidation refreshes it.
 */
export function useStaleApprovedProposals() {
  const { connection, programId, multisigAddress } = useMultisigData();
  const { data: multisigAccount } = useMultisig();
  const staleIndex = multisigAccount ? Number(multisigAccount.staleTransactionIndex) : 0;

  return useQuery({
    queryKey: ['proposal', 'stale-approved', multisigAddress, programId?.toBase58(), staleIndex],
    enabled: !!multisigAddress && !!programId && staleIndex > 0,
    queryFn: async (): Promise<StaleApprovedProposal[]> => {
      const multisigPda = new PublicKey(multisigAddress!);
      // Every index up to staleTransactionIndex is stale (see isTransactionStale).
      const indexes = Array.from({ length: staleIndex }, (_, i) => i + 1);

      const proposalInfos = await getMultipleAccountsInfoChunked(
        connection,
        indexes.map(
          (i) =>
            multisig.getProposalPda({ multisigPda, transactionIndex: BigInt(i), programId: programId! })[0]
        )
      );
      const approved: StaleApprovedProposal[] = [];
      proposalInfos.forEach((info, k) => {
        if (!info) return;
        try {
          const [proposal] = multisig.accounts.Proposal.fromAccountInfo(info);
          if (proposal.status.__kind === 'Approved') {
            approved.push({ transactionIndex: indexes[k], canceledBy: proposal.cancelled });
          }
        } catch {
          // Closed or not a proposal account; nothing to cancel.
        }
      });

      const transactionInfos = await getMultipleAccountsInfoChunked(
        connection,
        approved.map(
          (p) =>
            multisig.getTransactionPda({
              multisigPda,
              index: BigInt(p.transactionIndex),
              programId: programId!,
            })[0]
        )
      );
      return approved.filter((_, k) => {
        const info = transactionInfos[k];
        return info ? isStillExecutable(info.data) : false;
      });
    },
  });
}
