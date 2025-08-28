import React from 'react';
import { Connection } from '@solana/web3.js';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';
import {
  InstructionType,
  XntTransferData,
  SplTransferData,
} from '@/lib/transaction/instructionTypes';
import { TokenMetadata } from '@/lib/token/tokenMetadata';
import { XntTransferDisplay } from './XntTransferDisplay';
import { SplTransferDisplay } from './SplTransferDisplay';
import { UnknownInstructionDisplay } from './UnknownInstructionDisplay';

interface Props {
  instruction: DecodedInstruction;
  tokenMetadata?: TokenMetadata | null;
  connection?: Connection;
}

export function InstructionDisplay({ instruction, tokenMetadata, connection }: Props) {
  switch (instruction.instructionType) {
    case InstructionType.XNT_TRANSFER:
      return <XntTransferDisplay data={instruction.data as XntTransferData} />;

    case InstructionType.SPL_TRANSFER:
    case InstructionType.SPL_TRANSFER_CHECKED:
      return (
        <SplTransferDisplay
          data={instruction.data as SplTransferData}
          tokenMetadata={tokenMetadata}
          connection={connection}
        />
      );

    case InstructionType.UNKNOWN:
    default:
      return <UnknownInstructionDisplay instruction={instruction} />;
  }
}
