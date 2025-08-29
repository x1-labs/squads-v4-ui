import { TagRegistryEntry, TagMatcher, TransactionTag } from './types';

/**
 * Registry of tag matchers
 */
class TagRegistry {
  private entries: TagRegistryEntry[] = [];

  /**
   * Register a new tag matcher
   */
  register(entry: TagRegistryEntry): void {
    this.entries.push(entry);
    // Sort by priority (higher first)
    this.entries.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Get all registered matchers
   */
  getMatchers(): TagMatcher[] {
    return this.entries.map((entry) => entry.matcher);
  }

  /**
   * Clear all registered matchers
   */
  clear(): void {
    this.entries = [];
  }
}

// Create the global registry instance
export const tagRegistry = new TagRegistry();

/**
 * Helper function to create a matcher for specific program IDs and instruction name
 * @param programIds - List of program IDs to match
 * @param instructionName - Instruction name to match (case-insensitive)
 * @param tag - Tag to return when matched
 * @param priority - Optional priority (default: 5)
 * @returns TagRegistryEntry
 */
export function createInstructionMatcher(
  programIds: string[],
  instructionName: string,
  tag: TransactionTag,
  priority: number = 5
): TagRegistryEntry {
  const normalizedInstructionName = instructionName.toLowerCase();
  return {
    id: `${programIds[0]}-${instructionName}`.toLowerCase(),
    matcher: (instruction) => {
      const matchesProgram = programIds.includes(instruction.programId);
      const matchesInstruction =
        instruction.instructionName.toLowerCase() === normalizedInstructionName;

      if (matchesProgram && matchesInstruction) {
        return tag;
      }
      return null;
    },
    priority,
  };
}

// Register default tag matchers using helper function

// XNT Transfer
tagRegistry.register(
  createInstructionMatcher(
    ['11111111111111111111111111111111'],
    'Transfer',
    {
      label: 'XNT Transfer',
      color: 'purple',
      variant: 'subtle',
    },
    10
  )
);

// SPL Token Transfers
tagRegistry.register(
  createInstructionMatcher(
    ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'],
    'Transfer',
    {
      label: 'Token Transfer',
      color: 'purple',
      variant: 'subtle',
    },
    10
  )
);

tagRegistry.register(
  createInstructionMatcher(
    ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'],
    'TransferChecked',
    {
      label: 'Token Transfer',
      color: 'purple',
      variant: 'subtle',
    },
    10
  )
);
