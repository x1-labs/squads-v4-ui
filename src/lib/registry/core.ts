import React from 'react';
import { PublicKey } from '@solana/web3.js';
import { TransactionTag, InstructionSummaryComponent } from '../instructions/types';
import { detectIdlFormat, IdlFormat } from '../idls/idlFormats';
import { KinobiIdlParser } from '../idls/kinobiParser';
import { DecodedInstruction } from '../transaction/simpleDecoder';

/**
 * Configuration for a single instruction
 */
export interface InstructionConfig {
  summary?: InstructionSummaryComponent;
  tags?: TransactionTag | TransactionTag[];
}

/**
 * Configuration for registering a program
 */
export interface ProgramConfig {
  // Program ID(s) - can be a single ID or multiple for related programs
  programId: string | string[];

  // Program name (optional)
  name?: string;

  // IDL (optional)
  idl?: any;

  // Instruction configurations (optional)
  instructions?: {
    [instructionName: string]: InstructionConfig;
  };

  // Default tags for all instructions (optional)
  defaultTags?: TransactionTag | TransactionTag[];
}

/**
 * Internal representation of a registered instruction
 */
interface RegisteredInstruction {
  summary?: InstructionSummaryComponent;
  tags?: TransactionTag[];
}

/**
 * Internal representation of a registered program
 */
interface RegisteredProgram {
  programIds: string[];
  name?: string;
  idl?: any;
  idlFormat?: IdlFormat;
  idlParser?: KinobiIdlParser;
  instructions: Map<string, RegisteredInstruction>;
  defaultTags?: TransactionTag[];
}

/**
 * Central registry for all program metadata
 */
class ProgramRegistry {
  private programs: Map<string, RegisteredProgram> = new Map();

  /**
   * Register a program with its metadata
   */
  register(config: ProgramConfig): void {
    const programIds = Array.isArray(config.programId) ? config.programId : [config.programId];

    // Create the registered program entry
    const program: RegisteredProgram = {
      programIds,
      name: config.name,
      idl: config.idl,
      instructions: new Map(),
      defaultTags: config.defaultTags
        ? Array.isArray(config.defaultTags)
          ? config.defaultTags
          : [config.defaultTags]
        : undefined,
    };

    // Process IDL if provided
    if (config.idl) {
      const formatInfo = detectIdlFormat(config.idl);
      program.idlFormat = formatInfo.format;

      if (formatInfo.format === IdlFormat.KINOBI) {
        program.idlParser = new KinobiIdlParser(config.idl);
      }
    }

    // Process instruction configurations
    if (config.instructions) {
      for (const [instructionName, instructionConfig] of Object.entries(config.instructions)) {
        program.instructions.set(instructionName.toLowerCase(), {
          ...instructionConfig,
          tags: instructionConfig.tags
            ? Array.isArray(instructionConfig.tags)
              ? instructionConfig.tags
              : [instructionConfig.tags]
            : undefined,
        });
      }
    }

    // Register for all program IDs
    for (const programId of programIds) {
      this.programs.set(programId, program);
      if (config.name) {
        console.log(`Registered program: ${config.name} (${programId})`);
      }
    }
  }

  /**
   * Get IDL for a program
   */
  getIdl(programId: string | PublicKey): any | undefined {
    const id = typeof programId === 'string' ? programId : programId.toBase58();
    const program = this.programs.get(id);
    return program?.idl;
  }

  /**
   * Get program name
   */
  getProgramName(programId: string | PublicKey): string | undefined {
    const id = typeof programId === 'string' ? programId : programId.toBase58();
    const program = this.programs.get(id);
    return program?.name;
  }

  /**
   * Get instruction summary component
   */
  getInstructionSummary(
    programId: string,
    instructionName: string
  ): InstructionSummaryComponent | undefined {
    const program = this.programs.get(programId);
    if (!program) return undefined;

    const instruction = program.instructions.get(instructionName.toLowerCase());
    return instruction?.summary;
  }

  /**
   * Get tags for an instruction
   */
  getInstructionTags(instruction: DecodedInstruction): TransactionTag[] {
    const program = this.programs.get(instruction.programId);
    if (!program) return [];

    const tags: TransactionTag[] = [];

    // Add default program tags
    if (program.defaultTags) {
      tags.push(...program.defaultTags);
    }

    // Add instruction-specific tags
    const instructionConfig = program.instructions.get(instruction.instructionName.toLowerCase());
    if (instructionConfig?.tags) {
      tags.push(...instructionConfig.tags);
    }

    return tags;
  }

  /**
   * Get all registered programs
   */
  getAllPrograms(): RegisteredProgram[] {
    // Deduplicate programs that share the same config
    const unique = new Map<RegisteredProgram, boolean>();
    for (const program of this.programs.values()) {
      unique.set(program, true);
    }
    return Array.from(unique.keys());
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.programs.clear();
  }
}

// Create and export the singleton instance
export const registry = new ProgramRegistry();

/**
 * Helper function to register a simple transfer program
 */
export function registerTransferProgram(
  programId: string | string[],
  name: string,
  tokenType: 'native' | 'spl',
  color: string = 'purple'
): void {
  const label = tokenType === 'native' ? 'XNT Transfer' : 'Token Transfer';

  registry.register({
    programId,
    name,
    instructions: {
      Transfer: {
        tags: { label, color, variant: 'subtle' },
      },
      TransferChecked: {
        tags: { label, color, variant: 'subtle' },
      },
    },
  });
}

/**
 * Helper function to register a DeFi program with common instructions
 */
export function registerDeFiProgram(
  programId: string | string[],
  name: string,
  protocol: string,
  color: string = 'blue'
): void {
  registry.register({
    programId,
    name,
    defaultTags: { label: protocol, color, variant: 'subtle' },
    instructions: {
      Swap: {
        tags: { label: 'Swap', color: 'green', variant: 'subtle' },
      },
      AddLiquidity: {
        tags: { label: 'Add Liquidity', color: 'cyan', variant: 'subtle' },
      },
      RemoveLiquidity: {
        tags: { label: 'Remove Liquidity', color: 'orange', variant: 'subtle' },
      },
      Stake: {
        tags: { label: 'Stake', color: 'indigo', variant: 'subtle' },
      },
      Unstake: {
        tags: { label: 'Unstake', color: 'yellow', variant: 'subtle' },
      },
      ClaimRewards: {
        tags: { label: 'Claim', color: 'green', variant: 'subtle' },
      },
    },
  });
}

/**
 * Helper function to register a governance program
 */
export function registerGovernanceProgram(
  programId: string | string[],
  name: string,
  color: string = 'purple'
): void {
  registry.register({
    programId,
    name,
    instructions: {
      CreateProposal: {
        tags: { label: 'Create Proposal', color, variant: 'subtle' },
      },
      Vote: {
        tags: { label: 'Vote', color: 'blue', variant: 'subtle' },
      },
      ExecuteProposal: {
        tags: { label: 'Execute', color: 'green', variant: 'subtle' },
      },
      CancelProposal: {
        tags: { label: 'Cancel', color: 'red', variant: 'subtle' },
      },
    },
  });
}

/**
 * Helper function to register an NFT program
 */
export function registerNFTProgram(
  programId: string | string[],
  name: string,
  marketplace?: string
): void {
  const baseColor = 'pink';

  registry.register({
    programId,
    name,
    defaultTags: marketplace
      ? { label: marketplace, color: baseColor, variant: 'subtle' }
      : undefined,
    instructions: {
      MintNft: {
        tags: { label: 'Mint NFT', color: 'green', variant: 'subtle' },
      },
      ListNft: {
        tags: { label: 'List NFT', color: 'blue', variant: 'subtle' },
      },
      BuyNft: {
        tags: { label: 'Buy NFT', color: 'purple', variant: 'subtle' },
      },
      DelistNft: {
        tags: { label: 'Delist NFT', color: 'gray', variant: 'subtle' },
      },
      TransferNft: {
        tags: { label: 'Transfer NFT', color: baseColor, variant: 'subtle' },
      },
    },
  });
}
