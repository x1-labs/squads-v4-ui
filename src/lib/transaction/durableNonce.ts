import { NONCE_ACCOUNT_LENGTH, NonceAccount, PublicKey, SystemProgram } from '@solana/web3.js';
import type { Connection, TransactionInstruction } from '@solana/web3.js';

/**
 * Durable nonces: a transaction lifetime that does not expire.
 *
 * A normal transaction carries a recent blockhash and dies 150 blocks later.
 * On Solana mainnet that is about 33s (4.5 blocks/s, measured 2026-11-23), too
 * short for a hardware wallet that needs unlocking. A durable-nonce transaction
 * carries the value stored in a nonce account instead, plus an
 * `AdvanceNonceAccount` instruction first. It stays valid until that nonce is
 * advanced, which only happens when a transaction using it lands, so the
 * signer can take as long as they need.
 *
 * Each wallet gets one nonce account, derived from the wallet and a fixed seed,
 * so the app never has to remember its address. The wallet is its authority.
 */

/** Seed for `createWithSeed`. Changing it orphans every existing nonce account. */
export const NONCE_SEED = 'squads-ui-durable-nonce';

/** The nonce account for `authority`, whether or not it exists yet. */
export function nonceAccountAddress(authority: PublicKey): Promise<PublicKey> {
  return PublicKey.createWithSeed(authority, NONCE_SEED, SystemProgram.programId);
}

/** A nonce account that `authority` controls, and the value a transaction should carry. */
export type DurableNonce = {
  address: PublicKey;
  authority: PublicKey;
  /** Goes in the transaction's `recentBlockhash` slot. */
  nonce: string;
  /** Account balance, so the account can be closed for its full rent. */
  lamports: number;
  /**
   * Slot the value was read at. Later reads pass it as `minContextSlot`, so a
   * load-balanced RPC node that is behind errors out instead of answering with
   * an older nonce, which would look like this one had been used.
   */
  contextSlot: number;
};

/**
 * The last nonce value each nonce account was seen to spend on this page.
 *
 * A load-balanced RPC can route the read for the next transaction (e.g. the
 * second execute of a batch) to a node that has not caught up with the one
 * that just landed. That node still reports the spent value, and a transaction
 * signed with it can never land. Remembering the spent value lets the read
 * recognize the stale answer and ask again.
 */
const spentNonces = new Map<string, string>();

/** Record that a transaction carrying `nonce` landed, so it is never reused. */
export function markNonceSpent(address: PublicKey, nonce: string): void {
  spentNonces.set(address.toBase58(), nonce);
}

/** Forget every spent nonce. For tests, which share one wallet across cases. */
export function forgetSpentNonces(): void {
  spentNonces.clear();
}

/** How many times to re-read a nonce the RPC still reports as the spent value. */
const STALE_NONCE_RETRIES = 6;
const STALE_NONCE_RETRY_MS = 500;

/** Thrown when the RPC keeps reporting a nonce this page already spent. */
export class StaleNonceError extends Error {
  constructor(address: PublicKey) {
    super(
      `The RPC still reports the durable nonce ${address.toBase58()} as it was before the ` +
        'last transaction landed.'
    );
    this.name = 'StaleNonceError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The wallet's nonce account, or null if it has none.
 *
 * Read at 'confirmed', the same bar `sendAndConfirm` uses for landing. If the
 * value is one this page already spent (see `spentNonces`), the node answering
 * is behind; the read is retried for a few seconds, then `StaleNonceError`.
 *
 * An account at the derived address that is not an initialized nonce owned by
 * `authority` is ignored with a warning rather than used, since a transaction
 * built on it could never land.
 */
export async function fetchDurableNonce(
  connection: Connection,
  authority: PublicKey
): Promise<DurableNonce | null> {
  const address = await nonceAccountAddress(authority);
  const spent = spentNonces.get(address.toBase58());
  for (let attempt = 0; ; attempt++) {
    const nonce = await readDurableNonce(connection, authority, address);
    if (!nonce || nonce.nonce !== spent) return nonce;
    if (attempt >= STALE_NONCE_RETRIES) throw new StaleNonceError(address);
    console.log(`[durableNonce] RPC still reports the spent nonce, re-reading (${attempt + 1})`);
    await sleep(STALE_NONCE_RETRY_MS);
  }
}

async function readDurableNonce(
  connection: Connection,
  authority: PublicKey,
  address: PublicKey
): Promise<DurableNonce | null> {
  const { context, value: info } = await connection.getAccountInfoAndContext(address, 'confirmed');
  if (!info) return null;
  if (!info.owner.equals(SystemProgram.programId) || info.data.length !== NONCE_ACCOUNT_LENGTH) {
    console.warn('[durableNonce] Account at the nonce address is not a nonce account', {
      address: address.toBase58(),
      owner: info.owner.toBase58(),
      size: info.data.length,
    });
    return null;
  }
  let account: NonceAccount;
  try {
    account = NonceAccount.fromAccountData(info.data);
  } catch (error) {
    console.warn('[durableNonce] Nonce account is not initialized', address.toBase58(), error);
    return null;
  }
  if (!account.authorizedPubkey.equals(authority)) {
    console.warn('[durableNonce] Nonce account has a different authority', {
      address: address.toBase58(),
      authority: account.authorizedPubkey.toBase58(),
    });
    return null;
  }
  return {
    address,
    authority,
    nonce: account.nonce,
    lamports: info.lamports,
    contextSlot: context.slot,
  };
}

/** The instruction every durable-nonce transaction must start with. */
export function advanceNonceInstruction(nonce: DurableNonce): TransactionInstruction {
  return SystemProgram.nonceAdvance({
    noncePubkey: nonce.address,
    authorizedPubkey: nonce.authority,
  });
}

/** Create the wallet's nonce account and make the wallet its authority. */
export async function createNonceAccountInstructions(
  connection: Connection,
  authority: PublicKey
): Promise<{ instructions: TransactionInstruction[]; address: PublicKey; lamports: number }> {
  const address = await nonceAccountAddress(authority);
  const lamports = await connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
  return {
    address,
    lamports,
    instructions: [
      SystemProgram.createAccountWithSeed({
        fromPubkey: authority,
        basePubkey: authority,
        seed: NONCE_SEED,
        newAccountPubkey: address,
        lamports,
        space: NONCE_ACCOUNT_LENGTH,
        programId: SystemProgram.programId,
      }),
      SystemProgram.nonceInitialize({ noncePubkey: address, authorizedPubkey: authority }),
    ],
  };
}

/**
 * Withdraw the whole balance, which closes the account and returns the rent.
 * Must be sent with a blockhash, not the nonce itself: advancing and then
 * emptying the account in one transaction fails, because a nonce account can
 * only be emptied while its stored value is older than the current blockhash.
 */
export function closeNonceAccountInstruction(nonce: DurableNonce): TransactionInstruction {
  return SystemProgram.nonceWithdraw({
    noncePubkey: nonce.address,
    authorizedPubkey: nonce.authority,
    toPubkey: nonce.authority,
    lamports: nonce.lamports,
  });
}
