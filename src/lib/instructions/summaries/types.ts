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
