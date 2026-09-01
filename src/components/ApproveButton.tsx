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

type ApproveButtonProps = {
  multisigPda: string;
  transactionIndex: number;
  proposalStatus: string;
  programId: string;
};

const ApproveButton = ({
  multisigPda,
  transactionIndex,
  proposalStatus,
  programId,
}: ApproveButtonProps) => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const validKinds = ['Rejected', 'Approved', 'Executing', 'Executed', 'Cancelled'];
  const isKindValid = validKinds.includes(proposalStatus || 'None');
  const { connection } = useMultisigData();
  const queryClient = useQueryClient();

  const approveProposal = async () => {
    console.log('[ApproveButton] Starting approval process', {
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
    const actualProgramId = programId ? new PublicKey(programId) : multisig.PROGRAM_ID;

    let signature;
    try {
      console.log('[ApproveButton] Building transaction');

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
          programId: actualProgramId,
        });
        transaction.add(createProposalInstruction);
      }
      if (proposalStatus == 'Draft') {
        const activateProposalInstruction = multisig.instructions.proposalActivate({
          multisigPda: new PublicKey(multisigPda),
          member: wallet.publicKey,
          transactionIndex: bigIntTransactionIndex,
          programId: actualProgramId,
        });
        transaction.add(activateProposalInstruction);
      }
      const approveProposalInstruction = multisig.instructions.proposalApprove({
        multisigPda: new PublicKey(multisigPda),
        member: wallet.publicKey,
        transactionIndex: bigIntTransactionIndex,
        programId: programId ? new PublicKey(programId) : multisig.PROGRAM_ID,
      });
      transaction.add(approveProposalInstruction);

      // Get blockhash for simulation only
      console.log('[ApproveButton] Fetching blockhash for simulation');
      const { blockhash: simBlockhash } = await connection.getLatestBlockhash('confirmed');
      console.log('[ApproveButton] Got simulation blockhash:', simBlockhash);
      transaction.recentBlockhash = simBlockhash;

      // First simulate to catch errors early
      console.log('[ApproveButton] Simulating transaction');
      const simulation = await connection.simulateTransaction(transaction);
      console.log('[ApproveButton] Simulation result:', simulation.value);

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

      // Rebuild with the budget instructions first — a compute budget applies to
      // the whole transaction regardless of position, but keeping them at the
      // front matches convention and keeps the decoded instruction list readable.
      const finalTransaction = new Transaction();
      finalTransaction.feePayer = wallet.publicKey;
      finalTransaction.add(...computeBudgetInstructions, ...transaction.instructions);

      // Get FRESH blockhash right before sending (after user sees the simulation
      // success). This minimizes the time between getting blockhash and wallet
      // approval, and 'confirmed' avoids spending ~12s of the validity window on
      // a blockhash that is already 31 blocks old.
      console.log('[ApproveButton] Fetching FRESH blockhash for sending');
      const startFreshBlockhash = Date.now();
      const { blockhash: freshBlockhash, lastValidBlockHeight } =
        await getSendableBlockhash(connection);
      console.log(
        '[ApproveButton] Got fresh blockhash:',
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
      console.log('[ApproveButton] Requesting wallet signature');
      if (!wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      const startSend = Date.now();
      const signedTransaction = await wallet.signTransaction(finalTransaction);
      console.log('[ApproveButton] Signed in', Date.now() - startSend, 'ms');

      toast.loading('Confirming approval...', {
        id: 'transaction',
      });

      // Sends, then rebroadcasts every 2s until the signature confirms or the
      // blockhash expires. Throws TransactionFailedError / TransactionExpiredError.
      signature = await sendAndConfirm(connection, signedTransaction, lastValidBlockHeight, {
        label: 'ApproveButton',
      });

      // Invalidate all relevant queries to refresh data
      console.log('[ApproveButton] Invalidating queries');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['multisig'] }),
        queryClient.invalidateQueries({ queryKey: ['proposal'] }),
        queryClient.invalidateQueries({ queryKey: ['transaction-details'] }),
      ]);

      // Return success with signature
      console.log('[ApproveButton] Approval completed successfully');
      return { success: true, signature };
    } catch (error: any) {
      console.error('[ApproveButton] Approval error:', error);
      console.error('[ApproveButton] Error stack:', error?.stack);

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
      disabled={isKindValid}
      onClick={() =>
        toast.promise(approveProposal, {
          id: 'transaction',
          loading: 'Preparing approval...',
          success: (result) => {
            // Handle the success result properly
            if (result?.signature) {
              console.log('Approval successful with signature:', result.signature);
              return 'Proposal approved successfully!';
            }
            return 'Proposal approved.';
          },
          error: (error) => {
            // Extract error message properly
            const errorMessage = error?.message || error?.toString() || 'Failed to approve';

            // Log full error for debugging
            console.error('Full approval error:', error);

            // Return formatted error message
            if (errorMessage.length > 200) {
              return errorMessage.substring(0, 200) + '...';
            }
            return errorMessage;
          },
        })
      }
      className="h-8 px-3 text-sm"
      variant="default"
    >
      Approve
    </Button>
  );
};

export default ApproveButton;
