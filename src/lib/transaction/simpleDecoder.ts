import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { idlManager } from '../idls/idlManager';
import { IdlFormat, isAnchorCompatible } from '../idls/idlFormats';

export interface DecodedInstruction {
  programId: string;
  programName: string;
  instructionName: string;
  humanReadable?: string;
  innerInstructions?: DecodedInstruction[];
  accounts: Array<{
    name?: string;
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  args: Record<string, any>;
  rawData?: string;
}

export interface DecodedTransaction {
  instructions: DecodedInstruction[];
  signers: string[];
  feePayer?: string;
  recentBlockhash?: string;
  computeUnits?: number;
  error?: string;
}

export class SimpleDecoder {
  private connection: Connection;
  private instructionCoders: Map<string, BorshInstructionCoder> = new Map();
  
  /**
   * Format token amount with decimals
   */
  private formatTokenAmount(amount: string | number | bigint, decimals: number = 0): string {
    const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount.toString());
    if (decimals === 0) {
      return amountBigInt.toString();
    }
    
    const divisor = BigInt(10 ** decimals);
    const wholePart = amountBigInt / divisor;
    const fractionalPart = amountBigInt % divisor;
    
    if (fractionalPart === BigInt(0)) {
      return wholePart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    // Remove trailing zeros
    const trimmed = fractionalStr.replace(/0+$/, '');
    return `${wholePart}.${trimmed}`;
  }
  
  /**
   * Format SOL amount (9 decimals)
   */
  private formatSolAmount(lamports: string | number | bigint): string {
    return this.formatTokenAmount(lamports, 9);
  }
  
  /**
   * Truncate address for display
   */
  private truncateAddress(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }
  
  /**
   * Generate human-readable message for token instructions
   */
  private generateTokenInstructionMessage(
    instructionName: string,
    args: any,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>,
    useTruncated: boolean = false
  ): string | undefined {
    const name = instructionName.toLowerCase();
    
    if (name === 'transfer' || name === 'transferchecked') {
      const amount = args.amount || '0';
      const decimals = args.decimals;
      
      // Format amount with decimals if available
      // For basic transfer, decimals are not included in the instruction
      let formattedAmount: string;
      if (decimals !== undefined && decimals !== null) {
        formattedAmount = this.formatTokenAmount(amount, decimals);
      } else {
        // For basic transfer without decimals, try common decimal places
        // Most SPL tokens use 6 or 9 decimals
        const amountStr = amount.toString();
        
        // Try 9 decimals first (most common for SPL tokens)
        const with9Decimals = this.formatTokenAmount(amount, 9);
        // Only show alternative if significantly different
        if (amountStr.length > 10) {
          const with6Decimals = this.formatTokenAmount(amount, 6);
          formattedAmount = `${with9Decimals} (likely) or ${with6Decimals}`;
        } else if (amountStr.length > 7) {
          formattedAmount = with9Decimals;
        } else {
          // Very small amount, show raw
          formattedAmount = `${amountStr} smallest units`;
        }
      }
      
      // Get account addresses - use full addresses for summary
      const fromAddr = accountKeys[0]?.pubkey?.toBase58() || 'Unknown';
      const from = useTruncated ? this.truncateAddress(fromAddr) : fromAddr;
      
      const toIndex = name === 'transferchecked' ? 2 : 1;
      const toAddr = accountKeys[toIndex]?.pubkey?.toBase58() || 'Unknown';
      const to = useTruncated ? this.truncateAddress(toAddr) : toAddr;
      
      // Get mint address - for basic transfer, there's no mint in the accounts
      let mint = 'tokens';
      if (name === 'transferchecked' && accountKeys[1]?.pubkey) {
        const mintAddr = accountKeys[1].pubkey.toBase58();
        mint = useTruncated ? this.truncateAddress(mintAddr) : mintAddr;
      }
      
      return `Transfer ${formattedAmount}\nToken: ${mint}\nFrom: ${from}\nTo: ${to}`;
    }
    
    if (name === 'mintto' || name === 'minttochecked') {
      const amount = args.amount || '0';
      const decimals = args.decimals;
      
      const formattedAmount = (decimals !== undefined && decimals !== null)
        ? this.formatTokenAmount(amount, decimals)
        : `${amount} (raw)`;
      
      const mintAddr = accountKeys[0]?.pubkey?.toBase58() || 'Unknown';
      const mint = useTruncated ? this.truncateAddress(mintAddr) : mintAddr;
      const toAddr = accountKeys[1]?.pubkey?.toBase58() || 'Unknown';
      const to = useTruncated ? this.truncateAddress(toAddr) : toAddr;
      
      return `Mint ${formattedAmount}\nToken: ${mint}\nTo: ${to}`;
    }
    
    if (name === 'burn' || name === 'burnchecked') {
      const amount = args.amount || '0';
      const decimals = args.decimals;
      
      const formattedAmount = (decimals !== undefined && decimals !== null)
        ? this.formatTokenAmount(amount, decimals)
        : `${amount} (raw)`;
      
      const accountAddr = accountKeys[0]?.pubkey?.toBase58() || 'Unknown';
      const account = useTruncated ? this.truncateAddress(accountAddr) : accountAddr;
      const mintAddr = accountKeys[1]?.pubkey?.toBase58() || 'tokens';
      const mint = useTruncated ? this.truncateAddress(mintAddr) : mintAddr;
      
      return `Burn ${formattedAmount}\nToken: ${mint}\nFrom: ${account}`;
    }
    
    if (name === 'approve' || name === 'approvechecked') {
      const amount = args.amount || '0';
      const decimals = args.decimals;
      
      const formattedAmount = (decimals !== undefined && decimals !== null)
        ? this.formatTokenAmount(amount, decimals)
        : `${amount} (raw)`;
      
      const accountAddr = accountKeys[0]?.pubkey?.toBase58() || 'Unknown';
      const account = useTruncated ? this.truncateAddress(accountAddr) : accountAddr;
      const delegateAddr = accountKeys[2]?.pubkey?.toBase58() || 'Unknown';
      const delegate = useTruncated ? this.truncateAddress(delegateAddr) : delegateAddr;
      
      return `Approve ${formattedAmount} tokens\nDelegate: ${delegate}\nFrom: ${account}`;
    }
    
    if (name === 'closeaccount') {
      const accountAddr = accountKeys[0]?.pubkey?.toBase58() || 'Unknown';
      const account = useTruncated ? this.truncateAddress(accountAddr) : accountAddr;
      const destAddr = accountKeys[1]?.pubkey?.toBase58() || 'Unknown';
      const dest = useTruncated ? this.truncateAddress(destAddr) : destAddr;
      
      return `Close token account\nAccount: ${account}\nReturn rent to: ${dest}`;
    }
    
    return undefined;
  }
  
  constructor(connection: Connection) {
    this.connection = connection;
    this.initializeCoders();
  }
  
  private resolveCustomTypes(idl: any): any {
    // Create a copy of the IDL to avoid modifying the original
    const resolvedIdl = JSON.parse(JSON.stringify(idl));
    
    // Build a type map for quick lookups
    const typeMap = new Map<string, any>();
    if (resolvedIdl.types) {
      resolvedIdl.types.forEach((type: any) => {
        if (type.name) {
          typeMap.set(type.name, type.type);
        }
      });
    }
    
    // Function to resolve a type reference
    const resolveType = (field: any): any => {
      if (field.type && typeof field.type === 'object') {
        if (field.type.defined && field.type.defined.name) {
          // This is a reference to a custom type
          const customType = typeMap.get(field.type.defined.name);
          if (customType) {
            // Replace the reference with the actual type
            return { ...field, type: customType };
          }
        } else if (field.type.option) {
          // Resolve option types
          return { ...field, type: { option: resolveType({ type: field.type.option }).type } };
        } else if (field.type.vec) {
          // Resolve vec types
          return { ...field, type: { vec: resolveType({ type: field.type.vec }).type } };
        }
      }
      return field;
    };
    
    // Resolve types in instructions
    if (resolvedIdl.instructions) {
      resolvedIdl.instructions = resolvedIdl.instructions.map((instruction: any) => {
        if (instruction.args && Array.isArray(instruction.args)) {
          return {
            ...instruction,
            args: instruction.args.map(resolveType)
          };
        }
        return instruction;
      });
    }
    
    // Resolve types in accounts
    if (resolvedIdl.accounts) {
      resolvedIdl.accounts = resolvedIdl.accounts.map((account: any) => {
        if (account.type && account.type.fields) {
          return {
            ...account,
            type: {
              ...account.type,
              fields: account.type.fields.map(resolveType)
            }
          };
        }
        return account;
      });
    }
    
    return resolvedIdl;
  }

  private initializeCoders() {
    // Load all IDLs and create instruction coders
    const idls = idlManager.getAllIdls();
    console.log('Initializing decoders for programs:', idls.map(e => ({ 
      name: e.name, 
      id: e.programId, 
      format: e.format 
    })));
    
    for (const entry of idls) {
      try {
        // Only create BorshInstructionCoder for Anchor-compatible IDLs
        if (isAnchorCompatible(entry.format) && entry.idl && entry.idl.instructions) {
          try {
            const coder = new BorshInstructionCoder(entry.idl);
            this.instructionCoders.set(entry.programId, coder);
            console.log(`✅ Created BorshInstructionCoder for ${entry.name} (format: ${entry.format})`);
          } catch (e: any) {
            console.warn(`❌ BorshInstructionCoder failed for ${entry.name}:`, {
              error: e.message || e.toString(),
              format: entry.format,
              idlName: entry.idl.name,
              idlVersion: entry.idl.version,
              hasInstructions: !!entry.idl.instructions,
              instructionCount: entry.idl.instructions?.length
            });
            // Fallback: try with resolved types if direct approach fails
            try {
              const resolvedIdl = this.resolveCustomTypes(entry.idl);
              const coder = new BorshInstructionCoder(resolvedIdl);
              this.instructionCoders.set(entry.programId, coder);
              console.log(`✅ Created BorshInstructionCoder for ${entry.name} (with resolved types, format: ${entry.format})`);
            } catch (e2) {
              console.warn(`❌ BorshInstructionCoder still failed for ${entry.name}:`, e2);
            }
          }
        } else if (entry.format === IdlFormat.KINOBI && entry.parser) {
          console.log(`✅ Using Kinobi parser for ${entry.name}`);
        } else {
          console.log(`⚠️ No parser available for ${entry.name} (format: ${entry.format})`);
        }
      } catch (error) {
        console.warn(`❌ Failed to create parser for ${entry.name}:`, error);
      }
    }
    
    console.log('Parsers initialized:', {
      borshCoders: Array.from(this.instructionCoders.keys()),
      kinobiParsers: idls.filter(e => e.format === IdlFormat.KINOBI).map(e => e.programId)
    });
  }
  
  /**
   * Decode a transaction from the multisig vault
   */
  public async decodeVaultTransaction(
    multisigPda: PublicKey,
    transactionIndex: bigint,
    programId: PublicKey = multisig.PROGRAM_ID
  ): Promise<DecodedTransaction> {
    try {
      // Get the transaction PDA
      const [transactionPda] = multisig.getTransactionPda({
        multisigPda,
        index: transactionIndex,
        programId,
      });
      
      // Try to fetch as VaultTransaction
      try {
        const vaultTx = await multisig.accounts.VaultTransaction.fromAccountAddress(
          this.connection as any,
          transactionPda
        );
        
        // VaultTransactionMessage is a structured object, not a raw buffer
        if (vaultTx.message) {
          // Decode the structured message
          return this.decodeVaultTransactionMessage(vaultTx.message);
        }
        
        return {
          instructions: [],
          signers: [],
          error: 'No message found in vault transaction'
        };
      } catch (vaultError) {
        console.log('Failed to fetch as VaultTransaction:', vaultError);
        // Try config transaction
        try {
          const configTx = await multisig.accounts.ConfigTransaction.fromAccountAddress(
            this.connection as any,
            transactionPda
          );
          
          return this.decodeConfigTransaction(configTx, transactionIndex, programId);
        } catch {
          // Try batch transaction
          try {
            const batch = await multisig.accounts.Batch.fromAccountAddress(
              this.connection as any,
              transactionPda
            );
            
            return this.decodeBatchTransaction(batch, transactionIndex, programId);
          } catch (error) {
            return {
              instructions: [],
              signers: [],
              error: `Failed to fetch transaction: ${error}`
            };
          }
        }
      }
    } catch (error) {
      console.error('Error decoding transaction:', error);
      return {
        instructions: [],
        signers: [],
        error: error instanceof Error ? error.message : 'Failed to decode transaction'
      };
    }
  }
  
  /**
   * Decode a structured VaultTransactionMessage
   */
  private decodeVaultTransactionMessage(message: any): DecodedTransaction {
    try {
      const instructions: DecodedInstruction[] = [];
      
      // Parse each instruction from the structured message
      if (message.instructions && Array.isArray(message.instructions)) {
        for (const compiledIx of message.instructions) {
          
          // Get the program ID from account keys - handle various formats
          const programIdKey = message.accountKeys[compiledIx.programIdIndex];
          let programId: PublicKey;
          if (programIdKey instanceof PublicKey) {
            programId = programIdKey;
          } else if (typeof programIdKey === 'string') {
            programId = new PublicKey(programIdKey);
          } else if (programIdKey && typeof programIdKey === 'object') {
            // Handle object with _bn or other properties
            programId = new PublicKey(programIdKey);
          } else {
            console.warn('Unknown program ID format:', programIdKey);
            programId = PublicKey.default;
          }
          
          // Get account keys for this instruction
          // accountIndexes is a Uint8Array, need to convert to array
          const indexArray = compiledIx.accountIndexes ? 
            Array.from(compiledIx.accountIndexes) : 
            (compiledIx.accountKeyIndexes || []);
          
          const accountKeys = indexArray.map((index: number) => {
            const pubkey = message.accountKeys[index];
            if (!pubkey) {
              console.warn(`No account key at index ${index}, total keys: ${message.accountKeys?.length}`);
              return {
                pubkey: PublicKey.default,
                isSigner: false,
                isWritable: false,
              };
            }
            // Ensure pubkey is a PublicKey object - handle various formats
            let publicKey: PublicKey;
            if (pubkey instanceof PublicKey) {
              publicKey = pubkey;
            } else if (typeof pubkey === 'string') {
              publicKey = new PublicKey(pubkey);
            } else if (pubkey && typeof pubkey === 'object') {
              // Handle object with _bn or other properties
              publicKey = new PublicKey(pubkey);
            } else {
              console.warn('Unknown pubkey format at index', index, ':', pubkey);
              publicKey = PublicKey.default;
            }
            return {
              pubkey: publicKey,
              isSigner: index < message.numSigners,
              isWritable: index < message.numWritableSigners ||
                        (index >= message.numSigners && 
                         index < message.numSigners + message.numWritableNonSigners),
            };
          });
          
          // Parse the instruction
          const instructionData = Buffer.from(compiledIx.data);
          const decoded = this.parseInstruction(
            programId,
            instructionData,
            accountKeys
          );
          
          instructions.push(decoded);
        }
      }
      
      // Get signers - ensure they are PublicKey instances
      const signers = message.accountKeys
        ?.slice(0, message.numSigners)
        ?.map((key: any) => {
          if (!key) return 'Unknown';
          if (key instanceof PublicKey) {
            return key.toBase58();
          } else if (typeof key === 'string') {
            return key; // Already a base58 string
          } else if (key && typeof key === 'object') {
            try {
              return new PublicKey(key).toBase58();
            } catch (e) {
              console.warn('Failed to convert signer to PublicKey:', key);
              return 'Unknown';
            }
          }
          return 'Unknown';
        }) || [];
      
      // Get fee payer - ensure it's a PublicKey instance
      let feePayer: string | undefined = undefined;
      if (message.accountKeys?.[0]) {
        const firstKey = message.accountKeys[0];
        if (firstKey instanceof PublicKey) {
          feePayer = firstKey.toBase58();
        } else if (typeof firstKey === 'string') {
          feePayer = firstKey; // Already a base58 string
        } else if (firstKey && typeof firstKey === 'object') {
          try {
            feePayer = new PublicKey(firstKey).toBase58();
          } catch (e) {
            console.warn('Failed to convert fee payer to PublicKey:', firstKey);
            feePayer = 'Unknown';
          }
        }
      }
      
      return {
        instructions,
        signers,
        feePayer,
      };
    } catch (error) {
      console.error('Error decoding vault transaction message:', error);
      return {
        instructions: [],
        signers: [],
        error: 'Failed to decode vault transaction message'
      };
    }
  }
  
  /**
   * Decode a transaction message buffer
   */
  public async decodeTransactionMessage(message: Buffer | Uint8Array): Promise<DecodedTransaction> {
    try {
      const tx = VersionedTransaction.deserialize(message);
      const instructions: DecodedInstruction[] = [];
      
      // Parse each instruction
      for (let i = 0; i < tx.message.compiledInstructions.length; i++) {
        const compiledIx = tx.message.compiledInstructions[i];
        const programId = tx.message.staticAccountKeys[compiledIx.programIdIndex];
        
        // Get account keys for this instruction
        const accountKeys = compiledIx.accountKeyIndexes.map((index: number) => {
          const pubkey = tx.message.staticAccountKeys[index];
          return {
            pubkey,
            isSigner: index < tx.message.header.numRequiredSignatures,
            isWritable: index < tx.message.header.numRequiredSignatures - 
                       tx.message.header.numReadonlySignedAccounts ||
                      (index >= tx.message.header.numRequiredSignatures &&
                       index < tx.message.staticAccountKeys.length - 
                       tx.message.header.numReadonlyUnsignedAccounts),
          };
        });
        
        // Parse the instruction
        const instructionData = Buffer.from(compiledIx.data);
        const decoded = this.parseInstruction(
          programId,
          instructionData,
          accountKeys
        );
        
        instructions.push(decoded);
      }
      
      return {
        instructions,
        signers: tx.message.staticAccountKeys
          .slice(0, tx.message.header.numRequiredSignatures)
          .map(key => key.toBase58()),
        feePayer: tx.message.staticAccountKeys[0]?.toBase58(),
        recentBlockhash: tx.message.recentBlockhash,
      };
    } catch (error) {
      console.error('Error parsing transaction message:', error);
      return {
        instructions: [],
        signers: [],
        error: 'Failed to parse transaction message'
      };
    }
  }
  
  /**
   * Parse an instruction
   */
  private parseInstruction(
    programId: PublicKey,
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const programIdStr = programId.toBase58();
    
    // Check for known programs first
    if (this.isKnownProgram(programIdStr)) {
      return this.parseKnownProgramInstruction(programId, data, accountKeys);
    }
    
    // Get the IDL entry to check format
    const idlEntry = idlManager.getIdl(programIdStr);
    
    // Try Kinobi parser for Kinobi-format IDLs
    if (idlEntry?.format === IdlFormat.KINOBI && idlEntry.parser) {
      try {
        const decoded = idlEntry.parser.decodeInstruction(data);
        if (decoded) {
          // Get account names from the instruction metadata
          const instruction = idlEntry.parser.getInstruction(decoded.name);
          const accountNames = instruction?.accounts?.map(acc => acc.name) || [];
          
          return {
            programId: programIdStr,
            programName: this.getProgramName(programIdStr),
            instructionName: this.formatInstructionName(decoded.name),
            accounts: accountKeys.map((key, i) => ({
              name: accountNames[i] || `Account ${i}`,
              pubkey: key.pubkey.toBase58(),
              isSigner: key.isSigner,
              isWritable: key.isWritable,
            })),
            args: decoded.data || {},
            rawData: data.toString('hex').slice(0, 100)
          };
        }
      } catch (error) {
        console.warn(`Kinobi parser failed for ${programIdStr}:`, error);
      }
    }
    
    // Try to decode with Anchor IDL (for Anchor-compatible formats)
    if (idlEntry && isAnchorCompatible(idlEntry.format)) {
      const coder = this.instructionCoders.get(programIdStr);
      if (coder) {
        try {
          const decoded = coder.decode(data);
          if (decoded) {
            // Get the IDL to map account names
            let accountNames: string[] = [];
            
            if (idlEntry?.idl?.instructions) {
              const instruction = idlEntry.idl.instructions.find(
                (ix: any) => ix.name === decoded.name
              );
              if (instruction?.accounts) {
                accountNames = instruction.accounts.map((acc: any) => acc.name || `Account`);
              }
            }
            
            return {
              programId: programIdStr,
              programName: this.getProgramName(programIdStr),
              instructionName: this.formatInstructionName(decoded.name || 'Unknown Instruction'),
              accounts: accountKeys.map((key, i) => ({
                name: accountNames[i] || `Account ${i}`,
                pubkey: key.pubkey.toBase58(),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
              })),
              args: decoded.data || {},
              rawData: data.toString('hex').slice(0, 100)
            };
          }
        } catch (error) {
          console.warn(`BorshInstructionCoder failed for ${programIdStr}:`, error);
        }
      }
    }
    
    // Fallback to basic parsing
    return this.basicInstructionParse(programId, data, accountKeys);
  }
  
  /**
   * Check if program is a known program
   */
  private isKnownProgram(programIdStr: string): boolean {
    const knownPrograms = [
      '11111111111111111111111111111111', // System
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022
      'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', // Memo
      'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo', // Memo Legacy
      'ComputeBudget111111111111111111111111111111', // Compute Budget
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token
      'AddressLookupTab1e1111111111111111111111111', // Address Lookup Table
      'Vote111111111111111111111111111111111111111', // Vote
      'Stake11111111111111111111111111111111111111', // Stake
      'Config1111111111111111111111111111111111111', // Config
    ];
    return knownPrograms.includes(programIdStr);
  }
  
  /**
   * Parse known program instructions
   */
  private parseKnownProgramInstruction(
    programId: PublicKey,
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const programIdStr = programId.toBase58();
    
    // Check if we have a Kinobi parser for this known program
    const idlEntry = idlManager.getIdl(programIdStr);
    if (idlEntry?.format === IdlFormat.KINOBI && idlEntry.parser) {
      try {
        const decoded = idlEntry.parser.decodeInstruction(data);
        if (decoded) {
          const instruction = idlEntry.parser.getInstruction(decoded.name);
          const accountNames = instruction?.accounts?.map(acc => acc.name) || [];
          
          // Generate human-readable message for token transfers
          let humanReadable: string | undefined;
          if (programIdStr === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' || 
              programIdStr === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
            // Use full addresses for the summary display
            humanReadable = this.generateTokenInstructionMessage(decoded.name, decoded.data, accountKeys, false);
          }
          
          const result: DecodedInstruction = {
            programId: programIdStr,
            programName: this.getProgramName(programIdStr),
            instructionName: this.formatInstructionName(decoded.name),
            accounts: accountKeys.map((key, i) => ({
              name: accountNames[i] || this.getTokenAccountName(data[0], i),
              pubkey: key.pubkey.toBase58(),
              isSigner: key.isSigner,
              isWritable: key.isWritable,
            })),
            args: decoded.data || {},
            rawData: data.toString('hex').slice(0, 100)
          };
          
          if (humanReadable) {
            result.humanReadable = humanReadable;
          }
          
          return result;
        }
      } catch (error) {
        console.warn(`Kinobi parser failed for known program ${programIdStr}, falling back to hardcoded parsing:`, error);
      }
    }
    
    // System Program
    if (programIdStr === '11111111111111111111111111111111') {
      return this.parseSystemInstruction(data, accountKeys);
    }
    
    // Token Programs (fallback to hardcoded parsing if no Kinobi parser)
    if (programIdStr === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
        programIdStr === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') {
      return this.parseTokenInstruction(programIdStr, data, accountKeys);
    }
    
    // Memo Programs
    if (programIdStr === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' ||
        programIdStr === 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo') {
      return this.parseMemoInstruction(programIdStr, data, accountKeys);
    }
    
    // Compute Budget Program
    if (programIdStr === 'ComputeBudget111111111111111111111111111111') {
      return this.parseComputeBudgetInstruction(data, accountKeys);
    }
    
    // Associated Token Program
    if (programIdStr === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') {
      return this.parseAssociatedTokenInstruction(data, accountKeys);
    }
    
    // Address Lookup Table Program
    if (programIdStr === 'AddressLookupTab1e1111111111111111111111111') {
      return this.parseAddressLookupTableInstruction(data, accountKeys);
    }
    
    // Fallback
    return this.basicInstructionParse(programId, data, accountKeys);
  }
  
  /**
   * Basic instruction parsing fallback
   */
  private basicInstructionParse(
    programId: PublicKey,
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const programIdStr = programId.toBase58();
    
    // Generic fallback
    return {
      programId: programIdStr,
      programName: this.getProgramName(programIdStr),
      instructionName: 'Unknown Instruction',
      accounts: accountKeys.map((key, i) => ({
        name: `Account ${i}`,
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args: { 
        data: data.toString('hex').slice(0, 100) + (data.length > 50 ? '...' : '')
      }
    };
  }
  
  /**
   * Parse system program instructions
   */
  private parseSystemInstruction(
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const instructionType = data.readUInt32LE(0);
    let instructionName = 'Unknown System Instruction';
    let humanReadable: string | undefined;
    let args: any = {};
    
    switch (instructionType) {
      case 0: // CreateAccount
        instructionName = 'Create Account';
        if (data.length >= 52) {
          args = {
            lamports: data.readBigUInt64LE(4).toString(),
            space: data.readBigUInt64LE(12).toString(),
            owner: new PublicKey(data.slice(20, 52)).toBase58(),
          };
        }
        break;
      case 2: // Transfer
        instructionName = 'Transfer';
        if (data.length >= 12) {
          args = {
            lamports: data.readBigUInt64LE(4).toString(),
          };
          // Generate human-readable message with full addresses
          const amount = this.formatSolAmount(args.lamports);
          const from = accountKeys[0]?.pubkey?.toBase58() || 'Unknown';
          const to = accountKeys[1]?.pubkey?.toBase58() || 'Unknown';
          humanReadable = `Transfer ${amount} SOL\nFrom: ${from}\nTo: ${to}`;
        }
        break;
      case 3: // Assign
        instructionName = 'Assign';
        if (data.length >= 36) {
          args = {
            owner: new PublicKey(data.slice(4, 36)).toBase58(),
          };
        }
        break;
      case 9: // Allocate
        instructionName = 'Allocate';
        if (data.length >= 12) {
          args = {
            space: data.readBigUInt64LE(4).toString(),
          };
        }
        break;
    }
    
    const result: DecodedInstruction = {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      instructionName,
      accounts: accountKeys.map((key, i) => ({
        name: this.getSystemAccountName(instructionType, i),
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args
    };
    
    if (humanReadable) {
      result.humanReadable = humanReadable;
    }
    
    return result;
  }
  
  /**
   * Parse token program instructions
   */
  private parseTokenInstruction(
    programId: string,
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const instructionType = data[0];
    let instructionName = 'Unknown Token Instruction';
    let humanReadable: string | undefined;
    let args: any = {};
    
    switch (instructionType) {
      case 0: // InitializeMint
        instructionName = 'Initialize Mint';
        if (data.length >= 67) {
          args = {
            decimals: data[1],
            mintAuthority: new PublicKey(data.slice(2, 34)).toBase58(),
            freezeAuthority: data[34] === 1 ? new PublicKey(data.slice(35, 67)).toBase58() : null
          };
        }
        break;
      case 1: // InitializeAccount
        instructionName = 'Initialize Account';
        break;
      case 2: // InitializeMultisig
        instructionName = 'Initialize Multisig';
        if (data.length >= 2) {
          args = { m: data[1] };
        }
        break;
      case 3: // Transfer
        instructionName = 'Transfer';
        if (data.length >= 9) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
          };
          // Generate human-readable message
          // For basic transfer, we don't know decimals, so just show raw amount with full addresses
          const from = accountKeys[0]?.pubkey?.toBase58() || 'Unknown';
          const to = accountKeys[1]?.pubkey?.toBase58() || 'Unknown';
          humanReadable = `Transfer ${args.amount} tokens (raw amount)\nFrom: ${from}\nTo: ${to}`;
        }
        break;
      case 4: // Approve
        instructionName = 'Approve';
        if (data.length >= 9) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
          };
        }
        break;
      case 5: // Revoke
        instructionName = 'Revoke';
        break;
      case 6: // SetAuthority
        instructionName = 'Set Authority';
        if (data.length >= 3) {
          const authorityType = data[1];
          const authorityTypes = ['MintTokens', 'FreezeAccount', 'AccountOwner', 'CloseAccount'];
          args = {
            authorityType: authorityTypes[authorityType] || 'Unknown',
            newAuthority: data[2] === 1 && data.length >= 35 ? 
              new PublicKey(data.slice(3, 35)).toBase58() : null
          };
        }
        break;
      case 7: // MintTo
        instructionName = 'Mint To';
        if (data.length >= 9) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
          };
        }
        break;
      case 8: // Burn
        instructionName = 'Burn';
        if (data.length >= 9) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
          };
        }
        break;
      case 9: // CloseAccount
        instructionName = 'Close Account';
        break;
      case 10: // FreezeAccount
        instructionName = 'Freeze Account';
        break;
      case 11: // ThawAccount
        instructionName = 'Thaw Account';
        break;
      case 12: // TransferChecked
        instructionName = 'Transfer Checked';
        if (data.length >= 10) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
            decimals: data[9]
          };
          // Generate human-readable message with proper decimals and full addresses
          const formattedAmount = this.formatTokenAmount(args.amount, args.decimals);
          const from = accountKeys[0]?.pubkey?.toBase58() || 'Unknown';
          const to = accountKeys[2]?.pubkey?.toBase58() || 'Unknown';
          const mint = accountKeys[1]?.pubkey?.toBase58() || 'token';
          humanReadable = `Transfer ${formattedAmount}\nToken: ${mint}\nFrom: ${from}\nTo: ${to}`;
        }
        break;
      case 13: // ApproveChecked
        instructionName = 'Approve Checked';
        if (data.length >= 10) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
            decimals: data[9]
          };
        }
        break;
      case 14: // MintToChecked
        instructionName = 'Mint To Checked';
        if (data.length >= 10) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
            decimals: data[9]
          };
        }
        break;
      case 15: // BurnChecked
        instructionName = 'Burn Checked';
        if (data.length >= 10) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
            decimals: data[9]
          };
        }
        break;
      case 16: // InitializeAccount2
        instructionName = 'Initialize Account 2';
        if (data.length >= 33) {
          args = {
            owner: new PublicKey(data.slice(1, 33)).toBase58()
          };
        }
        break;
      case 17: // SyncNative
        instructionName = 'Sync Native';
        break;
      case 18: // InitializeAccount3
        instructionName = 'Initialize Account 3';
        if (data.length >= 33) {
          args = {
            owner: new PublicKey(data.slice(1, 33)).toBase58()
          };
        }
        break;
      case 19: // InitializeMultisig2
        instructionName = 'Initialize Multisig 2';
        if (data.length >= 2) {
          args = { m: data[1] };
        }
        break;
      case 20: // InitializeMint2
        instructionName = 'Initialize Mint 2';
        if (data.length >= 67) {
          args = {
            decimals: data[1],
            mintAuthority: new PublicKey(data.slice(2, 34)).toBase58(),
            freezeAuthority: data[34] === 1 ? new PublicKey(data.slice(35, 67)).toBase58() : null
          };
        }
        break;
    }
    
    const isToken2022 = programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
    
    const result: DecodedInstruction = {
      programId,
      programName: isToken2022 ? 'Token-2022 Program' : 'Token Program',
      instructionName,
      accounts: accountKeys.map((key, i) => ({
        name: this.getTokenAccountName(instructionType, i),
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args
    };
    
    if (humanReadable) {
      result.humanReadable = humanReadable;
    }
    
    return result;
  }
  
  /**
   * Decode a config transaction
   */
  private decodeConfigTransaction(configTx: any, transactionIndex: bigint, programId: PublicKey): DecodedTransaction {
    const actions = configTx.actions || [];
    const decodedActions = actions.map((action: any) => this.decodeConfigAction(action));
    
    return {
      instructions: [{
        programId: programId.toBase58(),
        programName: 'Squads Multisig V4',
        instructionName: 'Config Transaction',
        accounts: [],
        args: {
          transactionIndex: transactionIndex.toString(),
          creator: configTx.creator?.toBase58?.() || 'Unknown',
          actions: decodedActions
        }
      }],
      signers: [configTx.creator?.toBase58?.() || 'Unknown'],
    };
  }
  
  /**
   * Decode a config action
   */
  private decodeConfigAction(action: any): any {
    if (!action || typeof action !== 'object') {
      return { type: 'Unknown', data: action };
    }
    
    // The action structure in Anchor uses __kind for the discriminator
    const actionType = action.__kind || action.kind;
    
    // If we can't find the action type, show the raw data
    if (!actionType) {
      console.log('Unknown action structure:', action);
      return { 
        type: 'Unknown Action', 
        rawData: action 
      };
    }
    
    switch (actionType) {
      case 'AddMember':
      case 'addMember':
        const newMemberKey = action.newMember?.key;
        return {
          type: 'Add Member',
          member: newMemberKey ? 
            (typeof newMemberKey.toBase58 === 'function' ? newMemberKey.toBase58() : newMemberKey.toString()) : 
            'Unknown',
          permissions: {
            mask: action.newMember?.permissions?.mask || 0,
            ...(action.newMember?.permissions || {})
          }
        };
      
      case 'RemoveMember':
      case 'removeMember':
        const oldMemberKey = action.oldMember;
        return {
          type: 'Remove Member',
          member: oldMemberKey ? 
            (typeof oldMemberKey.toBase58 === 'function' ? oldMemberKey.toBase58() : oldMemberKey.toString()) : 
            'Unknown'
        };
      
      case 'ChangeThreshold':
      case 'changeThreshold':
        return {
          type: 'Change Threshold',
          newThreshold: action.newThreshold || 0
        };
      
      case 'SetTimeLock':
      case 'setTimeLock':
        return {
          type: 'Set Time Lock',
          timeLock: action.timeLock || 0
        };
      
      case 'AddSpendingLimit':
      case 'addSpendingLimit':
        return {
          type: 'Add Spending Limit',
          createKey: action.spendingLimit?.createKey?.toBase58?.() || action.spendingLimit?.createKey,
          vaultIndex: action.spendingLimit?.vaultIndex,
          mint: action.spendingLimit?.mint?.toBase58?.() || action.spendingLimit?.mint,
          amount: action.spendingLimit?.amount?.toString?.() || action.spendingLimit?.amount,
          period: action.spendingLimit?.period,
          members: action.spendingLimit?.members?.map?.((m: any) => 
            m?.toBase58?.() || m?.toString?.() || m
          ) || [],
          destinations: action.spendingLimit?.destinations?.map?.((d: any) => 
            d?.toBase58?.() || d?.toString?.() || d
          ) || []
        };
      
      case 'RemoveSpendingLimit':
      case 'removeSpendingLimit':
        return {
          type: 'Remove Spending Limit',
          spendingLimitKey: action.spendingLimit?.toBase58?.() || action.spendingLimit
        };
      
      default:
        // For unknown action types, show all the data
        return {
          type: actionType || 'Unknown Action',
          data: { ...action, __kind: undefined, kind: undefined }
        };
    }
  }
  
  /**
   * Decode a batch transaction
   */
  private decodeBatchTransaction(batch: any, transactionIndex: bigint, programId: PublicKey): DecodedTransaction {
    return {
      instructions: [{
        programId: programId.toBase58(),
        programName: 'Squads Multisig V4',
        instructionName: 'Batch Transaction',
        accounts: [],
        args: {
          transactionIndex: transactionIndex.toString(),
          creator: batch.creator?.toBase58?.() || 'Unknown',
          vaultIndex: batch.vaultIndex,
          size: batch.size || 0,
          executedTransactionIndex: batch.executedTransactionIndex || 0,
          summary: `Batch contains ${batch.size || 0} transactions, ${batch.executedTransactionIndex || 0} executed`
        }
      }],
      signers: [batch.creator?.toBase58?.() || 'Unknown'],
    };
  }
  
  /**
   * Extract buffer from various message formats
   */
  private extractBuffer(message: any): Buffer | Uint8Array | null {
    if (!message) return null;
    
    if (message.buffer || message.data) {
      return message.buffer || message.data;
    }
    
    if (Buffer.isBuffer(message) || message instanceof Uint8Array) {
      return message;
    }
    
    try {
      return Buffer.from(message);
    } catch {
      return null;
    }
  }
  
  /**
   * Get program name from ID
   */
  private getProgramName(programId: string): string {
    const knownPrograms: Record<string, string> = {
      '11111111111111111111111111111111': 'System Program',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022 Program',
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token Program',
      'ComputeBudget111111111111111111111111111111': 'Compute Budget Program',
      'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
      'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo': 'Memo Program (Legacy)',
      'AddressLookupTab1e1111111111111111111111111': 'Address Lookup Table Program',
      'Vote111111111111111111111111111111111111111': 'Vote Program',
      'Stake11111111111111111111111111111111111111': 'Stake Program',
      'Config1111111111111111111111111111111111111': 'Config Program',
      'BPFLoaderUpgradeab1e11111111111111111111111': 'BPF Upgradeable Loader',
      'BPFLoader2111111111111111111111111111111111': 'BPF Loader',
      'BPFLoader1111111111111111111111111111111111': 'BPF Loader (Deprecated)',
      'Ed25519SigVerify111111111111111111111111111': 'Ed25519 Program',
      'KeccakSecp256k11111111111111111111111111111': 'Secp256k1 Program',
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter Aggregator',
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca Whirlpool',
      '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca V2',
      'MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky': 'Mercurial',
      'SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ': 'Saber',
      'EewxydAPCCVuNEyrVN68PuSYdQ7wKn27V9Gjeoi8dy3S': 'Lifinity',
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': 'Raydium CLMM',
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
      [multisig.PROGRAM_ID.toBase58()]: 'Squads Multisig V4',
    };
    
    // Check IDL manager for name
    const idlEntry = idlManager.getIdl(programId);
    if (idlEntry) {
      return idlEntry.name;
    }
    
    return knownPrograms[programId] || 'Unknown Program';
  }
  
  /**
   * Format instruction name from snake_case to Title Case
   */
  private formatInstructionName(name: string): string {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  /**
   * Get account name for system instructions
   */
  private getSystemAccountName(instructionType: number, index: number): string {
    switch (instructionType) {
      case 0: // CreateAccount
        return ['Funding Account', 'New Account'][index] || `Account ${index}`;
      case 2: // Transfer
        return ['From', 'To'][index] || `Account ${index}`;
      default:
        return `Account ${index}`;
    }
  }
  
  /**
   * Get account name for token instructions
   */
  private getTokenAccountName(instructionType: number, index: number): string {
    switch (instructionType) {
      case 3: // Transfer
        return ['Source', 'Destination', 'Authority'][index] || `Account ${index}`;
      case 7: // MintTo
        return ['Mint', 'Destination', 'Authority'][index] || `Account ${index}`;
      case 8: // Burn
        return ['Account', 'Mint', 'Authority'][index] || `Account ${index}`;
      default:
        return `Account ${index}`;
    }
  }
  
  /**
   * Parse Memo program instructions
   */
  private parseMemoInstruction(
    programId: string,
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    // Memo program just stores UTF-8 text
    let memoText = '';
    try {
      memoText = data.toString('utf8');
    } catch {
      memoText = data.toString('hex');
    }
    
    return {
      programId,
      programName: 'Memo Program',
      instructionName: 'Memo',
      accounts: accountKeys.map((key, i) => ({
        name: `Signer ${i + 1}`,
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args: {
        memo: memoText,
        hexData: data.toString('hex')
      }
    };
  }
  
  /**
   * Parse Compute Budget program instructions
   */
  private parseComputeBudgetInstruction(
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const instructionType = data[0];
    let instructionName = 'Unknown Compute Budget Instruction';
    let args: any = {};
    
    switch (instructionType) {
      case 0: // RequestUnits (deprecated)
        instructionName = 'Request Units (Deprecated)';
        if (data.length >= 9) {
          args = {
            units: data.readUInt32LE(1),
            additionalFee: data.readUInt32LE(5),
          };
        }
        break;
      case 1: // RequestHeapFrame
        instructionName = 'Request Heap Frame';
        if (data.length >= 5) {
          args = {
            bytes: data.readUInt32LE(1),
          };
        }
        break;
      case 2: // SetComputeUnitLimit
        instructionName = 'Set Compute Unit Limit';
        if (data.length >= 5) {
          args = {
            units: data.readUInt32LE(1),
          };
        }
        break;
      case 3: // SetComputeUnitPrice
        instructionName = 'Set Compute Unit Price';
        if (data.length >= 9) {
          args = {
            microLamports: data.readBigUInt64LE(1).toString(),
          };
        }
        break;
    }
    
    return {
      programId: 'ComputeBudget111111111111111111111111111111',
      programName: 'Compute Budget Program',
      instructionName,
      accounts: accountKeys.map((key, i) => ({
        name: `Account ${i}`,
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args
    };
  }
  
  /**
   * Parse Associated Token program instructions
   */
  private parseAssociatedTokenInstruction(
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    // Associated Token Program typically has create or recover instructions
    let instructionName = 'Create Associated Token Account';
    const accountNames = [
      'Funding Account',
      'Associated Token Account',
      'Wallet',
      'Token Mint',
      'System Program',
      'Token Program',
    ];
    
    // Check for idempotent instruction (has additional byte)
    if (data.length > 0) {
      instructionName = 'Create Idempotent';
    }
    
    return {
      programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
      programName: 'Associated Token Program',
      instructionName,
      accounts: accountKeys.map((key, i) => ({
        name: accountNames[i] || `Account ${i}`,
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args: {}
    };
  }
  
  /**
   * Parse Address Lookup Table program instructions
   */
  private parseAddressLookupTableInstruction(
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const instructionType = data.readUInt32LE(0);
    let instructionName = 'Unknown Lookup Table Instruction';
    let args: any = {};
    
    switch (instructionType) {
      case 0: // CreateLookupTable
        instructionName = 'Create Lookup Table';
        if (data.length >= 12) {
          args = {
            recentSlot: data.readBigUInt64LE(4).toString(),
            bumpSeed: data[12],
          };
        }
        break;
      case 1: // FreezeLookupTable
        instructionName = 'Freeze Lookup Table';
        break;
      case 2: // ExtendLookupTable
        instructionName = 'Extend Lookup Table';
        // The addresses are in remaining bytes
        args = {
          numberOfAddresses: Math.floor((data.length - 4) / 32),
        };
        break;
      case 3: // DeactivateLookupTable
        instructionName = 'Deactivate Lookup Table';
        break;
      case 4: // CloseLookupTable
        instructionName = 'Close Lookup Table';
        break;
    }
    
    return {
      programId: 'AddressLookupTab1e1111111111111111111111111',
      programName: 'Address Lookup Table Program',
      instructionName,
      accounts: accountKeys.map((key, i) => ({
        name: this.getAddressLookupTableAccountName(instructionType, i),
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args
    };
  }
  
  /**
   * Get account name for address lookup table instructions
   */
  private getAddressLookupTableAccountName(instructionType: number, index: number): string {
    switch (instructionType) {
      case 0: // CreateLookupTable
        return ['Lookup Table', 'Authority', 'Payer', 'System Program'][index] || `Account ${index}`;
      case 1: // FreezeLookupTable
        return ['Lookup Table', 'Authority'][index] || `Account ${index}`;
      case 2: // ExtendLookupTable
        return ['Lookup Table', 'Authority', 'Payer', 'System Program'][index] || `Account ${index}`;
      case 3: // DeactivateLookupTable
        return ['Lookup Table', 'Authority'][index] || `Account ${index}`;
      case 4: // CloseLookupTable
        return ['Lookup Table', 'Authority', 'Recipient'][index] || `Account ${index}`;
      default:
        return `Account ${index}`;
    }
  }
}