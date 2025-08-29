import { DecodedTransaction } from '@/lib/transaction/simpleDecoder';
import { TransactionTag, TransactionTags } from './types';
import { tagRegistry } from './registry';

/**
 * Extract tags from a decoded transaction
 */
export function extractTransactionTags(transaction: DecodedTransaction): TransactionTags {
  const tags = new Map<string, TransactionTag>();
  const programNames = new Set<string>();

  // Process each instruction
  for (const instruction of transaction.instructions) {
    // Add program name to the set (for program name tags)
    if (instruction.programName && instruction.programName !== 'Unknown Program') {
      programNames.add(instruction.programName);
    }

    // Apply all registered tag matchers
    const matchers = tagRegistry.getMatchers();
    for (const matcher of matchers) {
      const tag = matcher(instruction);
      if (tag) {
        // Use label as key to avoid duplicate tags
        tags.set(tag.label, tag);
      }
    }

    // Process inner instructions recursively
    if (instruction.innerInstructions) {
      for (const innerInstruction of instruction.innerInstructions) {
        if (innerInstruction.programName && innerInstruction.programName !== 'Unknown Program') {
          programNames.add(innerInstruction.programName);
        }

        for (const matcher of matchers) {
          const tag = matcher(innerInstruction);
          if (tag) {
            tags.set(tag.label, tag);
          }
        }
      }
    }
  }

  // Add program name tags for decodable programs
  // These are added with lower visual priority
  for (const programName of programNames) {
    // Skip if we already have a more specific tag for this program
    const hasSpecificTag = Array.from(tags.values()).some((tag) =>
      tag.label.toLowerCase().includes(programName.toLowerCase().split(' ')[0])
    );

    if (!hasSpecificTag) {
      tags.set(`program:${programName}`, {
        label: programName,
        variant: 'subtle',
      });
    }
  }

  return {
    tags: Array.from(tags.values()),
    programNames,
  };
}
