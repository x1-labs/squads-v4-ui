import { toast } from 'sonner';
import type { SendStep } from './signSendAndConfirm';

// 'preparing' is silent: the caller's `toast.promise` loading text covers it.
const DEFAULT_MESSAGES: Partial<Record<SendStep, string>> = {
  signing: 'Approve in your wallet...',
  confirming: 'Confirming...',
};

/**
 * An `onStep` callback that narrates the pipeline in a single sonner toast.
 * Every send site used to hand-roll the same closure; the `id` is shared with
 * the caller's `toast.promise`, so success or failure replaces it in place.
 */
export function toastSteps(
  messages: Partial<Record<SendStep, string>> = {},
  id = 'transaction'
): (step: SendStep) => void {
  return (step) => {
    const message = messages[step] ?? DEFAULT_MESSAGES[step];
    if (message) toast.loading(message, { id });
  };
}
