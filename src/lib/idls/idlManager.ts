import { PublicKey } from '@solana/web3.js';
import { detectIdlFormat, IdlFormat } from './idlFormats';
import { KinobiIdlParser } from './kinobiParser';
import { registry } from '../registry';
import '../../registry'; // Ensure registrations are loaded

export interface IdlEntry {
  programId: string;
  name: string;
  idl: any;
  format: IdlFormat;
  parser?: KinobiIdlParser;
}

/**
 * DEPRECATED: This class is kept for backward compatibility
 * New code should use the central registry from src/registry.ts
 */
class IdlManager {
  private idls: Map<string, IdlEntry> = new Map();

  constructor() {
    // IDLs are now registered in src/registrations.ts
    // This manager now acts as a facade to the central registry
  }

  /**
   * Add an IDL to the registry
   * @deprecated Use registry.register() from src/registry.ts instead
   */
  addIdl(programId: string, name: string, idl: any): void {
    // Register in the central registry
    registry.register({
      programId,
      name,
      idl,
    });

    // Also keep in local map for backward compatibility
    const formatInfo = detectIdlFormat(idl);
    const entry: IdlEntry = {
      programId,
      name,
      idl,
      format: formatInfo.format,
    };

    if (formatInfo.format === IdlFormat.KINOBI) {
      entry.parser = new KinobiIdlParser(idl);
    }

    this.idls.set(programId, entry);
    console.log(`Added IDL for ${name} (${programId}) - Format: ${formatInfo.format}`);
  }

  /**
   * Get an IDL by program ID
   * First tries the central registry, then falls back to local map
   */
  getIdl(programId: string | PublicKey): IdlEntry | undefined {
    const id = typeof programId === 'string' ? programId : programId.toBase58();

    // Try central registry first
    const centralIdl = registry.getIdl(id);
    if (centralIdl) {
      const formatInfo = detectIdlFormat(centralIdl);
      const entry: IdlEntry = {
        programId: id,
        name: registry.getProgramName(id) || 'Unknown Program',
        idl: centralIdl,
        format: formatInfo.format,
      };

      if (formatInfo.format === IdlFormat.KINOBI) {
        entry.parser = new KinobiIdlParser(centralIdl);
      }

      return entry;
    }

    // Fall back to local map
    return this.idls.get(id);
  }

  /**
   * Get all IDLs
   */
  getAllIdls(): IdlEntry[] {
    const entries: IdlEntry[] = [];
    const seen = new Set<string>();

    // Get from central registry
    for (const program of registry.getAllPrograms()) {
      if (program.idl) {
        for (const programId of program.programIds) {
          if (!seen.has(programId)) {
            const formatInfo = detectIdlFormat(program.idl);
            const entry: IdlEntry = {
              programId,
              name: program.name || 'Unknown Program',
              idl: program.idl,
              format: formatInfo.format,
            };

            if (formatInfo.format === IdlFormat.KINOBI) {
              entry.parser = new KinobiIdlParser(program.idl);
            }

            entries.push(entry);
            seen.add(programId);
          }
        }
      }
    }

    // Add any from local map not in registry
    for (const entry of this.idls.values()) {
      if (!seen.has(entry.programId)) {
        entries.push(entry);
      }
    }

    return entries;
  }
}

// Export singleton instance
export const idlManager = new IdlManager();
