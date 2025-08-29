/**
 * Formats an error into a human-readable string
 * @param error - The error to format (can be Error, string, or any object)
 * @returns A formatted error message string
 */
export function formatError(error: unknown): string {
  // Handle null/undefined
  if (error == null) {
    return 'An unknown error occurred';
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }

  // Handle Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Handle arrays (like transaction confirmation arrays)
  if (Array.isArray(error)) {
    // Look for error information in the array
    const errorItem = error.find((item) => item?.err || item?.status?.Err);
    if (errorItem) {
      const errorCode = errorItem.err || errorItem.status?.Err;
      if (typeof errorCode === 'string') {
        // Provide helpful context for common Solana errors
        if (errorCode === 'ProgramAccountNotFound') {
          return 'The required account was not found. Please ensure all accounts exist and are properly initialized.';
        }
        if (errorCode === 'InsufficientFunds') {
          return 'Insufficient funds for the transaction.';
        }
        if (errorCode === 'AccountNotFound') {
          return 'One of the required accounts does not exist.';
        }
        return errorCode;
      }
      return JSON.stringify(errorCode);
    }
    // If no specific error found, stringify the array
    return JSON.stringify(error);
  }

  // Handle objects with message property
  if (typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  // Handle objects with toString method
  if (typeof error === 'object' && 'toString' in error && typeof error.toString === 'function') {
    const stringified = error.toString();
    // Avoid returning [object Object]
    if (stringified !== '[object Object]') {
      return stringified;
    }
  }

  // Try to stringify the object
  try {
    const stringified = JSON.stringify(error);
    if (stringified && stringified !== '{}') {
      return stringified;
    }
  } catch {
    // If JSON.stringify fails, fall back to generic message
  }

  // Default fallback
  return 'An unexpected error occurred';
}
