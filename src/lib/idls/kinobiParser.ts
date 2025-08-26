import { PublicKey } from '@solana/web3.js';

export interface KinobiInstruction {
  name: string;
  discriminator?: number[];
  accounts: Array<{
    name: string;
    isSigner?: boolean;
    isWritable?: boolean;
  }>;
  arguments: Array<{
    name: string;
    type: any;
  }>;
}

export class KinobiIdlParser {
  private idl: any;
  private instructions: Map<string, KinobiInstruction> = new Map();
  private instructionsByDiscriminator: Map<string, KinobiInstruction> = new Map();
  private instructionsByIndex: Map<number, KinobiInstruction> = new Map();

  constructor(idl: any) {
    this.idl = idl;
    this.parseInstructions();
  }

  private parseInstructions() {
    if (!this.idl?.program?.instructions) {
      return;
    }

    this.idl.program.instructions.forEach((instruction: any, index: number) => {
      const parsed = this.parseInstruction(instruction, index);
      this.instructions.set(parsed.name, parsed);

      // Store by discriminator if available
      if (parsed.discriminator) {
        const discriminatorKey = parsed.discriminator.join(',');
        this.instructionsByDiscriminator.set(discriminatorKey, parsed);
      }

      // Store by index for fallback
      this.instructionsByIndex.set(index, parsed);
    });
  }

  private parseInstruction(instruction: any, index: number): KinobiInstruction {
    const accounts: Array<{ name: string; isSigner?: boolean; isWritable?: boolean }> = [];
    const args: Array<{ name: string; type: any }> = [];

    // Parse accounts
    if (instruction.accounts && Array.isArray(instruction.accounts)) {
      instruction.accounts.forEach((account: any) => {
        accounts.push({
          name: account.name,
          isSigner: account.isSigner || false,
          isWritable: account.isWritable || account.isMut || false,
        });
      });
    }

    // Parse arguments
    if (instruction.arguments && Array.isArray(instruction.arguments)) {
      instruction.arguments.forEach((arg: any) => {
        args.push({
          name: arg.name,
          type: arg.type,
        });
      });
    }

    // Extract discriminator
    let discriminator: number[] | undefined;

    // Handle different discriminator formats
    if (instruction.discriminator) {
      // Simple discriminator format
      if (Array.isArray(instruction.discriminator)) {
        discriminator = instruction.discriminator;
      } else if (instruction.discriminator.value) {
        discriminator = instruction.discriminator.value;
      }
    } else if (instruction.discriminators && Array.isArray(instruction.discriminators)) {
      // Kinobi/Codama format with discriminators array
      const fieldDiscriminator = instruction.discriminators.find(
        (d: any) => d.kind === 'fieldDiscriminatorNode'
      );

      if (fieldDiscriminator && fieldDiscriminator.name) {
        // Find the argument with the discriminator name
        const discriminatorArg = instruction.arguments?.find(
          (arg: any) => arg.name === fieldDiscriminator.name
        );

        if (discriminatorArg?.defaultValue?.number !== undefined) {
          // For single byte discriminators (like SPL Token)
          discriminator = [discriminatorArg.defaultValue.number];
        } else if (discriminatorArg?.defaultValue?.value !== undefined) {
          // For array discriminators
          discriminator = Array.isArray(discriminatorArg.defaultValue.value)
            ? discriminatorArg.defaultValue.value
            : [discriminatorArg.defaultValue.value];
        }
      }
    }

    return {
      name: instruction.name,
      discriminator,
      accounts,
      arguments: args,
    };
  }

  /**
   * Decode an instruction from data
   */
  decodeInstruction(data: Buffer): { name: string; data: any } | null {
    if (data.length === 0) {
      return null;
    }

    // Try single-byte discriminator first (common for SPL Token and other programs)
    const singleByteDiscriminator = [data[0]];
    const singleByteKey = singleByteDiscriminator.join(',');
    let instruction = this.instructionsByDiscriminator.get(singleByteKey);

    if (instruction) {
      // For single-byte discriminator, the discriminator byte is at position 0
      // SPL Token marks discriminator as "omitted" meaning it's not part of the args to parse
      // but it IS present in the data, so we skip it and start parsing args at byte 1
      return {
        name: instruction.name,
        data: this.parseInstructionData(instruction, data.slice(1)),
      };
    }

    // Try 8-byte discriminator (Anchor programs)
    if (data.length >= 8) {
      const discriminator = Array.from(data.slice(0, 8));
      const discriminatorKey = discriminator.join(',');
      instruction = this.instructionsByDiscriminator.get(discriminatorKey);

      if (instruction) {
        return {
          name: instruction.name,
          data: this.parseInstructionData(instruction, data.slice(8)),
        };
      }
    }

    // Fallback: try to match by index if no discriminator match
    const index = data[0];
    instruction = this.instructionsByIndex.get(index);

    if (instruction) {
      return {
        name: instruction.name,
        data: this.parseInstructionData(instruction, data.slice(1)),
      };
    }

    return null;
  }

  /**
   * Parse instruction data based on arguments
   */
  private parseInstructionData(instruction: KinobiInstruction, data: Buffer): any {
    const result: any = {};
    let offset = 0;

    // Get the full instruction from IDL to check for omitted fields
    const fullInstruction = this.idl.program.instructions.find(
      (i: any) => i.name === instruction.name
    );

    for (let i = 0; i < instruction.arguments.length; i++) {
      const arg = instruction.arguments[i];

      // Check if this argument is omitted (like discriminator in SPL Token)
      const fullArg = fullInstruction?.arguments?.[i];
      if (fullArg?.defaultValueStrategy === 'omitted') {
        // Use the default value and don't consume any bytes
        if (fullArg.defaultValue?.number !== undefined) {
          result[arg.name] = fullArg.defaultValue.number;
        } else if (fullArg.defaultValue?.value !== undefined) {
          result[arg.name] = fullArg.defaultValue.value;
        }
        continue;
      }

      try {
        const { value, bytesRead } = this.parseType(arg.type, data, offset);
        result[arg.name] = value;
        offset += bytesRead;
      } catch (error) {
        console.warn(`Failed to parse argument ${arg.name}:`, error);
        result[arg.name] = 'Parse error';
      }
    }

    return result;
  }

  /**
   * Parse a type from buffer
   */
  private parseType(type: any, data: Buffer, offset: number): { value: any; bytesRead: number } {
    if (!type || !type.kind) {
      return { value: null, bytesRead: 0 };
    }

    switch (type.kind) {
      case 'numberTypeNode':
        return this.parseNumber(type, data, offset);
      case 'publicKeyTypeNode':
        return this.parsePublicKey(data, offset);
      case 'stringTypeNode':
        return this.parseString(type, data, offset);
      case 'boolTypeNode':
      case 'booleanTypeNode':
        return this.parseBool(data, offset);
      case 'optionTypeNode':
        return this.parseOption(type, data, offset);
      case 'structTypeNode':
        return this.parseStruct(type, data, offset);
      case 'arrayTypeNode':
        return this.parseArray(type, data, offset);
      case 'bytesTypeNode':
        return this.parseBytes(type, data, offset);
      default:
        console.warn(`Unknown type kind: ${type.kind}`);
        return { value: null, bytesRead: 0 };
    }
  }

  private parseNumber(type: any, data: Buffer, offset: number): { value: any; bytesRead: number } {
    const format = type.format || 'u32';
    const endian = type.endian || 'le';

    switch (format) {
      case 'u8':
        return { value: data[offset], bytesRead: 1 };
      case 'u16':
        return {
          value: endian === 'le' ? data.readUInt16LE(offset) : data.readUInt16BE(offset),
          bytesRead: 2,
        };
      case 'u32':
        return {
          value: endian === 'le' ? data.readUInt32LE(offset) : data.readUInt32BE(offset),
          bytesRead: 4,
        };
      case 'u64':
        return {
          value:
            endian === 'le'
              ? data.readBigUInt64LE(offset).toString()
              : data.readBigUInt64BE(offset).toString(),
          bytesRead: 8,
        };
      default:
        return { value: 0, bytesRead: 1 };
    }
  }

  private parsePublicKey(data: Buffer, offset: number): { value: string; bytesRead: number } {
    if (offset + 32 <= data.length) {
      const pubkey = new PublicKey(data.slice(offset, offset + 32));
      return { value: pubkey.toBase58(), bytesRead: 32 };
    }
    return { value: 'Invalid PublicKey', bytesRead: 32 };
  }

  private parseString(
    type: any,
    data: Buffer,
    offset: number
  ): { value: string; bytesRead: number } {
    // Assuming length-prefixed string (4-byte length)
    if (offset + 4 <= data.length) {
      const length = data.readUInt32LE(offset);
      const stringData = data.slice(offset + 4, offset + 4 + length);
      return { value: stringData.toString('utf8'), bytesRead: 4 + length };
    }
    return { value: '', bytesRead: 0 };
  }

  private parseBool(data: Buffer, offset: number): { value: boolean; bytesRead: number } {
    return { value: data[offset] !== 0, bytesRead: 1 };
  }

  private parseOption(type: any, data: Buffer, offset: number): { value: any; bytesRead: number } {
    // Handle different option prefix formats
    let hasValue = false;
    let prefixSize = 1;
    let currentOffset = offset;

    if (type.prefix) {
      // Parse the prefix to determine if option has value
      const prefixResult = this.parseType(type.prefix, data, currentOffset);
      hasValue = prefixResult.value !== 0;
      prefixSize = prefixResult.bytesRead;
      currentOffset += prefixSize;
    } else {
      // Default to single byte prefix
      hasValue = data[offset] !== 0;
      currentOffset += 1;
    }

    if (!hasValue) {
      return { value: null, bytesRead: currentOffset - offset };
    }

    const { value, bytesRead } = this.parseType(type.item, data, currentOffset);
    return { value, bytesRead: currentOffset - offset + bytesRead };
  }

  private parseStruct(type: any, data: Buffer, offset: number): { value: any; bytesRead: number } {
    const result: any = {};
    let currentOffset = offset;

    if (type.fields && Array.isArray(type.fields)) {
      for (const field of type.fields) {
        const { value, bytesRead } = this.parseType(field.type, data, currentOffset);
        result[field.name] = value;
        currentOffset += bytesRead;
      }
    }

    return { value: result, bytesRead: currentOffset - offset };
  }

  private parseArray(type: any, data: Buffer, offset: number): { value: any[]; bytesRead: number } {
    const result: any[] = [];
    let currentOffset = offset;

    // Determine array size
    let count = 0;
    if (type.count) {
      if (type.count.kind === 'fixedCountNode') {
        count = type.count.value;
      } else if (type.count.kind === 'prefixedCountNode') {
        // Read the prefix to get count
        const prefixResult = this.parseType(type.count.prefix, data, currentOffset);
        count = prefixResult.value;
        currentOffset += prefixResult.bytesRead;
      }
    }

    // Parse array elements
    for (let i = 0; i < count; i++) {
      const { value, bytesRead } = this.parseType(type.item, data, currentOffset);
      result.push(value);
      currentOffset += bytesRead;
    }

    return { value: result, bytesRead: currentOffset - offset };
  }

  private parseBytes(
    type: any,
    data: Buffer,
    offset: number
  ): { value: string; bytesRead: number } {
    let size = 0;
    let currentOffset = offset;

    if (type.size) {
      if (typeof type.size === 'number') {
        size = type.size;
      } else if (type.size.kind === 'fixedSizeNode') {
        size = type.size.value;
      } else if (type.size.kind === 'prefixedSizeNode') {
        // Read the prefix to get size
        const prefixResult = this.parseType(type.size.prefix, data, currentOffset);
        size = prefixResult.value;
        currentOffset += prefixResult.bytesRead;
      }
    }

    const bytes = data.slice(currentOffset, currentOffset + size);
    return {
      value: bytes.toString('hex'),
      bytesRead: currentOffset - offset + size,
    };
  }

  /**
   * Get instruction metadata
   */
  getInstruction(name: string): KinobiInstruction | undefined {
    return this.instructions.get(name);
  }

  /**
   * Get all instructions
   */
  getAllInstructions(): KinobiInstruction[] {
    return Array.from(this.instructions.values());
  }
}
