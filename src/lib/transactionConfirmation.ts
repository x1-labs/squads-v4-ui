import { Connection, RpcResponseAndContext, SignatureStatus } from '@solana/web3.js';

export async function waitForConfirmation(
  connection: Connection, // Adjust type based on your connection object
  signatures: string[],
  timeoutMs: number = 10000
): Promise<(null | SignatureStatus)[]> {
  const startTime = Date.now();
  let latestStatuses: (null | SignatureStatus)[] = [];

  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        while (Date.now() - startTime < timeoutMs) {
          const response: RpcResponseAndContext<(SignatureStatus | null)[]> =
            await connection.getSignatureStatuses(signatures);
          latestStatuses = response.value; // Store latest response

          // Check if all signatures are confirmed (finalized or confirmed)
          const allConfirmed = latestStatuses.every(
            (status) => status?.confirmationStatus === 'finalized'
          );

          // Check if any have errors
          const hasErrors = latestStatuses.some(
            (status) => status?.err !== null && status?.err !== undefined
          );

          if (allConfirmed || hasErrors) {
            console.log('Transaction statuses:', latestStatuses);
            return resolve(latestStatuses);
          }

          // Wait before next check
          await new Promise((r) => setTimeout(r, 500));
        }

        // Timeout reached, but return the latest statuses we have
        // This is not an error - the transactions might still be processing
        console.log('Timeout reached, returning latest statuses:', latestStatuses);
        resolve(latestStatuses);
      } catch (error) {
        console.error('Error checking transaction status:', error);
        // Even on error, resolve with what we have rather than rejecting
        resolve(latestStatuses);
      }
    };

    // Just run checkStatus without race condition
    checkStatus();
  });
}
