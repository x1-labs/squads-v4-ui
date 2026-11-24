import { toast } from 'sonner';
import type { SendStep, StepReporter } from './signSendAndConfirm';

// 'preparing' is silent: the caller's `toast.promise` loading text covers it.
const DEFAULT_MESSAGES: Partial<Record<SendStep, string>> = {
  signing: 'Approve in your wallet...',
  confirming: 'Confirming...',
};

/**
 * An `onStep` callback that narrates the pipeline in a single sonner toast.
 * Every send site used to hand-roll the same closure; the `id` is shared with
 * the caller's `toast.promise`, so success or failure replaces it in place.
 *
 * It also answers the pipeline's "sign again?" question in that same toast,
 * so every send site gets the button without wiring it up.
 */
export function toastSteps(
  messages: Partial<Record<SendStep, string>> = {},
  id = 'transaction'
): StepReporter {
  const report: StepReporter = (step) => {
    const message = messages[step] ?? DEFAULT_MESSAGES[step];
    if (message) toast.loading(message, { id });
  };
  report.signAgain = ({ signMs }) => askToSignAgain(id, signMs);
  return report;
}

/**
 * Show why the signature could not be sent, with a button to sign again.
 * Resolves true on "Sign again", false if the toast is dismissed any other way.
 */
export function askToSignAgain(id: string | number, signMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    toast.warning('The transaction expired while it waited in your wallet', {
      id,
      description:
        `It was approved after ${Math.round(signMs / 1000)}s, too late to send. ` +
        'Nothing was sent. Sign again to retry with a fresh transaction.',
      duration: Infinity,
      action: { label: 'Sign again', onClick: () => settle(true) },
      cancel: { label: 'Dismiss', onClick: () => settle(false) },
      onDismiss: () => settle(false),
      onAutoClose: () => settle(false),
    });
  });
}
