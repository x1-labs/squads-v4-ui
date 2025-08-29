import { PublicKey, TransactionInstruction } from '@solana/web3.js';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/**
 * Creates a memo instruction if memo text is provided
 * @param memo - The memo text to include
 * @param signer - The public key of the signer (usually the vault address)
 * @returns A memo instruction or null if no memo is provided
 */
export function createMemoInstruction(
  memo: string,
  signer: PublicKey
): TransactionInstruction | null {
  const trimmedMemo = memo.trim();

  if (!trimmedMemo) {
    return null;
  }

  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(trimmedMemo, 'utf-8'),
  });
}

/**
 * Adds a memo instruction to an array of instructions if memo is provided
 * @param instructions - Array of instructions to potentially add memo to
 * @param memo - The memo text to include
 * @param signer - The public key of the signer (usually the vault address)
 */
export function addMemoToInstructions(
  instructions: TransactionInstruction[],
  memo: string,
  signer: PublicKey
): void {
  const memoInstruction = createMemoInstruction(memo, signer);
  if (memoInstruction) {
    instructions.push(memoInstruction);
  }
}
