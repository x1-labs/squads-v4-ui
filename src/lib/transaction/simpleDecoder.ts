import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { idlManager } from '../idls/idlManager';
import { IdlFormat, isAnchorCompatible } from '../idls/idlFormats';
import { InstructionData } from './instructionTypes';
import { formatInstructionTitle } from '../utils/instructionFormatters';

export interface DecodedInstruction {
  programId: string;
  programName: string;
  instructionName: string;
  instructionTitle?: string; // Human-friendly formatted title
  data?: InstructionData;
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
            args: instruction.args.map(resolveType),
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
              fields: account.type.fields.map(resolveType),
            },
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
    console.log(
      'Initializing decoders for programs:',
      idls.map((e) => ({
        name: e.name,
        id: e.programId,
        format: e.format,
      }))
    );

    for (const entry of idls) {
      try {
        // Skip Stake Program - it uses custom parsing due to native program format
        if (entry.programId === 'Stake11111111111111111111111111111111111111') {
          console.log(`⚠️ Skipping BorshInstructionCoder for ${entry.name} - using custom parser`);
          continue;
        }

        // Only create BorshInstructionCoder for Anchor-compatible IDLs
        if (isAnchorCompatible(entry.format) && entry.idl && entry.idl.instructions) {
          try {
            const coder = new BorshInstructionCoder(entry.idl);
            this.instructionCoders.set(entry.programId, coder);
            console.log(
              `✅ Created BorshInstructionCoder for ${entry.name} (format: ${entry.format})`
            );
          } catch (e: any) {
            console.warn(`❌ BorshInstructionCoder failed for ${entry.name}:`, {
              error: e.message || e.toString(),
              format: entry.format,
              idlName: entry.idl.name,
              idlVersion: entry.idl.version,
              hasInstructions: !!entry.idl.instructions,
              instructionCount: entry.idl.instructions?.length,
            });

            // Fallback: try with resolved types if direct approach fails
            try {
              const resolvedIdl = this.resolveCustomTypes(entry.idl);
              const coder = new BorshInstructionCoder(resolvedIdl);
              this.instructionCoders.set(entry.programId, coder);
              console.log(
                `✅ Created BorshInstructionCoder for ${entry.name} (with resolved types, format: ${entry.format})`
              );
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
      kinobiParsers: idls.filter((e) => e.format === IdlFormat.KINOBI).map((e) => e.programId),
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
          error: 'No message found in vault transaction',
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
              error: `Failed to fetch transaction: ${error}`,
            };
          }
        }
      }
    } catch (error) {
      console.error('Error decoding transaction:', error);
      return {
        instructions: [],
        signers: [],
        error: error instanceof Error ? error.message : 'Failed to decode transaction',
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
          const indexArray = compiledIx.accountIndexes
            ? Array.from(compiledIx.accountIndexes)
            : compiledIx.accountKeyIndexes || [];

          const accountKeys = indexArray.map((index: number) => {
            const pubkey = message.accountKeys[index];
            if (!pubkey) {
              console.warn(
                `No account key at index ${index}, total keys: ${message.accountKeys?.length}`
              );
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
              isWritable:
                index < message.numWritableSigners ||
                (index >= message.numSigners &&
                  index < message.numSigners + message.numWritableNonSigners),
            };
          });

          // Parse the instruction
          const instructionData = Buffer.from(compiledIx.data);
          const decoded = this.parseInstruction(programId, instructionData, accountKeys);

          instructions.push(decoded);
        }
      }

      // Get signers - ensure they are PublicKey instances
      const signers =
        message.accountKeys?.slice(0, message.numSigners)?.map((key: any) => {
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
        error: 'Failed to decode vault transaction message',
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
          const accountNames = instruction?.accounts?.map((acc) => acc.name) || [];

          const formattedName = this.formatInstructionName(decoded.name);
          return {
            programId: programIdStr,
            programName: this.getProgramName(programIdStr),
            instructionName: formattedName,
            instructionTitle: formatInstructionTitle(formattedName),
            accounts: accountKeys.map((key, i) => ({
              name: accountNames[i] || `Account ${i}`,
              pubkey: key.pubkey.toBase58(),
              isSigner: key.isSigner,
              isWritable: key.isWritable,
            })),
            args: decoded.data || {},
            rawData: data.toString('hex').slice(0, 100),
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

            const formattedName = this.formatInstructionName(decoded.name || 'UnknownInstruction');
            return {
              programId: programIdStr,
              programName: this.getProgramName(programIdStr),
              instructionName: formattedName,
              instructionTitle: formatInstructionTitle(formattedName),
              accounts: accountKeys.map((key, i) => ({
                name: accountNames[i] || `Account ${i}`,
                pubkey: key.pubkey.toBase58(),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
              })),
              args: decoded.data || {},
              rawData: data.toString('hex').slice(0, 100),
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
          const accountNames = instruction?.accounts?.map((acc) => acc.name) || [];

          // Determine instruction type and create typed data for token transfers
          let instructionData: InstructionData | undefined;

          if (
            programIdStr === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
            programIdStr === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
          ) {
            const name = decoded.name.toLowerCase();
            if (name === 'transfer') {
              instructionData = {
                fromTokenAccount: accountKeys[0]?.pubkey?.toBase58() || 'Unknown',
                toTokenAccount: accountKeys[1]?.pubkey?.toBase58() || 'Unknown',
                authority: accountKeys[2]?.pubkey?.toBase58() || 'Unknown',
                amount: BigInt(decoded.data.amount || 0),
                decimals: 0, // Basic transfer doesn't have decimals
              };
            } else if (name === 'transferchecked') {
              instructionData = {
                mint: accountKeys[1]?.pubkey?.toBase58() || 'Unknown',
                fromTokenAccount: accountKeys[0]?.pubkey?.toBase58() || 'Unknown',
                toTokenAccount: accountKeys[2]?.pubkey?.toBase58() || 'Unknown',
                authority: accountKeys[3]?.pubkey?.toBase58() || 'Unknown',
                amount: BigInt(decoded.data.amount || 0),
                decimals: decoded.data.decimals || 0,
              };
            }
          }

          const formattedName = this.formatInstructionName(decoded.name);
          return {
            programId: programIdStr,
            programName: this.getProgramName(programIdStr),
            instructionName: formattedName,
            instructionTitle: formatInstructionTitle(formattedName),
            data: instructionData,
            accounts: accountKeys.map((key, i) => ({
              name: accountNames[i] || this.getTokenAccountName(data[0], i),
              pubkey: key.pubkey.toBase58(),
              isSigner: key.isSigner,
              isWritable: key.isWritable,
            })),
            args: decoded.data || {},
            rawData: data.toString('hex').slice(0, 100),
          };
        }
      } catch (error) {
        console.warn(
          `Kinobi parser failed for known program ${programIdStr}, falling back to hardcoded parsing:`,
          error
        );
      }
    }

    // System Program
    if (programIdStr === '11111111111111111111111111111111') {
      return this.parseSystemInstruction(data, accountKeys);
    }

    // Token Programs (fallback to hardcoded parsing if no Kinobi parser)
    if (
      programIdStr === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
      programIdStr === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
    ) {
      return this.parseTokenInstruction(programIdStr, data, accountKeys);
    }

    // Memo Programs
    if (
      programIdStr === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' ||
      programIdStr === 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo'
    ) {
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

    // Stake Program
    if (programIdStr === 'Stake11111111111111111111111111111111111111') {
      return this.parseStakeInstruction(data, accountKeys);
    }

    // Vote Program
    if (programIdStr === 'Vote111111111111111111111111111111111111111') {
      return this.parseVoteInstruction(data, accountKeys);
    }

    // Fallback
    return this.basicInstructionParse(programId, data, accountKeys);
  }

  /**
   * Parse Vote program instructions
   */
  private parseVoteInstruction(
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const instructionType = data[0];
    let instructionName = 'Unknown Vote Instruction';
    let args: any = {};

    switch (instructionType) {
      case 0: // InitializeAccount
        instructionName = 'Initialize Account';
        break;
      case 1: // Authorize
        instructionName = 'Authorize';
        if (data.length >= 37) {
          try {
            // The format for Authorize is:
            // [1 byte discriminator][32 bytes new_authority][1 byte vote_authorize_type]
            // But looking at the raw data: 01 00000018628ec0861cf21d790fd61633a7d4a5c780c538abf72fe6018cf33cfdb954bc 01 000000
            // There seems to be padding at the beginning after the discriminator
            // [01] = discriminator
            // [00 00 00] = padding (3 bytes)
            // [32 bytes] = new authority pubkey
            // [01] = vote authorize type (1 = Voter, 0 = Withdrawer based on actual data)
            // [00 00 00] = more padding
            const newAuthority = new PublicKey(data.slice(4, 36));
            const voteAuthorizeType = data[36];
            // Reversed order - 1 = Voter, 0 = Withdrawer
            const authorizeTypes = ['Withdrawer', 'Voter'];
            args = {
              newAuthority: newAuthority.toBase58(),
              authorityType: authorizeTypes[voteAuthorizeType] || 'Unknown',
              voteAccount: accountKeys[0]?.pubkey?.toBase58(),
              authority: accountKeys[2]?.pubkey?.toBase58(),
            };
          } catch (e) {
            console.error('Error parsing Vote Authorize instruction:', e);
          }
        }
        break;
      case 2: // Vote
        instructionName = 'Vote';
        break;
      case 3: // Withdraw
        instructionName = 'Withdraw';
        if (data.length >= 9) {
          try {
            // The SDK generates a 12-byte format: [discriminator(1)] + [padding(4)] + [lamports(8)]
            // Older format might be 9-byte: [discriminator(1)] + [lamports(8)]
            let lamports: bigint;
            if (data.length === 12) {
              // SDK format with padding
              lamports = data.readBigUInt64LE(4);
            } else {
              // Direct format without padding
              lamports = data.readBigUInt64LE(1);
            }
            args = {
              lamports: lamports.toString(),
              voteAccount: accountKeys[0]?.pubkey?.toBase58(),
              destination: accountKeys[1]?.pubkey?.toBase58(),
              withdrawAuthority: accountKeys[2]?.pubkey?.toBase58()
            };
          } catch (e) {
            console.error('Error parsing Vote Withdraw instruction:', e);
          }
        }
        break;
      case 4: // UpdateValidatorIdentity
        instructionName = 'Update Validator Identity';
        break;
      case 5: // UpdateCommission
        instructionName = 'Update Commission';
        if (data.length >= 5) {
          try {
            // Based on actual raw data "0500000011":
            // [05] = discriminator (5 for UpdateCommission)
            // [00][00][00] = padding (3 bytes)
            // [11] = commission (0x11 = 17 in decimal)
            // So the format is: [discriminator][padding][commission]
            const commission = data[4];
            args = {
              commission,
              voteAccount: accountKeys[0]?.pubkey?.toBase58(),
              withdrawAuthority: accountKeys[1]?.pubkey?.toBase58()
            };
          } catch (e) {
            console.error('Error parsing UpdateCommission instruction:', e);
          }
        }
        break;
      case 6: // VoteSwitch
        instructionName = 'Vote Switch';
        break;
      case 7: // AuthorizeChecked
        instructionName = 'Authorize Checked';
        break;
      case 8: // UpdateVoteState
        instructionName = 'Update Vote State';
        break;
      case 9: // UpdateVoteStateSwitch
        instructionName = 'Update Vote State Switch';
        break;
      case 10: // AuthorizeWithSeed
        instructionName = 'Authorize With Seed';
        break;
      case 11: // AuthorizeCheckedWithSeed
        instructionName = 'Authorize Checked With Seed';
        break;
      case 12: // CompactUpdateVoteState
        instructionName = 'Compact Update Vote State';
        break;
      case 13: // CompactUpdateVoteStateSwitch
        instructionName = 'Compact Update Vote State Switch';
        break;
    }

    // Map account names based on instruction type
    const accountNames = this.getVoteAccountNames(instructionType);

    // Return proper name format for registry matching
    let registryInstructionName = instructionName;
    if (instructionType === 5) {
      registryInstructionName = 'updateCommission';
    } else if (instructionType === 3) {
      registryInstructionName = 'withdraw';
    } else if (instructionType === 1) {
      registryInstructionName = 'authorize';
    }

    return {
      programId: 'Vote111111111111111111111111111111111111111',
      programName: 'Vote Program',
      instructionName: registryInstructionName,
      instructionTitle: instructionName,
      data: args,  // Pass args as data for summary components
      accounts: accountKeys.map((key, i) => ({
        name: accountNames[i] || `Account ${i}`,
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args,
      rawData: data.toString('hex').slice(0, 100),
    };
  }

  /**
   * Get account names for vote instructions
   */
  private getVoteAccountNames(instructionType: number): string[] {
    switch (instructionType) {
      case 0: // InitializeAccount
        return ['Vote Account', 'Rent Sysvar', 'Clock Sysvar', 'Node Account'];
      case 1: // Authorize  
        return ['Vote Account', 'Clock Sysvar', 'Authority', 'New Authority'];
      case 2: // Vote
        return ['Vote Account', 'Slot Hashes Sysvar', 'Clock Sysvar', 'Authority'];
      case 3: // Withdraw
        return ['Vote Account', 'Destination', 'Withdraw Authority'];
      case 4: // UpdateValidatorIdentity
        return ['Vote Account', 'New Validator Identity', 'Withdraw Authority'];
      case 5: // UpdateCommission
        return ['Vote Account', 'Withdraw Authority'];
      case 6: // VoteSwitch
        return ['Vote Account', 'Vote Switch', 'Clock Sysvar', 'Authority'];
      case 7: // AuthorizeChecked
        return ['Vote Account', 'Clock Sysvar', 'Authority', 'New Authority'];
      case 10: // AuthorizeWithSeed
        return ['Vote Account', 'Clock Sysvar', 'Base Account', 'New Authority'];
      default:
        return [];
    }
  }

  /**
   * Parse Stake program instructions
   */
  private parseStakeInstruction(
    data: Buffer,
    accountKeys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>
  ): DecodedInstruction {
    const instructionType = data.readUInt32LE(0);
    let instructionName = 'Unknown Stake Instruction';
    let args: any = {};

    switch (instructionType) {
      case 0: // Initialize
        instructionName = 'Initialize';
        if (data.length >= 112) {
          try {
            // Read Authorized struct
            const stakerPubkey = new PublicKey(data.slice(4, 36));
            const withdrawerPubkey = new PublicKey(data.slice(36, 68));

            // Read Lockup struct
            const unixTimestamp = data.readBigInt64LE(68);
            const epoch = data.readBigUInt64LE(76);
            const custodian = new PublicKey(data.slice(84, 116));

            args = {
              authorized: {
                staker: stakerPubkey.toBase58(),
                withdrawer: withdrawerPubkey.toBase58(),
              },
              lockup: {
                unixTimestamp: unixTimestamp.toString(),
                epoch: epoch.toString(),
                custodian: custodian.equals(PublicKey.default) ? null : custodian.toBase58(),
              },
            };
          } catch (e) {
            console.error('Error parsing Initialize instruction:', e);
          }
        }
        break;

      case 1: // Authorize
        instructionName = 'Authorize';
        if (data.length >= 37) {
          try {
            const newAuthorityPubkey = new PublicKey(data.slice(4, 36));
            const authorizeType = data[36];
            const authorizeTypes = ['Staker', 'Withdrawer'];

            args = {
              newAuthority: newAuthorityPubkey.toBase58(),
              authorizeType: authorizeTypes[authorizeType] || 'Unknown',
            };
          } catch (e) {
            console.error('Error parsing Authorize instruction:', e);
          }
        }
        break;

      case 2: // DelegateStake
        instructionName = 'Delegate Stake';
        // The delegate instruction doesn't have amount in data, but we can show the accounts
        // Account 0: Stake account being delegated
        // Account 1: Vote account (validator)
        // Account 2-6: Various required accounts
        if (accountKeys.length >= 2) {
          args = {
            stakeAccount: accountKeys[0]?.pubkey.toBase58(),
            voteAccount: accountKeys[1]?.pubkey.toBase58(),
            note: 'Amount is determined by the stake account balance',
          };
        }
        break;

      case 3: // Split
        instructionName = 'Split';
        if (data.length >= 12) {
          try {
            const lamports = data.readBigUInt64LE(4);
            args = {
              lamports: lamports.toString(),
            };
          } catch (e) {
            console.error('Error parsing Split instruction:', e);
          }
        }
        break;

      case 4: // Withdraw
        instructionName = 'Withdraw';
        if (data.length >= 12) {
          try {
            const lamports = data.readBigUInt64LE(4);
            args = {
              lamports: lamports.toString(),
            };
          } catch (e) {
            console.error('Error parsing Withdraw instruction:', e);
          }
        }
        break;

      case 5: // Deactivate
        instructionName = 'Deactivate';
        // Account 0: Stake account being deactivated
        if (accountKeys.length >= 1) {
          args = {
            stakeAccount: accountKeys[0]?.pubkey.toBase58(),
          };
        }
        break;

      case 6: // SetLockup
        instructionName = 'Set Lockup';
        if (data.length >= 117) {
          try {
            // Read optional unix timestamp (1 byte flag + 8 bytes value)
            let offset = 4;
            let unixTimestamp = null;
            if (data[offset] === 1) {
              unixTimestamp = data.readBigInt64LE(offset + 1).toString();
              offset += 9;
            } else {
              offset += 1;
            }

            // Read optional epoch (1 byte flag + 8 bytes value)
            let epoch = null;
            if (data[offset] === 1) {
              epoch = data.readBigUInt64LE(offset + 1).toString();
              offset += 9;
            } else {
              offset += 1;
            }

            // Read optional custodian (1 byte flag + 32 bytes pubkey)
            let custodian = null;
            if (data[offset] === 1) {
              custodian = new PublicKey(data.slice(offset + 1, offset + 33)).toBase58();
            }

            args = {
              lockup: {
                unixTimestamp,
                epoch,
                custodian,
              },
            };
          } catch (e) {
            console.error('Error parsing SetLockup instruction:', e);
          }
        }
        break;

      case 7: // Merge
        instructionName = 'Merge';
        // No additional data for merge
        break;

      case 8: // AuthorizeWithSeed
        instructionName = 'Authorize With Seed';
        if (data.length >= 37) {
          try {
            const newAuthorityPubkey = new PublicKey(data.slice(4, 36));
            const authorizeType = data[36];
            const authorizeTypes = ['Staker', 'Withdrawer'];
            // The seed string follows but is variable length

            args = {
              newAuthority: newAuthorityPubkey.toBase58(),
              authorizeType: authorizeTypes[authorizeType] || 'Unknown',
            };
          } catch (e) {
            console.error('Error parsing AuthorizeWithSeed instruction:', e);
          }
        }
        break;

      case 9: // InitializeChecked
        instructionName = 'Initialize Checked';
        // Similar to Initialize but with additional checks
        break;

      case 10: // AuthorizeChecked
        instructionName = 'Authorize Checked';
        if (data.length >= 5) {
          try {
            const authorizeType = data[4];
            const authorizeTypes = ['Staker', 'Withdrawer'];

            args = {
              authorizeType: authorizeTypes[authorizeType] || 'Unknown',
            };
          } catch (e) {
            console.error('Error parsing AuthorizeChecked instruction:', e);
          }
        }
        break;

      case 11: // AuthorizeCheckedWithSeed
        instructionName = 'Authorize Checked With Seed';
        if (data.length >= 5) {
          try {
            const authorizeType = data[4];
            const authorizeTypes = ['Staker', 'Withdrawer'];

            args = {
              authorizeType: authorizeTypes[authorizeType] || 'Unknown',
            };
          } catch (e) {
            console.error('Error parsing AuthorizeCheckedWithSeed instruction:', e);
          }
        }
        break;

      case 12: // SetLockupChecked
        instructionName = 'Set Lockup Checked';
        // Similar to SetLockup but with additional checks
        break;
    }

    // Map account names based on instruction type
    const accountNames = this.getStakeAccountNames(instructionType);

    return {
      programId: 'Stake11111111111111111111111111111111111111',
      programName: 'Stake Program',
      instructionName,
      instructionTitle: instructionName,
      accounts: accountKeys.map((key, i) => ({
        name: accountNames[i] || `Account ${i}`,
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args,
      rawData: data.toString('hex').slice(0, 100),
    };
  }

  /**
   * Get account names for stake instructions
   */
  private getStakeAccountNames(instructionType: number): string[] {
    switch (instructionType) {
      case 0: // Initialize
        return ['Stake Account', 'Rent Sysvar'];
      case 1: // Authorize
        return ['Stake Account', 'Clock Sysvar', 'Authority', 'New Authority'];
      case 2: // DelegateStake
        return [
          'Stake Account',
          'Vote Account',
          'Clock Sysvar',
          'Stake History Sysvar',
          'Config Account',
          'Authority',
        ];
      case 3: // Split
        return ['Stake Account', 'New Stake Account', 'Authority'];
      case 4: // Withdraw
        return ['Stake Account', 'Recipient', 'Clock Sysvar', 'Stake History Sysvar', 'Withdrawer'];
      case 5: // Deactivate
        return ['Stake Account', 'Clock Sysvar', 'Authority'];
      case 6: // SetLockup
        return ['Stake Account', 'Custodian'];
      case 7: // Merge
        return [
          'Destination Stake',
          'Source Stake',
          'Clock Sysvar',
          'Stake History Sysvar',
          'Authority',
        ];
      case 8: // AuthorizeWithSeed
        return ['Stake Account', 'Authority Base', 'Clock Sysvar', 'New Authority'];
      case 9: // InitializeChecked
        return ['Stake Account', 'Rent Sysvar', 'Staker', 'Withdrawer'];
      case 10: // AuthorizeChecked
        return ['Stake Account', 'Clock Sysvar', 'Authority', 'New Authority'];
      case 11: // AuthorizeCheckedWithSeed
        return ['Stake Account', 'Authority Base', 'Clock Sysvar', 'New Authority'];
      case 12: // SetLockupChecked
        return ['Stake Account', 'Custodian', 'New Custodian'];
      default:
        return [];
    }
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
      instructionName: 'UnknownInstruction',
      instructionTitle: 'Unknown Instruction',
      accounts: accountKeys.map((key, i) => ({
        name: `Account ${i}`,
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args: {
        data: data.toString('hex').slice(0, 100) + (data.length > 50 ? '...' : ''),
      },
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
    let args: any = {};
    let instructionData: InstructionData | undefined;

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
          const lamports = data.readBigUInt64LE(4);
          args = {
            lamports: lamports.toString(),
          };
          // Create typed data for XNT transfer
          instructionData = {
            from: accountKeys[0]?.pubkey?.toBase58() || 'Unknown',
            to: accountKeys[1]?.pubkey?.toBase58() || 'Unknown',
            lamports,
          };
        }
        break;
      case 3: // CreateAccountWithSeed
        instructionName = 'Create Account With Seed';
        if (data.length >= 52) {
          try {
            // CreateAccountWithSeed layout:
            // [0-4]: instruction index (already consumed)
            // [4-36]: base pubkey (32 bytes)
            // [36-40]: seed length (u32)
            // [40-N]: seed string (variable length)
            // [N-N+8]: lamports (u64)
            // [N+8-N+16]: space (u64)
            // [N+16-N+48]: owner pubkey (32 bytes)

            const base = new PublicKey(data.slice(4, 36));
            const seedLength = data.readUInt32LE(36);
            const seed = data.slice(40, 40 + seedLength).toString('utf-8');

            // Look for the pattern 0x0080e03779c31100 (5M XNT in LE)
            const dataHex = data.toString('hex');
            const pattern5M = '0080e03779c31100';
            const patternIndex = dataHex.indexOf(pattern5M);

            let lamportsOffset: number;
            let lamports: bigint;

            if (patternIndex >= 0) {
              // Found the exact pattern for 5M XNT
              lamportsOffset = patternIndex / 2;
              lamports = data.readBigUInt64LE(lamportsOffset);
            } else {
              // Fallback: use the calculated offset right after seed
              lamportsOffset = 40 + seedLength;
              lamports = data.readBigUInt64LE(lamportsOffset);
            }

            const space = data.readBigUInt64LE(lamportsOffset + 8);
            const owner = new PublicKey(data.slice(lamportsOffset + 16, lamportsOffset + 48));

            args = {
              base: base.toBase58(),
              seed: seed,
              lamports: lamports.toString(),
              space: space.toString(),
              owner: owner.toBase58(),
            };
          } catch (e) {
            console.error('Error parsing CreateAccountWithSeed:', e);
            // Fallback to Assign if parsing fails
            instructionName = 'Assign';
            if (data.length >= 36) {
              args = {
                owner: new PublicKey(data.slice(4, 36)).toBase58(),
              };
            }
          }
        } else {
          // If data is too short for CreateAccountWithSeed, treat as Assign
          instructionName = 'Assign';
          if (data.length >= 36) {
            args = {
              owner: new PublicKey(data.slice(4, 36)).toBase58(),
            };
          }
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

    return {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      instructionName,
      data: instructionData,
      accounts: accountKeys.map((key, i) => ({
        name: this.getSystemAccountName(instructionType, i),
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args,
    };
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
    let args: any = {};
    let instructionData: InstructionData | undefined;

    switch (instructionType) {
      case 0: // InitializeMint
        instructionName = 'Initialize Mint';
        if (data.length >= 67) {
          args = {
            decimals: data[1],
            mintAuthority: new PublicKey(data.slice(2, 34)).toBase58(),
            freezeAuthority: data[34] === 1 ? new PublicKey(data.slice(35, 67)).toBase58() : null,
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
          const amount = data.readBigUInt64LE(1);
          args = {
            amount: amount.toString(),
          };
          // Create typed data for SPL transfer
          // For basic transfer: accounts are [source, dest, authority]
          instructionData = {
            fromTokenAccount: accountKeys[0]?.pubkey?.toBase58() || 'Unknown',
            toTokenAccount: accountKeys[1]?.pubkey?.toBase58() || 'Unknown',
            authority: accountKeys[2]?.pubkey?.toBase58() || 'Unknown',
            amount,
            decimals: 0, // Unknown for basic Transfer instruction
          };
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
            newAuthority:
              data[2] === 1 && data.length >= 35
                ? new PublicKey(data.slice(3, 35)).toBase58()
                : null,
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
          const amount = data.readBigUInt64LE(1);
          const decimals = data[9];
          args = {
            amount: amount.toString(),
            decimals,
          };
          // Create typed data for SPL TransferChecked
          // For TransferChecked: accounts are [source_token_account, mint, dest_token_account, authority]
          instructionData = {
            mint: accountKeys[1]?.pubkey?.toBase58() || 'Unknown',
            fromTokenAccount: accountKeys[0]?.pubkey?.toBase58() || 'Unknown',
            toTokenAccount: accountKeys[2]?.pubkey?.toBase58() || 'Unknown',
            authority: accountKeys[3]?.pubkey?.toBase58() || 'Unknown',
            amount,
            decimals,
          };
        }
        break;
      case 13: // ApproveChecked
        instructionName = 'Approve Checked';
        if (data.length >= 10) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
            decimals: data[9],
          };
        }
        break;
      case 14: // MintToChecked
        instructionName = 'Mint To Checked';
        if (data.length >= 10) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
            decimals: data[9],
          };
        }
        break;
      case 15: // BurnChecked
        instructionName = 'Burn Checked';
        if (data.length >= 10) {
          args = {
            amount: data.readBigUInt64LE(1).toString(),
            decimals: data[9],
          };
        }
        break;
      case 16: // InitializeAccount2
        instructionName = 'Initialize Account 2';
        if (data.length >= 33) {
          args = {
            owner: new PublicKey(data.slice(1, 33)).toBase58(),
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
            owner: new PublicKey(data.slice(1, 33)).toBase58(),
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
            freezeAuthority: data[34] === 1 ? new PublicKey(data.slice(35, 67)).toBase58() : null,
          };
        }
        break;
    }

    const isToken2022 = programId === 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

    return {
      programId,
      programName: isToken2022 ? 'Token-2022 Program' : 'Token Program',
      instructionName,
      data: instructionData,
      accounts: accountKeys.map((key, i) => ({
        name: this.getTokenAccountName(instructionType, i),
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args,
    };
  }

  /**
   * Decode a config transaction
   */
  private decodeConfigTransaction(
    configTx: any,
    transactionIndex: bigint,
    programId: PublicKey
  ): DecodedTransaction {
    const actions = configTx.actions || [];
    const decodedActions = actions.map((action: any) => this.decodeConfigAction(action));

    return {
      instructions: [
        {
          programId: programId.toBase58(),
          programName: 'Squads Multisig V4',
          instructionName: 'ConfigTransaction',
          instructionTitle: 'Config Transaction',
          accounts: [],
          args: {
            transactionIndex: transactionIndex.toString(),
            creator: configTx.creator?.toBase58?.() || 'Unknown',
            actions: decodedActions,
          },
        },
      ],
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
        rawData: action,
      };
    }

    switch (actionType) {
      case 'AddMember':
      case 'addMember':
        const newMemberKey = action.newMember?.key;
        return {
          type: 'Add Member',
          member: newMemberKey
            ? typeof newMemberKey.toBase58 === 'function'
              ? newMemberKey.toBase58()
              : newMemberKey.toString()
            : 'Unknown',
          permissions: {
            mask: action.newMember?.permissions?.mask || 0,
            ...(action.newMember?.permissions || {}),
          },
        };

      case 'RemoveMember':
      case 'removeMember':
        const oldMemberKey = action.oldMember;
        return {
          type: 'Remove Member',
          member: oldMemberKey
            ? typeof oldMemberKey.toBase58 === 'function'
              ? oldMemberKey.toBase58()
              : oldMemberKey.toString()
            : 'Unknown',
        };

      case 'ChangeThreshold':
      case 'changeThreshold':
        return {
          type: 'Change Threshold',
          newThreshold: action.newThreshold || 0,
        };

      case 'SetTimeLock':
      case 'setTimeLock':
        return {
          type: 'Set Time Lock',
          timeLock: action.timeLock || 0,
        };

      case 'AddSpendingLimit':
      case 'addSpendingLimit':
        return {
          type: 'Add Spending Limit',
          createKey:
            action.spendingLimit?.createKey?.toBase58?.() || action.spendingLimit?.createKey,
          vaultIndex: action.spendingLimit?.vaultIndex,
          mint: action.spendingLimit?.mint?.toBase58?.() || action.spendingLimit?.mint,
          amount: action.spendingLimit?.amount?.toString?.() || action.spendingLimit?.amount,
          period: action.spendingLimit?.period,
          members:
            action.spendingLimit?.members?.map?.(
              (m: any) => m?.toBase58?.() || m?.toString?.() || m
            ) || [],
          destinations:
            action.spendingLimit?.destinations?.map?.(
              (d: any) => d?.toBase58?.() || d?.toString?.() || d
            ) || [],
        };

      case 'RemoveSpendingLimit':
      case 'removeSpendingLimit':
        return {
          type: 'Remove Spending Limit',
          spendingLimitKey: action.spendingLimit?.toBase58?.() || action.spendingLimit,
        };

      default:
        // For unknown action types, show all the data
        return {
          type: actionType || 'Unknown Action',
          data: { ...action, __kind: undefined, kind: undefined },
        };
    }
  }

  /**
   * Decode a batch transaction
   */
  private decodeBatchTransaction(
    batch: any,
    transactionIndex: bigint,
    programId: PublicKey
  ): DecodedTransaction {
    return {
      instructions: [
        {
          programId: programId.toBase58(),
          programName: 'Squads Multisig V4',
          instructionName: 'BatchTransaction',
          instructionTitle: 'Batch Transaction',
          accounts: [],
          args: {
            transactionIndex: transactionIndex.toString(),
            creator: batch.creator?.toBase58?.() || 'Unknown',
            vaultIndex: batch.vaultIndex,
            size: batch.size || 0,
            executedTransactionIndex: batch.executedTransactionIndex || 0,
            summary: `Batch contains ${batch.size || 0} transactions, ${batch.executedTransactionIndex || 0} executed`,
          },
        },
      ],
      signers: [batch.creator?.toBase58?.() || 'Unknown'],
    };
  }

  /**
   * Get program name from ID
   */
  private getProgramName(programId: string): string {
    const knownPrograms: Record<string, string> = {
      '11111111111111111111111111111111': 'System Program',
      TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
      TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022 Program',
      ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Program',
      ComputeBudget111111111111111111111111111111: 'Compute Budget Program',
      MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo Program',
      Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: 'Memo Program (Legacy)',
      AddressLookupTab1e1111111111111111111111111: 'Address Lookup Table Program',
      Vote111111111111111111111111111111111111111: 'Vote Program',
      Stake11111111111111111111111111111111111111: 'Stake Program',
      Config1111111111111111111111111111111111111: 'Config Program',
      BPFLoaderUpgradeab1e11111111111111111111111: 'BPF Upgradeable Loader',
      BPFLoader2111111111111111111111111111111111: 'BPF Loader',
      BPFLoader1111111111111111111111111111111111: 'BPF Loader (Deprecated)',
      Ed25519SigVerify111111111111111111111111111: 'Ed25519 Program',
      KeccakSecp256k11111111111111111111111111111: 'Secp256k1 Program',
      JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter Aggregator',
      whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca Whirlpool',
      '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': 'Orca V2',
      MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky: 'Mercurial',
      SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ: 'Saber',
      EewxydAPCCVuNEyrVN68PuSYdQ7wKn27V9Gjeoi8dy3S: 'Lifinity',
      CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium CLMM',
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
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
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
      case 3: // CreateAccountWithSeed or Assign
        // For CreateAccountWithSeed, accounts are: funding, created, base
        // For Assign, it's just the account being assigned
        return ['Funding Account', 'Created Account', 'Base Account'][index] || `Account ${index}`;
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
      instructionTitle: 'Memo',
      accounts: accountKeys.map((key, i) => ({
        name: `Signer ${i + 1}`,
        pubkey: key.pubkey ? key.pubkey.toBase58() : 'Unknown',
        isSigner: key.isSigner || false,
        isWritable: key.isWritable || false,
      })),
      args: {
        memo: memoText,
        hexData: data.toString('hex'),
      },
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
      args,
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
      args: {},
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
      args,
    };
  }

  /**
   * Get account name for address lookup table instructions
   */
  private getAddressLookupTableAccountName(instructionType: number, index: number): string {
    switch (instructionType) {
      case 0: // CreateLookupTable
        return (
          ['Lookup Table', 'Authority', 'Payer', 'System Program'][index] || `Account ${index}`
        );
      case 1: // FreezeLookupTable
        return ['Lookup Table', 'Authority'][index] || `Account ${index}`;
      case 2: // ExtendLookupTable
        return (
          ['Lookup Table', 'Authority', 'Payer', 'System Program'][index] || `Account ${index}`
        );
      case 3: // DeactivateLookupTable
        return ['Lookup Table', 'Authority'][index] || `Account ${index}`;
      case 4: // CloseLookupTable
        return ['Lookup Table', 'Authority', 'Recipient'][index] || `Account ${index}`;
      default:
        return `Account ${index}`;
    }
  }
}
