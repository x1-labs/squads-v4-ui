import * as multisig from '@sqds/multisig';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { useMultisigData } from './useMultisigData';
import { useMultisigAddress } from './useMultisigAddress';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SimpleDecoder } from '@/lib/transaction/simpleDecoder';
import { extractTransactionTags } from '@/lib/instructions/extractor';
import { TransactionTag } from '@/lib/instructions/types';

// load multisig
export const useMultisig = () => {
  const { connection } = useMultisigData();
  const { multisigAddress } = useMultisigAddress();

  return useSuspenseQuery({
    queryKey: ['multisig', multisigAddress],
    queryFn: async () => {
      if (!multisigAddress) return null;
      try {
        const multisigPubkey = new PublicKey(multisigAddress);
        // First check if the account exists
        const accountInfo = await connection.getAccountInfo(multisigPubkey);
        if (!accountInfo) {
          console.log('No account found at address:', multisigAddress);
          return null;
        }
        // @ts-ignore
        return multisig.accounts.Multisig.fromAccountAddress(connection, multisigPubkey);
      } catch (error) {
        console.error('Error fetching multisig:', error);
        return null;
      }
    },
  });
};

export const useBalance = () => {
  const { connection, multisigVault } = useMultisigData();

  return useSuspenseQuery({
    queryKey: ['balance', multisigVault?.toBase58()],
    queryFn: async () => {
      if (!multisigVault) return null;
      try {
        return connection.getBalance(multisigVault);
      } catch (error) {
        console.error(error);
        return null;
      }
    },
  });
};

export const useGetTokens = () => {
  const { connection, multisigVault } = useMultisigData();

  return useSuspenseQuery({
    queryKey: ['tokenBalances', multisigVault?.toBase58()],
    queryFn: async () => {
      if (!multisigVault) return null;
      try {
        const classicTokens = await connection.getParsedTokenAccountsByOwner(multisigVault, {
          programId: TOKEN_PROGRAM_ID,
        });
        const t22Tokens = await connection.getParsedTokenAccountsByOwner(multisigVault, {
          programId: TOKEN_2022_PROGRAM_ID,
        });
        return classicTokens.value.concat(t22Tokens.value);
      } catch (error) {
        console.error(error);
        return null;
      }
    },
  });
};

// Transactions
async function fetchTransactionData(
  connection: Connection,
  multisigPda: PublicKey,
  index: bigint,
  programId: PublicKey
) {
  const transactionPda = multisig.getTransactionPda({
    multisigPda,
    index,
    programId,
  });
  const proposalPda = multisig.getProposalPda({
    multisigPda,
    transactionIndex: index,
    programId,
  });

  let proposal;
  try {
    // @ts-ignore
    proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda[0]);
  } catch (error) {
    proposal = null;
  }

  // Detect transaction type
  let transactionType: 'vault' | 'config' | 'unknown' = 'unknown';
  try {
    // Try to fetch as VaultTransaction first
    await multisig.accounts.VaultTransaction.fromAccountAddress(
      connection as any,
      transactionPda[0]
    );
    transactionType = 'vault';
  } catch {
    // Try as ConfigTransaction
    try {
      await multisig.accounts.ConfigTransaction.fromAccountAddress(
        connection as any,
        transactionPda[0]
      );
      transactionType = 'config';
    } catch {
      // Leave as unknown
    }
  }

  // Extract tags by decoding the transaction
  let tags: TransactionTag[] = [];
  try {
    const decoder = new SimpleDecoder(connection);
    const decoded = await decoder.decodeVaultTransaction(multisigPda, index, programId);

    if (!decoded.error && decoded.instructions.length > 0) {
      const extractedTags = extractTransactionTags(decoded);
      tags = extractedTags.tags;
    }
  } catch (error) {
    console.debug('Failed to extract tags for transaction', index, error);
  }

  return { transactionPda, proposal, index, transactionType, tags };
}

export const useTransactions = (startIndex: number, endIndex: number) => {
  const { connection, programId, multisigAddress } = useMultisigData();

  return useSuspenseQuery({
    queryKey: [
      'transactions',
      { startIndex, endIndex, multisigAddress, programId: programId.toBase58() },
    ],
    queryFn: async () => {
      if (!multisigAddress) return null;
      try {
        const multisigPda = new PublicKey(multisigAddress);
        const results: any[] = [];

        for (let i = 0; i <= startIndex - endIndex; i++) {
          const index = BigInt(startIndex - i);
          const transaction = await fetchTransactionData(connection, multisigPda, index, programId);
          results.push(transaction);
        }

        return results;
      } catch (error) {
        return null;
      }
    },
  });
};
