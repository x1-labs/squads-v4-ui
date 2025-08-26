import React, { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { useRpcUrl } from '@/hooks/useSettings';
import { idlManager } from '@/lib/idls/idlManager';

interface TransactionProgramBadgeProps {
  multisigPda: string;
  transactionIndex: bigint;
  programId?: string;
}

export const TransactionProgramBadge: React.FC<TransactionProgramBadgeProps> = ({
  multisigPda,
  transactionIndex,
  programId = multisig.PROGRAM_ID.toBase58(),
}) => {
  const [programInfo, setProgramInfo] = useState<{ name: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { rpcUrl } = useRpcUrl();

  useEffect(() => {
    const fetchProgramInfo = async () => {
      try {
        const connection = new Connection(rpcUrl || 'https://api.mainnet-beta.solana.com', 'confirmed');
        
        // Get the transaction PDA
        const [transactionPda] = multisig.getTransactionPda({
          multisigPda: new PublicKey(multisigPda),
          index: transactionIndex,
          programId: new PublicKey(programId),
        });

        // Try to fetch as VaultTransaction first
        try {
          const vaultTx = await multisig.accounts.VaultTransaction.fromAccountAddress(
            connection as any,
            transactionPda
          );
          
          if (vaultTx.message && vaultTx.message.instructions?.length > 0) {
            // Get the first instruction's program ID
            const firstInstruction = vaultTx.message.instructions[0];
            const programIdKey = vaultTx.message.accountKeys[firstInstruction.programIdIndex];
            const programIdStr = programIdKey instanceof PublicKey 
              ? programIdKey.toBase58() 
              : typeof programIdKey === 'string' 
                ? programIdKey 
                : new PublicKey(programIdKey).toBase58();
            
            setProgramInfo({
              name: getProgramName(programIdStr),
              id: programIdStr,
            });
          } else {
            setProgramInfo({ name: 'Empty Transaction', id: '' });
          }
        } catch {
          // Try as ConfigTransaction
          try {
            await multisig.accounts.ConfigTransaction.fromAccountAddress(
              connection as any,
              transactionPda
            );
            setProgramInfo({
              name: 'Config Transaction',
              id: programId,
            });
          } catch {
            // Try as Batch
            try {
              await multisig.accounts.Batch.fromAccountAddress(
                connection as any,
                transactionPda
              );
              setProgramInfo({
                name: 'Batch Transaction',
                id: programId,
              });
            } catch {
              setProgramInfo({ name: 'Unknown', id: '' });
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch program info:', error);
        setProgramInfo({ name: 'Error', id: '' });
      } finally {
        setLoading(false);
      }
    };

    fetchProgramInfo();
  }, [multisigPda, transactionIndex, programId, rpcUrl]);

  const getProgramName = (programId: string): string => {
    // Check IDL manager first for registered programs
    const idlEntry = idlManager.getIdl(programId);
    if (idlEntry) {
      return idlEntry.name;
    }
    
    // Fallback to known programs
    const knownPrograms: Record<string, string> = {
      '11111111111111111111111111111111': 'System',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token',
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022',
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'ATA',
      'ComputeBudget111111111111111111111111111111': 'Compute Budget',
      'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo',
      'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo': 'Memo (Legacy)',
      'AddressLookupTab1e1111111111111111111111111': 'Address Lookup',
      'Vote111111111111111111111111111111111111111': 'Vote',
      'Stake11111111111111111111111111111111111111': 'Stake',
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter',
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
      '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca V2',
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
      [multisig.PROGRAM_ID.toBase58()]: 'Squads V4',
    };
    
    return knownPrograms[programId] || 'Unknown Program';
  };

  const formatProgramId = (id: string): string => {
    if (!id) return '';
    if (id.length <= 12) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  };

  const getBadgeStyles = (programName: string): string => {
    let baseStyles = "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset";
    
    if (programName === 'Config Transaction') {
      return `${baseStyles} bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-purple-500/20`;
    }
    if (programName === 'Batch Transaction') {
      return `${baseStyles} bg-warning/10 text-warning ring-warning/20`;
    }
    if (programName === 'Error' || programName === 'Unknown' || programName === 'Unknown Program') {
      return `${baseStyles} bg-destructive/10 text-destructive ring-destructive/20`;
    }
    if (programName === 'System') {
      return `${baseStyles} bg-primary/10 text-primary ring-primary/20`;
    }
    if (programName === 'Token' || programName === 'Token-2022') {
      return `${baseStyles} bg-green-500/10 text-green-600 dark:text-green-400 ring-green-500/20`;
    }
    if (programName === 'Memo' || programName === 'Memo (Legacy)') {
      return `${baseStyles} bg-muted text-muted-foreground ring-border`;
    }
    if (programName === 'Delegation Program') {
      return `${baseStyles} bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-orange-500/20`;
    }
    if (programName === 'Squads Multisig V4' || programName === 'Squads V4') {
      return `${baseStyles} bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-cyan-500/20`;
    }
    // Default for custom programs
    return `${baseStyles} bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-500/20`;
  };

  if (loading) {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-muted text-muted-foreground ring-1 ring-inset ring-border animate-pulse">
        Loading...
      </span>
    );
  }

  if (!programInfo) {
    return null;
  }

  // Only show program ID if we don't have a meaningful name
  const shouldShowId = programInfo.id && 
    (programInfo.name === 'Unknown' || 
     programInfo.name === 'Unknown Program' || 
     programInfo.name === 'Error' ||
     programInfo.name === 'Empty Transaction');

  return (
    <div className="flex items-center gap-2">
      <span className={getBadgeStyles(programInfo.name)}>
        {programInfo.name}
      </span>
      {shouldShowId && (
        <span className="text-xs text-muted-foreground font-mono">
          {formatProgramId(programInfo.id)}
        </span>
      )}
    </div>
  );
};