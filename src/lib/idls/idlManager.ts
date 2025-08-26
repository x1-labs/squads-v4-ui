import { PublicKey } from '@solana/web3.js';
import { detectIdlFormat, IdlFormat, IdlInfo } from './idlFormats';
import { KinobiIdlParser } from './kinobiParser';

// Import known IDLs
import squadsV4Idl from './squads-v4.json';
import delegationProgramIdl from './delegation_program.json';
import stakePoolIdl from './stake_pool.json';
import tokenProgramIdl from './token_program.json';

export interface IdlEntry {
  programId: string;
  name: string;
  idl: any;
  format: IdlFormat;
  parser?: KinobiIdlParser;
}

class IdlManager {
  private idls: Map<string, IdlEntry> = new Map();

  constructor() {
    // Initialize with known IDLs
    this.addIdl(
      'DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941',
      'Squads Multisig V4',
      squadsV4Idl
    );

    // Use the address from the IDL itself
    this.addIdl(
      'X1dpTaMXkdEHQwhUk5oidxK9RXer8WoUCinWTyRmVjQ', // The actual deployed program ID
      'Delegation Program',
      delegationProgramIdl
    );

    this.addIdl(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // The actual deployed program ID
      'Token Program',
      tokenProgramIdl
    );

    // this.addIdl(
    //   'ErJn3yvnMcCGWZm4jWuRj2EwTXvgobF9gnkMnEGAMg1L', // The actual deployed program ID
    //   'Staker Pool',
    //   stakePoolIdl
    // );

    // Load any saved custom IDLs from localStorage
    this.loadCustomIdls();
  }

  /**
   * Add an IDL to the registry
   */
  addIdl(programId: string, name: string, idl: any): void {
    const formatInfo = detectIdlFormat(idl);
    const entry: IdlEntry = {
      programId,
      name,
      idl,
      format: formatInfo.format
    };

    // Create parser for Kinobi format
    if (formatInfo.format === IdlFormat.KINOBI) {
      entry.parser = new KinobiIdlParser(idl);
    }

    this.idls.set(programId, entry);
    console.log(`Added IDL for ${name} (${programId}) - Format: ${formatInfo.format}`);
    this.saveCustomIdls();
  }

  /**
   * Get an IDL by program ID
   */
  getIdl(programId: string | PublicKey): IdlEntry | undefined {
    const id = typeof programId === 'string' ? programId : programId.toBase58();
    return this.idls.get(id);
  }

  /**
   * Get all IDLs
   */
  getAllIdls(): IdlEntry[] {
    return Array.from(this.idls.values());
  }

  /**
   * Remove an IDL (only custom ones, not built-in)
   */
  removeIdl(programId: string): boolean {
    // Don't allow removing built-in IDLs
    const builtInIds = [
      'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf',
      'DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941',
      'X1dpTaMXkdEHQwhUk5oidxK9RXer8WoUCinWTyRmVjQ',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    ];

    if (builtInIds.includes(programId)) {
      return false;
    }

    const result = this.idls.delete(programId);
    if (result) {
      this.saveCustomIdls();
    }
    return result;
  }

  /**
   * Import an IDL from JSON
   */
  importIdlFromJson(jsonString: string, programId?: string): void {
    try {
      const idl = JSON.parse(jsonString);

      // Try to extract program ID from the IDL if not provided
      const id = programId || idl.metadata?.address || idl.address;
      if (!id) {
        throw new Error('Program ID not found in IDL and not provided');
      }

      const name = idl.metadata?.name || idl.name || 'Unknown Program';

      this.addIdl(id, name, idl);
    } catch (error) {
      throw new Error(`Failed to import IDL: ${error}`);
    }
  }

  /**
   * Export all IDLs as JSON
   */
  exportAllIdls(): string {
    const idlsArray = this.getAllIdls();
    return JSON.stringify(idlsArray, null, 2);
  }

  /**
   * Load custom IDLs from localStorage
   */
  private loadCustomIdls(): void {
    try {
      const stored = localStorage.getItem('customIdls');
      if (stored) {
        const idls = JSON.parse(stored) as IdlEntry[];
        idls.forEach(entry => {
          // Recreate parser for Kinobi format IDLs
          if (entry.format === IdlFormat.KINOBI && entry.idl) {
            entry.parser = new KinobiIdlParser(entry.idl);
          }
          this.idls.set(entry.programId, entry);
        });
      }
    } catch (error) {
      console.error('Failed to load custom IDLs:', error);
    }
  }

  /**
   * Save custom IDLs to localStorage
   */
  private saveCustomIdls(): void {
    try {
      // Filter out built-in IDLs
      const builtInIds = [
        'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf',
        'DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941',
        'X1dpTaMXkdEHQwhUk5oidxK9RXer8WoUCinWTyRmVjQ',
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      ];

      const customIdls = Array.from(this.idls.values()).filter(
        entry => !builtInIds.includes(entry.programId)
      );

      localStorage.setItem('customIdls', JSON.stringify(customIdls));
    } catch (error) {
      console.error('Failed to save custom IDLs:', error);
    }
  }

  /**
   * Fetch IDL from chain (if supported)
   */
  async fetchIdlFromChain(
    programId: string | PublicKey,
    connection: any
  ): Promise<any> {
    try {
      // This would need to be implemented based on how IDLs are stored on-chain
      // Some programs store their IDL in a PDA
      // For now, this is a placeholder
      console.log('Fetching IDL from chain is not yet implemented');
      return null;
    } catch (error) {
      console.error('Failed to fetch IDL from chain:', error);
      return null;
    }
  }
}

// Export singleton instance
export const idlManager = new IdlManager();
