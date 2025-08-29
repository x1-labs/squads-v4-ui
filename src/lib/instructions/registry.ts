import { InstructionRegistry, InstructionSummaryComponent } from './types';
import { XntTransferSummary } from './summaries/XntTransferSummary';
import { SplTransferSummary } from './summaries/SplTransferSummary';

/**
 * Registry mapping program IDs and instruction names to their summary components
 */
export const instructionRegistry: InstructionRegistry = new Map();

// System Program
const systemProgramInstructions = new Map<string, InstructionSummaryComponent>();
systemProgramInstructions.set('Transfer', XntTransferSummary);
instructionRegistry.set('11111111111111111111111111111111', systemProgramInstructions);

// SPL Token Program (both old and new token programs)
const splTokenInstructions = new Map<string, InstructionSummaryComponent>();
splTokenInstructions.set('Transfer', SplTransferSummary);
splTokenInstructions.set('Transferchecked', SplTransferSummary);

// Token Program (old)
instructionRegistry.set('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', splTokenInstructions);

// Token-2022 Program
instructionRegistry.set('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', splTokenInstructions);

/**
 * Get a summary component for a given program ID and instruction name
 */
export function getInstructionSummaryComponent(
  programId: string,
  instructionName: string
): InstructionSummaryComponent | undefined {
  const programInstructions = instructionRegistry.get(programId);
  if (!programInstructions) {
    return undefined;
  }
  return programInstructions.get(instructionName);
}
