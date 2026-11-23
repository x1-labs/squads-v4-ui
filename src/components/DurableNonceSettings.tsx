import { LAMPORTS_PER_SOL, NONCE_ACCOUNT_LENGTH } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { AddressWithButtons } from './AddressWithButtons';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useNativeSymbol } from '@/hooks/useNativeSymbol';
import {
  closeNonceAccountInstruction,
  createNonceAccountInstructions,
  fetchDurableNonce,
} from '../lib/transaction/durableNonce';
import { describeSendError, signSendAndConfirm } from '../lib/transaction/signSendAndConfirm';
import { toastSteps } from '../lib/transaction/toastSteps';

const formatAmount = (lamports: number) =>
  (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, { maximumFractionDigits: 6 });

/**
 * Turn durable nonce signing on or off for the connected wallet on this
 * network. With a nonce account, every transaction the app asks the wallet to
 * sign stays valid until it lands, instead of expiring ~150 blocks after its
 * blockhash (~33s on Solana mainnet), which a hardware wallet can miss.
 */
const DurableNonceSettings = () => {
  const wallet = useWallet();
  const { connection } = useMultisigData();
  const symbol = useNativeSymbol();
  const queryClient = useQueryClient();
  const owner = wallet.publicKey?.toBase58();
  const queryKey = ['durable-nonce', connection.rpcEndpoint, owner];

  const nonce = useQuery({
    queryKey,
    queryFn: () => fetchDurableNonce(connection, wallet.publicKey!),
    enabled: !!wallet.publicKey,
  });
  const rent = useQuery({
    queryKey: ['rent-exemption', connection.rpcEndpoint, NONCE_ACCOUNT_LENGTH],
    queryFn: () => connection.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH),
    staleTime: Infinity,
  });

  const run = (label: string, action: () => Promise<unknown>, success: string) =>
    toast.promise(
      (async () => {
        try {
          await action();
        } catch (error) {
          console.error(`[DurableNonce] ${label} failed:`, error);
          throw new Error(describeSendError(error));
        } finally {
          await queryClient.invalidateQueries({ queryKey });
        }
      })(),
      {
        id: 'transaction',
        loading: `${label}...`,
        success,
        error: (error) => error?.message ?? `${label} failed`,
      }
    );

  // Both go out with a blockhash: setup because there is no nonce yet, and
  // close because a nonce account cannot be emptied in the transaction that
  // advances it.
  const setUp = () =>
    run(
      'Setting up durable nonce signing',
      async () => {
        const { instructions } = await createNonceAccountInstructions(
          connection,
          wallet.publicKey!
        );
        await signSendAndConfirm(connection, wallet, instructions, {
          label: 'DurableNonceSetup',
          useDurableNonce: false,
          onStep: toastSteps(),
        });
      },
      'Durable nonce signing is on.'
    );

  const turnOff = () =>
    run(
      'Turning off durable nonce signing',
      async () => {
        if (!nonce.data) throw new Error('No nonce account to close.');
        await signSendAndConfirm(connection, wallet, [closeNonceAccountInstruction(nonce.data)], {
          label: 'DurableNonceClose',
          useDurableNonce: false,
          onStep: toastSteps(),
        });
      },
      'Durable nonce signing is off, and the rent was returned.'
    );

  if (!wallet.publicKey) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a wallet to set up durable nonce signing for it.
      </p>
    );
  }
  if (nonce.isLoading) return <p className="text-sm text-muted-foreground">Checking...</p>;
  if (nonce.isError) {
    return (
      <p className="text-sm text-red-500">
        Could not read the nonce account: {String(nonce.error)}
      </p>
    );
  }

  if (nonce.data) {
    return (
      <div className="space-y-3 text-sm">
        <p>
          <span className="font-medium text-green-600 dark:text-green-400">On</span> for this
          wallet. Transactions you sign here do not expire while your wallet is open.
        </p>
        <AddressWithButtons address={nonce.data.address.toBase58()} label="Account" />
        <Button variant="outline" onClick={turnOff}>
          Turn off and reclaim {formatAmount(nonce.data.lamports)} {symbol}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        A transaction normally expires about 150 blocks after it is built. On a fast network that is
        roughly 30 seconds, which a hardware wallet can miss. With durable nonce signing on,
        transactions you sign stay valid until they land.
      </p>
      <p className="text-muted-foreground">
        Creates a nonce account owned by this wallet on this network
        {rent.data !== undefined
          ? `, holding ${formatAmount(rent.data)} ${symbol} of rent that comes back when you turn it off`
          : ''}
        .
      </p>
      <Button onClick={setUp}>Turn on</Button>
    </div>
  );
};

export default DurableNonceSettings;
