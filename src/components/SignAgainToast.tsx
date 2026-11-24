import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';

type SignAgainToastProps = {
  signMs: number;
  onSignAgain: () => void;
  onDismiss: () => void;
};

/** Card shown when the wallet returned a signature too late to send. */
const SignAgainToast = ({ signMs, onSignAgain, onDismiss }: SignAgainToastProps) => (
  <div className="w-[356px] rounded-lg border border-border bg-background p-4 text-foreground shadow-lg">
    <div className="flex gap-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">The transaction expired in your wallet</p>
        <p className="text-sm text-muted-foreground">
          You approved it after {Math.round(signMs / 1000)}s, which was too late to send it. Nothing
          was sent.
        </p>
      </div>
    </div>
    <div className="mt-4 flex justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
      <Button size="sm" onClick={onSignAgain}>
        Sign again
      </Button>
    </div>
  </div>
);

/**
 * Ask whether to sign again after an expired signature. The question gets its
 * own toast, and the pipeline's progress toast (`progressId`) is cleared while
 * it is open, so the two never show at once. Resolves true on "Sign again" and
 * false if the toast is dismissed any other way.
 */
export function askToSignAgain(progressId: string | number, signMs: number): Promise<boolean> {
  const id = `${progressId}-sign-again`;
  toast.dismiss(progressId);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
      toast.dismiss(id);
    };
    toast.custom(
      () => (
        <SignAgainToast
          signMs={signMs}
          onSignAgain={() => settle(true)}
          onDismiss={() => settle(false)}
        />
      ),
      {
        id,
        duration: Infinity,
        onDismiss: () => settle(false),
        onAutoClose: () => settle(false),
      }
    );
  });
}
