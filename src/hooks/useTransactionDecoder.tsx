import { useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { getDecoderInstance } from '@/lib/transaction/decoderInstance';
import { DecodedTransaction } from '@/lib/transaction/simpleDecoder';
import * as multisig from '@sqds/multisig';

export interface UseTransactionDecoderOptions {
  connection: Connection;
  multisigPda: PublicKey | string;
  transactionIndex: bigint | number;
  programId?: PublicKey | string;
  enabled?: boolean;
}

export interface UseTransactionDecoderResult {
  decodedTransaction: DecodedTransaction | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export const useTransactionDecoder = ({
  connection,
  multisigPda,
  transactionIndex,
  programId = multisig.PROGRAM_ID,
  enabled = true,
}: UseTransactionDecoderOptions): UseTransactionDecoderResult => {
  const [decodedTransaction, setDecodedTransaction] = useState<DecodedTransaction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const decodeTransaction = async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const decoder = getDecoderInstance(connection);

      const multisigPubkey =
        typeof multisigPda === 'string' ? new PublicKey(multisigPda) : multisigPda;

      const programPubkey = typeof programId === 'string' ? new PublicKey(programId) : programId;

      const txIndex =
        typeof transactionIndex === 'number' ? BigInt(transactionIndex) : transactionIndex;

      const decoded = await decoder.decodeVaultTransaction(multisigPubkey, txIndex, programPubkey);

      if (decoded.error) {
        throw new Error(decoded.error);
      }

      setDecodedTransaction(decoded);
    } catch (err) {
      console.error('Failed to decode transaction:', err);
      setError(err instanceof Error ? err : new Error('Failed to decode transaction'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    decodeTransaction();
  }, [connection, multisigPda, transactionIndex, programId, enabled]);

  return {
    decodedTransaction,
    isLoading,
    error,
    refetch: decodeTransaction,
  };
};
