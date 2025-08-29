export enum IdlFormat {
  ANCHOR_V01 = 'anchor_v01', // Anchor 0.1.0 - 0.29.x
  ANCHOR_V02 = 'anchor_v02', // Anchor 0.30.x+
  KINOBI = 'kinobi', // Kinobi/Codama format
  SHANK = 'shank', // Shank format
  UNKNOWN = 'unknown',
}

export interface IdlInfo {
  format: IdlFormat;
  version?: string;
  name?: string;
}

/**
 * Detect the format of an IDL
 */
export function detectIdlFormat(idl: any): IdlInfo {
  if (!idl || typeof idl !== 'object') {
    return { format: IdlFormat.UNKNOWN };
  }

  // Check for Kinobi/Codama format (has kind: "rootNode")
  if (idl.kind === 'rootNode' && idl.program) {
    return {
      format: IdlFormat.KINOBI,
      name: idl.program.name || 'Unknown',
      version: idl.program.version,
    };
  }

  // Check for Anchor IDL formats
  if (idl.instructions && Array.isArray(idl.instructions)) {
    // Anchor v0.1.0 format has metadata.spec
    if (idl.metadata?.spec === '0.1.0' || idl.spec === '0.1.0') {
      return {
        format: IdlFormat.ANCHOR_V01,
        name: idl.name || idl.metadata?.name,
        version: idl.version || idl.metadata?.version,
      };
    }

    // Anchor v0.2+ might have different structure
    if (idl.version && !idl.metadata?.spec) {
      return {
        format: IdlFormat.ANCHOR_V02,
        name: idl.name,
        version: idl.version,
      };
    }

    // Default to v0.1 if has instructions but no clear version
    return {
      format: IdlFormat.ANCHOR_V01,
      name: idl.name,
      version: idl.version,
    };
  }

  // Check for Shank format (if it has specific markers)
  if (idl.instructions && idl.shankVersion) {
    return {
      format: IdlFormat.SHANK,
      name: idl.name,
      version: idl.shankVersion,
    };
  }

  return { format: IdlFormat.UNKNOWN };
}

/**
 * Check if IDL is compatible with Anchor BorshInstructionCoder
 */
export function isAnchorCompatible(format: IdlFormat): boolean {
  return format === IdlFormat.ANCHOR_V01 || format === IdlFormat.ANCHOR_V02;
}
