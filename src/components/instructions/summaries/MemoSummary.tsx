import React from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';

/**
 * Summary component for Memo instructions
 * Displays the memo text content in a user-friendly format
 */
export const MemoSummary: React.FC<InstructionSummaryProps> = ({ instruction }) => {
  const args = instruction.args;
  const memoText = args?.memo;

  if (!memoText) {
    return null;
  }

  // Check if memo is hex and try to decode
  let displayText = memoText;
  if (typeof memoText === 'string' && memoText.match(/^[0-9a-fA-F]+$/)) {
    try {
      displayText = Buffer.from(memoText, 'hex').toString('utf8');
    } catch {
      // If decoding fails, use original text
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/10">
          <svg
            className="h-4 w-4 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-blue-600 dark:text-blue-400">Memo</div>
          <div className="mt-1 rounded-lg border border-border/50 bg-muted/30 p-3">
            <p className="whitespace-pre-wrap break-words text-foreground">{displayText}</p>
            {displayText.length > 100 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {displayText.length} characters
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
