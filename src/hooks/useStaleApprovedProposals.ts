import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { useMultisigData } from './useMultisigData';
import { useMultisig } from './useServices';

export interface StaleApprovedProposal {
  transactionIndex: number;
  /** Members who have already voted to cancel. */
  cancelled: PublicKey[];
}

/** getMultipleAccountsInfo accepts at most 100 addresses per call. */
const CHUNK = 100;

/**
 * Proposals that are stale but still Approved. The program executes a stale
 * vault transaction if it was approved before it went stale, so these stay live
 * until cancelled, while the list shows them as plain "Stale". Reads every
 * proposal up to the multisig's stale index, so it finds them on any page.
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
      const indexes = Array.from({ length: staleIndex }, (_, i) => i + 1);
      const found: StaleApprovedProposal[] = [];

      for (let start = 0; start < indexes.length; start += CHUNK) {
        const chunk = indexes.slice(start, start + CHUNK);
        const pdas = chunk.map(
          (i) =>
            multisig.getProposalPda({ multisigPda, transactionIndex: BigInt(i), programId: programId! })[0]
        );
        const infos = await connection.getMultipleAccountsInfo(pdas);
        infos.forEach((info, k) => {
          if (!info) return;
          try {
            const [proposal] = multisig.accounts.Proposal.fromAccountInfo(info);
            if (proposal.status.__kind === 'Approved') {
              found.push({ transactionIndex: chunk[k], cancelled: proposal.cancelled });
            }
          } catch {
            // Closed or not a proposal account; nothing to cancel.
          }
        });
      }

      return found;
    },
  });
}
