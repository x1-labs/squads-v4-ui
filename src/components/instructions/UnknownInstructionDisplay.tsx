import React from 'react';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';

interface Props {
  instruction: DecodedInstruction;
}

export function UnknownInstructionDisplay({ instruction }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="mb-3 font-semibold text-foreground">{instruction.instructionName}</h3>

      <div className="flex items-start gap-2">
        <span className="min-w-[70px] text-muted-foreground">Program:</span>
        <code className="break-all font-mono text-xs text-foreground">
          {instruction.programName}
        </code>
      </div>

      {/* Display arguments if any */}
      {Object.keys(instruction.args).length > 0 && (
        <>
          <div className="mt-3 text-sm font-medium text-muted-foreground">Arguments:</div>
          {Object.entries(instruction.args).map(([key, value]) => (
            <div key={key} className="flex items-start gap-2">
              <span className="min-w-[70px] text-muted-foreground">{key}:</span>
              <code className="break-all font-mono text-xs text-foreground">
                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
              </code>
            </div>
          ))}
        </>
      )}

      {/* Display accounts if any */}
      {instruction.accounts.length > 0 && (
        <>
          <div className="mt-3 text-sm font-medium text-muted-foreground">Accounts:</div>
          {instruction.accounts.map((account, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="min-w-[70px] text-muted-foreground">
                {account.name || `Account ${idx}`}:
              </span>
              <code className="break-all font-mono text-xs text-foreground">{account.pubkey}</code>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
