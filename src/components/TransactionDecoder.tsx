import React, { useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  SimpleDecoder,
  DecodedTransaction,
  DecodedInstruction,
} from '../lib/transaction/simpleDecoder';
import * as multisig from '@sqds/multisig';
import { formatXNT, formatTokenAmount, shortenAddress } from '../lib/utils/formatters';
import { InstructionType } from '../lib/transaction/instructionTypes';

interface TransactionDecoderProps {
  connection: Connection;
  multisigPda: PublicKey;
  transactionIndex: bigint;
  programId?: PublicKey;
}

export const TransactionDecoder: React.FC<TransactionDecoderProps> = ({
  connection,
  multisigPda,
  transactionIndex,
  programId = multisig.PROGRAM_ID,
}) => {
  const [decodedTx, setDecodedTx] = useState<DecodedTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedInstructions, setExpandedInstructions] = useState<Set<number>>(new Set());

  useEffect(() => {
    const decodeTransaction = async () => {
      setLoading(true);
      setError(null);

      try {
        const decoder = new SimpleDecoder(connection);
        const decoded = await decoder.decodeVaultTransaction(
          multisigPda,
          transactionIndex,
          programId
        );

        if (decoded.error) {
          setError(decoded.error);
        } else {
          setDecodedTx(decoded);
          // Auto-expand if there's only one instruction
          if (decoded.instructions.length === 1) {
            setExpandedInstructions(new Set([0]));
          }
        }
      } catch (err) {
        console.error('Failed to decode transaction:', err);
        setError(err instanceof Error ? err.message : 'Failed to decode transaction');
      } finally {
        setLoading(false);
      }
    };

    decodeTransaction();
  }, [connection, multisigPda, transactionIndex, programId]);

  const toggleInstruction = (index: number) => {
    const newExpanded = new Set(expandedInstructions);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedInstructions(newExpanded);
  };

  const formatValue = (value: any, key?: string): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        // Special handling for actions array in config transactions
        if (key === 'actions') {
          return JSON.stringify(value, null, 2);
        }
        // For other arrays, show a summary if small, otherwise just count
        if (value.length <= 3) {
          return JSON.stringify(value, null, 2);
        }
        return `[${value.length} items]\n${JSON.stringify(value, null, 2)}`;
      }
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const getTransferSummary = (instruction: DecodedInstruction): string | null => {
    // XNT Transfer - check both instructionType and System Program Transfer
    if (
      instruction.instructionType === InstructionType.XNT_TRANSFER ||
      (instruction.programId === '11111111111111111111111111111111' &&
        instruction.instructionName === 'Transfer')
    ) {
      // Try to get data from instruction.data first
      if (instruction.data) {
        const data = instruction.data as any;
        if (data.amount && data.from && data.to) {
          const amount = formatXNT(data.amount);
          const from = shortenAddress(data.from);
          const to = shortenAddress(data.to);
          return `Transfer ${amount} from ${from} to ${to}`;
        }
      }

      // Fallback to args if data is not complete
      if (instruction.args?.lamports !== undefined) {
        const amount = formatXNT(instruction.args.lamports);
        const from = instruction.accounts?.[0]?.pubkey
          ? shortenAddress(instruction.accounts[0].pubkey)
          : 'Unknown';
        const to = instruction.accounts?.[1]?.pubkey
          ? shortenAddress(instruction.accounts[1].pubkey)
          : 'Unknown';
        return `Transfer ${amount} from ${from} to ${to}`;
      }
    }

    // SPL Token Transfer
    if (
      instruction.instructionType === InstructionType.SPL_TRANSFER ||
      instruction.instructionType === InstructionType.SPL_TRANSFER_CHECKED
    ) {
      const data = instruction.data as any;
      if (!data.amount || !data.fromTokenAccount || !data.toTokenAccount) return null;
      const amount = formatTokenAmount(data.amount, data.decimals || 0);
      const from = shortenAddress(data.fromTokenAccount);
      const to = shortenAddress(data.toTokenAccount);
      return `Transfer ${amount} tokens from ${from} to ${to}`;
    }

    return null;
  };

  const renderInstruction = (instruction: DecodedInstruction, index: number) => {
    const isExpanded = expandedInstructions.has(index);
    const transferSummary = getTransferSummary(instruction);

    return (
      <div key={index} className="mb-4 rounded-lg border border-border bg-muted/50 p-4">
        <div
          className="flex cursor-pointer items-start justify-between"
          onClick={() => toggleInstruction(index)}
        >
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">
                Instruction #{index + 1}
              </span>
              <span className="rounded bg-primary/10 px-2 py-1 text-sm text-primary">
                {instruction.programName}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">{instruction.instructionName}</h3>
            {transferSummary && (
              <div className="mt-2 rounded bg-blue-500/10 px-3 py-2 text-sm text-blue-600 dark:text-blue-400">
                <span className="font-medium">Summary:</span> {transferSummary}
              </div>
            )}
          </div>
          <button className="text-muted-foreground hover:text-foreground">
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* Program ID */}
            <div>
              <h4 className="mb-1 text-sm font-semibold text-muted-foreground">Program ID</h4>
              <code className="break-all rounded bg-muted px-2 py-1 text-xs">
                {instruction.programId}
              </code>
            </div>

            {/* Arguments */}
            {Object.keys(instruction.args).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Arguments</h4>
                <div className="space-y-2">
                  {Object.entries(instruction.args).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{key}:</span>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                        {formatValue(value, key)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accounts */}
            {instruction.accounts.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Accounts</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-2 text-left">#</th>
                        <th className="px-2 py-2 text-left">Name</th>
                        <th className="px-2 py-2 text-left">Address</th>
                        <th className="px-2 py-2 text-center">Signer</th>
                        <th className="px-2 py-2 text-center">Writable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instruction.accounts.map((account, idx) => (
                        <tr key={idx} className="border-b border-border">
                          <td className="px-2 py-2">{idx + 1}</td>
                          <td className="px-2 py-2 font-medium">
                            {account.name || `Account ${idx + 1}`}
                          </td>
                          <td className="px-2 py-2">
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
                              {account.pubkey.slice(0, 8)}...{account.pubkey.slice(-8)}
                            </code>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {account.isSigner ? (
                              <span className="text-green-500">✓</span>
                            ) : (
                              <span className="text-muted-foreground/50">-</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {account.isWritable ? (
                              <span className="text-green-500">✓</span>
                            ) : (
                              <span className="text-muted-foreground/50">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Raw Data */}
            {instruction.rawData && (
              <div>
                <h4 className="mb-1 text-sm font-semibold text-muted-foreground">Raw Data</h4>
                <code className="break-all rounded bg-muted px-2 py-1 text-xs">
                  {instruction.rawData}
                </code>
              </div>
            )}

            {/* Inner Instructions */}
            {instruction.innerInstructions && instruction.innerInstructions.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                  Inner Instructions ({instruction.innerInstructions.length})
                </h4>
                <div className="ml-4 space-y-2">
                  {instruction.innerInstructions.map((innerIx, innerIdx) => (
                    <div key={innerIdx} className="border-l-2 border-border pl-4">
                      <div className="text-sm">
                        <span className="font-medium">{innerIx.programName}</span>
                        {' - '}
                        <span className="text-muted-foreground">{innerIx.instructionName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
        <p className="mt-2 text-sm text-muted-foreground">Decoding transaction...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
        <h3 className="mb-2 font-semibold text-destructive">Error Decoding Transaction</h3>
        <p className="text-sm text-destructive/80">{error}</p>
      </div>
    );
  }

  if (!decodedTx) {
    return (
      <div className="p-4 text-center text-muted-foreground">No transaction data available</div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h2 className="mb-4 text-xl font-bold text-foreground">
          Transaction #{transactionIndex.toString()} Details
        </h2>
        <p className="mb-2 text-sm text-muted-foreground">
          Decoded instructions and transaction information
        </p>
      </div>

      {/* Transaction Overview */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold text-foreground">Transaction Overview</h3>
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          {decodedTx.feePayer && (
            <div>
              <span className="font-medium text-muted-foreground">Fee Payer:</span>
              <code className="ml-2 rounded bg-muted px-2 py-1 text-xs">{decodedTx.feePayer}</code>
            </div>
          )}
          {decodedTx.signers.length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">Signers:</span>
              <span className="ml-2">{decodedTx.signers.length}</span>
            </div>
          )}
          {decodedTx.recentBlockhash && (
            <div>
              <span className="font-medium text-muted-foreground">Recent Blockhash:</span>
              <code className="ml-2 rounded bg-muted px-2 py-1 text-xs">
                {decodedTx.recentBlockhash.slice(0, 16)}...
              </code>
            </div>
          )}
          {decodedTx.computeUnits && (
            <div>
              <span className="font-medium text-muted-foreground">Compute Units:</span>
              <span className="ml-2">{decodedTx.computeUnits.toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Signers List */}
        {decodedTx.signers.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Required Signers</h4>
            <div className="space-y-1">
              {decodedTx.signers.map((signer, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                  <code className="rounded bg-muted px-2 py-1 text-xs">{signer}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div>
        <h3 className="mb-3 font-semibold">Instructions ({decodedTx.instructions.length})</h3>
        {decodedTx.instructions.map((instruction, index) => renderInstruction(instruction, index))}
      </div>
    </div>
  );
};
