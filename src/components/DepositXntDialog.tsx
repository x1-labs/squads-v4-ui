import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { toast } from 'sonner';
import { useMultisigData } from '../hooks/useMultisigData';
import { useStakePools } from '../hooks/useStakePools';
import { useBalance, useMultisig } from '../hooks/useServices';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';
import {
  STAKE_POOL_PROGRAM_ID,
  findWithdrawAuthority,
  getPoolTokenAccount,
  calculatePoolTokensReceived,
} from '../lib/staking/stakePoolUtils';
import { useAccess } from '../hooks/useAccess';

export function DepositXntDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [selectedPool, setSelectedPool] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const wallet = useWallet();
  const walletModal = useWalletModal();
  const {
    connection,
    programId: multisigProgramId,
    multisigAddress,
    vaultIndex,
  } = useMultisigData();
  const { data: stakePools, isLoading: poolsLoading } = useStakePools();
  const { data: solBalance } = useBalance();
  const { data: multisigInfo } = useMultisig();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const maxAmount = solBalance ? solBalance / LAMPORTS_PER_SOL : 0;

  const selectedPoolInfo = stakePools?.find((p) => p.address === selectedPool);
  const estimatedTokens =
    selectedPoolInfo && isAmountValid ? calculatePoolTokensReceived(parsedAmount) : 0;

  const handleDeposit = async () => {
    if (!wallet.publicKey || !multisigAddress || !selectedPoolInfo || !multisigInfo) {
      return;
    }

    setIsSubmitting(true);
    try {
      const vaultAddress = multisig.getVaultPda({
        index: vaultIndex,
        multisigPda: new PublicKey(multisigAddress),
        programId: multisigProgramId ? new PublicKey(multisigProgramId) : multisig.PROGRAM_ID,
      })[0];

      const stakePoolAddress = new PublicKey(selectedPoolInfo.address);
      const poolMint = new PublicKey(selectedPoolInfo.poolMint);
      const reserveStake = new PublicKey(selectedPoolInfo.reserveStake);

      // Get withdraw authority PDA
      const [withdrawAuthority] = await findWithdrawAuthority(stakePoolAddress);

      // Get or create pool token account for vault
      const destinationPoolAccount = await getPoolTokenAccount(vaultAddress, poolMint);

      // Get manager fee account (using vault as fee recipient for simplicity)
      const managerFeeAccount = await getPoolTokenAccount(vaultAddress, poolMint);

      // Create depositSol instruction
      const depositSolIx: TransactionInstruction = {
        programId: STAKE_POOL_PROGRAM_ID,
        keys: [
          { pubkey: stakePoolAddress, isSigner: false, isWritable: true },
          { pubkey: withdrawAuthority, isSigner: false, isWritable: false },
          { pubkey: reserveStake, isSigner: false, isWritable: true },
          { pubkey: vaultAddress, isSigner: true, isWritable: true }, // funding account
          { pubkey: destinationPoolAccount, isSigner: false, isWritable: true },
          { pubkey: managerFeeAccount, isSigner: false, isWritable: true },
          { pubkey: poolMint, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
          Buffer.from([14]), // depositSol instruction discriminator
          Buffer.from(
            new Uint8Array(new BigUint64Array([BigInt(parsedAmount * LAMPORTS_PER_SOL)]).buffer)
          ),
        ]),
      };

      const blockhash = (await connection.getLatestBlockhash()).blockhash;

      // Create the transaction message for the vault
      const depositMessage = new TransactionMessage({
        instructions: [depositSolIx],
        payerKey: vaultAddress,
        recentBlockhash: blockhash,
      });

      const transactionIndex = BigInt(Number(multisigInfo.transactionIndex) + 1);

      // Create multisig instructions
      const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
        multisigPda: new PublicKey(multisigAddress),
        creator: wallet.publicKey,
        ephemeralSigners: 0,
        // @ts-ignore - Type mismatch between @solana/web3.js versions
        transactionMessage: depositMessage,
        transactionIndex,
        addressLookupTableAccounts: [],
        rentPayer: wallet.publicKey,
        vaultIndex,
        programId: multisigProgramId ? new PublicKey(multisigProgramId) : multisig.PROGRAM_ID,
      });

      const proposalIx = multisig.instructions.proposalCreate({
        multisigPda: new PublicKey(multisigAddress),
        creator: wallet.publicKey,
        isDraft: false,
        transactionIndex,
        rentPayer: wallet.publicKey,
        programId: multisigProgramId ? new PublicKey(multisigProgramId) : multisig.PROGRAM_ID,
      });

      const approveIx = multisig.instructions.proposalApprove({
        multisigPda: new PublicKey(multisigAddress),
        member: wallet.publicKey,
        transactionIndex,
        programId: multisigProgramId ? new PublicKey(multisigProgramId) : multisig.PROGRAM_ID,
      });

      // Create and send transaction
      const message = new TransactionMessage({
        instructions: [multisigTransactionIx, proposalIx, approveIx],
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(message);

      const signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: true,
      });

      toast.loading('Confirming stake transaction...', { id: 'stake-transaction' });

      const confirmations = await waitForConfirmation(connection, [signature]);
      if (!confirmations[0]) {
        throw new Error(`Transaction failed or unable to confirm. Check ${signature}`);
      }

      toast.success(
        `Successfully proposed staking ${parsedAmount} XNT to ${selectedPoolInfo.name}`,
        {
          id: 'stake-transaction',
        }
      );

      // Reset form and close dialog
      setAmount('');
      setSelectedPool('');
      setIsOpen(false);

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['stakePools'] });
    } catch (error) {
      console.error('Error creating stake transaction:', error);
      toast.error(`Failed to stake: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        id: 'stake-transaction',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          disabled={!isMember}
          onClick={(e) => {
            if (!wallet.publicKey) {
              e.preventDefault();
              walletModal.setVisible(true);
              return;
            }
            setIsOpen(true);
          }}
        >
          Stake XNT
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Stake XNT</DialogTitle>
          <DialogDescription>
            Stake XNT to earn rewards. Select a pool and enter the amount to stake.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Available Balance</Label>
            <div className="text-2xl font-bold">{maxAmount.toFixed(4)} XNT</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pool">Select Stake Pool</Label>
            <Select value={selectedPool} onValueChange={setSelectedPool}>
              <SelectTrigger id="pool">
                <SelectValue placeholder="Choose a stake pool" />
              </SelectTrigger>
              <SelectContent>
                {poolsLoading ? (
                  <SelectItem value="loading" disabled>
                    Loading pools...
                  </SelectItem>
                ) : stakePools && stakePools.length > 0 ? (
                  stakePools.map((pool) => (
                    <SelectItem key={pool.address} value={pool.address}>
                      <div className="flex w-full items-center justify-between">
                        <span>{pool.name}</span>
                        <span className="ml-2 text-sm text-muted-foreground">APY: {pool.apy}%</span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    No pools available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount to Stake</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={maxAmount}
              step="0.01"
            />
            {amount && !isAmountValid && (
              <p className="text-sm text-destructive">Please enter a valid amount</p>
            )}
            {isAmountValid && parsedAmount > maxAmount && (
              <p className="text-sm text-destructive">Insufficient balance</p>
            )}
          </div>

          {selectedPoolInfo && isAmountValid && (
            <div className="space-y-1 rounded-lg bg-muted p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pool APY:</span>
                <span>{selectedPoolInfo.apy}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Est. Pool Tokens:</span>
                <span>{estimatedTokens.toFixed(4)}</span>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleDeposit}
            disabled={!selectedPool || !isAmountValid || parsedAmount > maxAmount || isSubmitting}
          >
            {isSubmitting ? 'Creating Proposal...' : 'Propose Stake Transaction'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
