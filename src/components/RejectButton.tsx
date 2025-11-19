'use client';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Button } from './ui/button';
import * as multisig from '@sqds/multisig';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { toast } from 'sonner';
import { useMultisigData } from '@/hooks/useMultisigData';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';

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

      // Get FRESH blockhash right before sending (after user sees the simulation success)
      // This minimizes the time between getting blockhash and wallet approval
      console.log('[RejectButton] Fetching FRESH blockhash for sending');
      const startFreshBlockhash = Date.now();
      const { blockhash: freshBlockhash } = await connection.getLatestBlockhash('finalized');
      console.log(
        '[RejectButton] Got fresh blockhash:',
        freshBlockhash,
        'in',
        Date.now() - startFreshBlockhash,
        'ms'
      );
      transaction.recentBlockhash = freshBlockhash;

      // If simulation passes, send the transaction with fresh blockhash
      console.log('[RejectButton] Sending transaction to wallet for approval');
      const startSend = Date.now();
      signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });
      console.log(
        '[RejectButton] Transaction sent! Signature:',
        signature,
        'Time to sign:',
        Date.now() - startSend,
        'ms'
      );

      toast.loading('Confirming rejection...', {
        id: 'transaction',
      });

      console.log('[RejectButton] Waiting for confirmation');
      const startConfirm = Date.now();
      const confirmations = await waitForConfirmation(connection, [signature], 30000);
      console.log(
        '[RejectButton] Confirmation result:',
        confirmations,
        'Time to confirm:',
        Date.now() - startConfirm,
        'ms'
      );

      // Check if transaction failed
      const status = confirmations[0];
      if (!status || status.err !== null) {
        if (!status) {
          // Try to fetch transaction info for more details
          const txInfo = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0,
          });
          if (!txInfo) {
            throw new Error(`Transaction not found on chain. Signature: ${signature}`);
          }
          throw new Error(`Transaction not confirmed. Check explorer for signature: ${signature}`);
        }
        if (status.err) {
          const errorStr = JSON.stringify(status.err);
          if (errorStr.includes('InstructionError')) {
            throw new Error(
              `Transaction failed with instruction error. Check explorer for signature: ${signature}`
            );
          }
          throw new Error(`Transaction failed: ${errorStr}`);
        }
        throw new Error(`Transaction failed. Check explorer for signature: ${signature}`);
      }

      // Invalidate all relevant queries to refresh data
      console.log('[RejectButton] Invalidating queries');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
      ]);

      // Force a page reload after a short delay to ensure all data is fresh
      console.log('[RejectButton] Scheduling page reload');
      setTimeout(() => {
        window.location.reload();
      }, 1500);

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
