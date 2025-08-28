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
    this.addIdl('DDL3Xp6ie85DXgiPkXJ7abUyS2tGv4CGEod2DeQXQ941', 'Squads Multisig V4', squadsV4Idl);

    this.addIdl(
      'X1DPvnLXekvd6EtDsPVqahzhziKx3Zj1z8WkD93xebg',
      'Delegation Program',
      delegationProgramIdl
    );

    this.addIdl(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      'Token Program',
      tokenProgramIdl
    );

    this.addIdl(
      'XPoo1Fx6KNgeAzFcq2dPTo95bWGUSj5KdPVqYj9CZux',
      'Staker Pool',
      stakePoolIdl
    );
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
      format: formatInfo.format,
    };

    // Create parser for Kinobi format
    if (formatInfo.format === IdlFormat.KINOBI) {
      entry.parser = new KinobiIdlParser(idl);
    }

    this.idls.set(programId, entry);
    console.log(`Added IDL for ${name} (${programId}) - Format: ${formatInfo.format}`);
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
}

// Export singleton instance
export const idlManager = new IdlManager();
