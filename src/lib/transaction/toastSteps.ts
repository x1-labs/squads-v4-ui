import { toast } from 'sonner';
import { askToSignAgain } from '../../components/SignAgainToast';
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
 * It also answers the pipeline's "sign again?" question with a toast of its
 * own, so every send site gets the button without wiring it up.
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
