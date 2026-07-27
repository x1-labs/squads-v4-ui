import React from 'react';
import { DecodedInstruction } from '@/lib/transaction/simpleDecoder';

export type Tone =
  | 'blue'
  | 'green'
  | 'red'
  | 'amber'
  | 'purple'
  | 'indigo'
  | 'cyan'
  | 'teal'
  | 'orange'
  | 'gray';

/**
 * Full class strings so Tailwind's scanner keeps them — do not build these by
 * interpolating the tone.
 */
const TONE_TEXT: Record<Tone, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  purple: 'text-purple-600 dark:text-purple-400',
  indigo: 'text-indigo-600 dark:text-indigo-400',
  cyan: 'text-cyan-600 dark:text-cyan-400',
  teal: 'text-teal-600 dark:text-teal-400',
  orange: 'text-orange-600 dark:text-orange-400',
  gray: 'text-foreground',
};

const TONE_BADGE: Record<Tone, string> = {
  blue: 'bg-blue-100 dark:bg-blue-900/30',
  green: 'bg-green-100 dark:bg-green-900/30',
  red: 'bg-red-100 dark:bg-red-900/30',
  amber: 'bg-amber-100 dark:bg-amber-900/30',
  purple: 'bg-purple-100 dark:bg-purple-900/30',
  indigo: 'bg-indigo-100 dark:bg-indigo-900/30',
  cyan: 'bg-cyan-100 dark:bg-cyan-900/30',
  teal: 'bg-teal-100 dark:bg-teal-900/30',
  orange: 'bg-orange-100 dark:bg-orange-900/30',
  gray: 'bg-muted',
};

interface SummaryShellProps {
  icon: string;
  title: string;
  subtitle: React.ReactNode;
  tone?: Tone;
  children?: React.ReactNode;
}

/**
 * Shared frame for every delegation program summary: icon, headline of what the
 * instruction does, and an optional detail block.
 */
export const SummaryShell: React.FC<SummaryShellProps> = ({
  icon,
  title,
  subtitle,
  tone = 'blue',
  children,
}) => (
  <div className="space-y-3 text-sm">
    <div className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_BADGE[tone]}`}
      >
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex-1">
        <div className={`font-semibold ${TONE_TEXT[tone]}`}>{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
    {children}
  </div>
);

/** Bordered container used for the detail rows under a summary headline. */
export const DetailBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-3">{children}</div>
);

interface FieldProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
}

/** A single label / value row, with an optional explanation underneath. */
export const Field: React.FC<FieldProps> = ({ label, value, hint, tone }) => (
  <div>
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className={`font-mono text-sm ${tone ? TONE_TEXT[tone] : ''}`}>{value}</span>
    </div>
    {hint && <div className="text-xs text-muted-foreground/80">{hint}</div>}
  </div>
);

/** Renders `before → after` with the new value emphasized. */
export const ValueChange: React.FC<{ from: string; to: string; tone?: Tone }> = ({
  from,
  to,
  tone = 'amber',
}) => (
  <span className="font-mono">
    <span className="text-muted-foreground line-through">{from}</span>
    <span className="mx-1.5 text-muted-foreground">→</span>
    <span className={`font-semibold ${TONE_TEXT[tone]}`}>{to}</span>
  </span>
);

/**
 * Look up an instruction account by its IDL name, falling back to a positional
 * index so a summary still renders if the bundled IDL drifts from the program.
 */
export function accountByName(
  instruction: DecodedInstruction,
  name: string,
  fallbackIndex?: number
): string | undefined {
  const match = instruction.accounts?.find((account) => account.name === name);
  if (match) return match.pubkey;
  if (fallbackIndex !== undefined) return instruction.accounts?.[fallbackIndex]?.pubkey;
  return undefined;
}
