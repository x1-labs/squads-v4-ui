'use client';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { getSendableBlockhash, sendAndConfirm } from '../lib/transaction/sendAndConfirm';
import { buildComputeBudgetInstructions } from '../lib/transaction/priorityFee';

type RejectButtonProps = {
  multisigPda: string;
  transactionIndex: number;
  proposalStatus: string;
  programId: string;
};

const RejectButton = ({
  multisigPda,
  transactionIndex,
  proposalStatus,
  programId,
}: RejectButtonProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();

  const { connection } = useMultisigData();
  const queryClient = useQueryClient();

  const validKinds = ['None', 'Active', 'Draft'];
  const isKindValid = validKinds.includes(proposalStatus);

  const rejectTransaction = async () => {
    console.log('[RejectButton] Starting rejection process', {
      multisigPda,
      transactionIndex,
      proposalStatus,
      wallet: wallet.publicKey?.toBase58(),
    });

    if (!wallet.publicKey) {
      walletModal.setVisible(true);
      throw new Error('Wallet not connected');
    }
    let bigIntTransactionIndex = BigInt(transactionIndex);

    if (!isKindValid) {
      toast.error("You can't reject this proposal.");
      return;
    }

    let signature;
    try {
      console.log('[RejectButton] Building transaction');

      // Build transaction WITHOUT blockhash first for simulation
      const transaction = new Transaction();
      transaction.feePayer = wallet.publicKey;

      if (proposalStatus === 'None') {
        const createProposalInstruction = multisig.instructions.proposalCreate({
          multisigPda: new PublicKey(multisigPda),
          creator: wallet.publicKey,
          isDraft: false,
          transactionIndex: bigIntTransactionIndex,
          rentPayer: wallet.publicKey,
          programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
        });
        transaction.add(createProposalInstruction);
      }
      if (proposalStatus == 'Draft') {
        const activateProposalInstruction = multisig.instructions.proposalActivate({
          multisigPda: new PublicKey(multisigPda),
          member: wallet.publicKey,
          transactionIndex: bigIntTransactionIndex,
          programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
        });
        transaction.add(activateProposalInstruction);
      }
      const rejectProposalInstruction = multisig.instructions.proposalReject({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        transactionIndex: bigIntTransactionIndex,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });

      transaction.add(rejectProposalInstruction);

      // Get blockhash for simulation only
      console.log('[RejectButton] Fetching blockhash for simulation');
      const { blockhash: simBlockhash } = await connection.getLatestBlockhash('confirmed');
      console.log('[RejectButton] Got simulation blockhash:', simBlockhash);
      transaction.recentBlockhash = simBlockhash;

      // First simulate to catch errors early
      console.log('[RejectButton] Simulating transaction');
      const simulation = await connection.simulateTransaction(transaction);
      console.log('[RejectButton] Simulation result:', simulation.value);

      if (simulation.value.err) {
        console.error('Simulation error:', simulation.value.err);

        // Parse error logs for meaningful messages
        const logs = simulation.value.logs || [];
        const errorLog = logs.find(
          (log) =>
            log.includes('Error') ||
            log.includes('failed') ||
            log.includes('NotAuthorized') ||
            log.includes('AnchorError')
        );

        if (errorLog) {
          // Extract error details from Anchor errors
          const anchorErrorMatch = errorLog.match(
            /Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.+?)(?:\.|$)/
          );
          if (anchorErrorMatch) {
            throw new Error(`${anchorErrorMatch[3]} (Code: ${anchorErrorMatch[1]})`);
          }

          // Check for authorization errors
          if (errorLog.includes('NotAuthorized') || errorLog.includes('Not authorized')) {
            throw new Error(
              'Not authorized to perform this action. You may not be a member of this multisig.'
            );
          }

          throw new Error(errorLog);
        }

        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }

      // Price the transaction against what recently landed on the accounts it
      // writes to, and size the compute limit to what simulation just measured.
      const actualProgramId = programId ? new PublicKey(programId) : multisig.PROGRAM_ID;
      const [proposalPda] = multisig.getProposalPda({
        multisigPda: new PublicKey(multisigPda),
        transactionIndex: bigIntTransactionIndex,
        programId: actualProgramId,
      });
      const computeBudgetInstructions = await buildComputeBudgetInstructions(
        connection,
        [proposalPda, new PublicKey(multisigPda)],
        simulation.value.unitsConsumed
      );

      const finalTransaction = new Transaction();
      finalTransaction.feePayer = wallet.publicKey;
      finalTransaction.add(...computeBudgetInstructions, ...transaction.instructions);

      // Get FRESH blockhash right before sending (after user sees the simulation
      // success). 'confirmed' avoids spending ~12s of the validity window on a
      // blockhash that is already 31 blocks old.
      console.log('[RejectButton] Fetching FRESH blockhash for sending');
      const startFreshBlockhash = Date.now();
      const { blockhash: freshBlockhash, lastValidBlockHeight } =
        await getSendableBlockhash(connection);
      console.log(
        '[RejectButton] Got fresh blockhash:',
        freshBlockhash,
        'valid through block',
        lastValidBlockHeight,
        'in',
        Date.now() - startFreshBlockhash,
        'ms'
      );
      finalTransaction.recentBlockhash = freshBlockhash;

      // If simulation passes, sign with the wallet and broadcast via the app's
      // connection. Signing only (instead of wallet.sendTransaction) means the
      // wallet never broadcasts, so it doesn't need to be pointed at this
      // network's RPC — the app always submits to the configured endpoint. This
      // also avoids the "Plugin Closed" errors some wallets throw on send.
      console.log('[RejectButton] Requesting wallet signature');
      if (!wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      const startSend = Date.now();
      const signedTransaction = await wallet.signTransaction(finalTransaction);
      console.log('[RejectButton] Signed in', Date.now() - startSend, 'ms');

      toast.loading('Confirming rejection...', {
        id: 'transaction',
      });

      // Sends, then rebroadcasts every 2s until the signature confirms or the
      // blockhash expires. Throws TransactionFailedError / TransactionExpiredError.
      signature = await sendAndConfirm(connection, signedTransaction, lastValidBlockHeight, {
        label: 'RejectButton',
      });

      // Invalidate all relevant queries to refresh data
      console.log('[RejectButton] Invalidating queries');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
      ]);

      // Return success with signature
      console.log('[RejectButton] Rejection completed successfully');
      return { success: true, signature };
    } catch (error: any) {
      console.error('[RejectButton] Rejection error:', error);
      console.error('[RejectButton] Error stack:', error?.stack);

      // Check for common errors
      if (error.message?.includes('blockhash not found')) {
        throw new Error('Transaction expired. Please try again.');
      }

      if (error.message?.includes('insufficient funds')) {
        throw new Error('Insufficient funds for transaction fees.');
      }

      if (error.message?.includes('User rejected')) {
        throw new Error('Transaction cancelled by user.');
      }

      // Re-throw with better context
      throw error;
    }
  };
  return (
    <Button
      disabled={!isKindValid}
      onClick={() =>
        toast.promise(rejectTransaction, {
          id: 'transaction',
          loading: 'Preparing rejection...',
          success: (result) => {
            // Handle the success result properly
            if (result?.signature) {
              console.log('Rejection successful with signature:', result.signature);
              return 'Proposal rejected successfully!';
            }
            return 'Proposal rejected.';
          },
          error: (error) => {
            // Extract error message properly
            const errorMessage = error?.message || error?.toString() || 'Failed to reject';

            // Log full error for debugging
            console.error('Full rejection error:', error);

            // Return formatted error message
            if (errorMessage.length > 200) {
              return errorMessage.substring(0, 200) + '...';
            }
            return errorMessage;
          },
        })
      }
      className="h-8 px-3 text-sm"
      variant="destructive"
    >
      Reject
    </Button>
  );
};

export default RejectButton;
