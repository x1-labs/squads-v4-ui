import React from 'react';
import { Connection } from '@solana/web3.js';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';

/**
 * Standard interface for instruction summary components
 */
export interface InstructionSummaryProps {
  instruction: DecodedInstruction;
  connection: Connection;
}

/**
 * Type definition for instruction summary components
 */
export type InstructionSummaryComponent = React.FC<InstructionSummaryProps>;

/**
 * Helper type for the instruction registry
 */
export type InstructionRegistry = Map<string, Map<string, InstructionSummaryComponent>>;

/**
 * Represents a tag that can be attached to a transaction
 */
export interface TransactionTag {
  label: string;
  color?: string; // Optional color for the tag (e.g., 'blue', 'green', 'red')
  variant?: 'default' | 'outline' | 'subtle';
}

/**
 * Function that determines if an instruction should have a specific tag
 */
export type TagMatcher = (instruction: DecodedInstruction) => TransactionTag | null;

/**
 * Registry entry for tag matchers
 */
export interface TagRegistryEntry {
  id: string;
  matcher: TagMatcher;
  priority?: number; // Higher priority matchers are evaluated first
}

/**
 * Tag extraction result for a transaction
 */
export interface TransactionTags {
  tags: TransactionTag[];
  programNames: Set<string>; // Unique program names encountered
}
