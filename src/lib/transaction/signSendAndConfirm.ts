import { Transaction } from '@solana/web3.js';
import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { buildComputeBudgetInstructions } from './priorityFee';
import { getSendableBlockhash, sendAndConfirm } from './sendAndConfirm';

/** The slice of a wallet-adapter wallet this needs: the sign-only flow, never `sendTransaction`. */
export type SigningWallet = {
  publicKey: PublicKey | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
};

export type SignSendAndConfirmOptions = {
  /** Accounts the transaction writes to — what the priority fee is priced against. */
  writableAccounts: PublicKey[];
  /** `unitsConsumed` from the caller's simulation, used to size the compute limit. */
  unitsConsumed?: number | null;
  /** Prefix for console output, e.g. 'ApproveButton'. */
  label: string;
  /** Called once the wallet has signed, so the caller can flip its toast to "confirming". */
  onSigned?: () => void;
};

/**
 * The send pipeline shared by every proposal action: price and size a compute
 * budget, put it in front of `instructions`, fetch a fresh blockhash, have the
 * wallet sign, then broadcast and rebroadcast until the signature confirms or
 * the blockhash expires.
 *
 * Callers simulate first and pass what that measured; this rebuilds the
 * transaction rather than mutating theirs so the simulation object stays
 * untouched. Resolves with the signature. Throws `TransactionFailedError` /
 * `TransactionExpiredError` from `sendAndConfirm`, or the wallet's own error if
 * the user declines to sign.
 */
export async function signSendAndConfirm(
  connection: Connection,
  wallet: SigningWallet,
  instructions: TransactionInstruction[],
  options: SignSendAndConfirmOptions
): Promise<string> {
  const tag = `[${options.label}]`;

  if (!wallet.publicKey) throw new Error('Wallet not connected');
  if (!wallet.signTransaction) throw new Error('Wallet does not support transaction signing');

  // Price the transaction against what recently landed on the accounts it
  // writes to, and size the compute limit to what simulation just measured.
  const computeBudgetInstructions = await buildComputeBudgetInstructions(
    connection,
    options.writableAccounts,
    options.unitsConsumed
  );

  // Budget instructions first — a compute budget applies to the whole
  // transaction regardless of position, but keeping them at the front matches
  // convention and keeps the decoded instruction list readable.
  const transaction = new Transaction();
  transaction.feePayer = wallet.publicKey;
  transaction.add(...computeBudgetInstructions, ...instructions);

  // Fresh blockhash right before signing, so as little of the validity window
  // as possible is spent before the wallet prompts. 'confirmed' avoids handing
  // over one that is already ~31 blocks old.
  const startFreshBlockhash = Date.now();
  const { blockhash, lastValidBlockHeight } = await getSendableBlockhash(connection);
  console.log(
    `${tag} Got fresh blockhash:`,
    blockhash,
    'valid through block',
    lastValidBlockHeight,
    'in',
    Date.now() - startFreshBlockhash,
    'ms'
  );
  transaction.recentBlockhash = blockhash;

  // Sign only, then broadcast via the app's connection. The wallet never sends,
  // so it doesn't need to be pointed at this network's RPC — the app always
  // submits to the configured endpoint. This also avoids the "Plugin Closed"
  // errors some wallets throw on send.
  console.log(`${tag} Requesting wallet signature`);
  const startSign = Date.now();
  const signedTransaction = await wallet.signTransaction(transaction);
  console.log(`${tag} Signed in`, Date.now() - startSign, 'ms');
  options.onSigned?.();

  return sendAndConfirm(connection, signedTransaction, lastValidBlockHeight, {
    label: options.label,
  });
}
