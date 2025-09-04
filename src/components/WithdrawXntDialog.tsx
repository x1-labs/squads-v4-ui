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
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { toast } from 'sonner';
import { useMultisigData } from '../hooks/useMultisigData';
import { useStakePools } from '../hooks/useStakePools';
import { useMultisig } from '../hooks/useServices';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';
import {
  STAKE_POOL_PROGRAM_ID,
  findWithdrawAuthority,
  getPoolTokenAccount,
  calculateSolReceived,
} from '../lib/staking/stakePoolUtils';
import { useAccess } from '../hooks/useAccess';

export function WithdrawXntDialog() {
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
  const { data: multisigInfo } = useMultisig();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  // Filter pools that have staked balance
  const stakedPools = stakePools?.filter((p) => p.userBalance && p.userBalance > 0) || [];
  const selectedPoolInfo = stakedPools.find((p) => p.address === selectedPool);

  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const maxAmount = selectedPoolInfo?.userBalance || 0;
  const estimatedSol = selectedPoolInfo && isAmountValid ? calculateSolReceived(parsedAmount) : 0;

  const handleWithdraw = async () => {
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

      // Get pool token account for vault
      const poolTokenAccount = await getPoolTokenAccount(vaultAddress, poolMint);

      // Get manager fee account
      const managerFeeAccount = await getPoolTokenAccount(vaultAddress, poolMint);

      // Create withdrawSol instruction
      const withdrawSolIx: TransactionInstruction = {
        programId: STAKE_POOL_PROGRAM_ID,
        keys: [
          { pubkey: stakePoolAddress, isSigner: false, isWritable: true },
          { pubkey: withdrawAuthority, isSigner: false, isWritable: false },
          { pubkey: vaultAddress, isSigner: true, isWritable: false }, // user transfer authority
          { pubkey: poolTokenAccount, isSigner: false, isWritable: true }, // pool tokens from
          { pubkey: reserveStake, isSigner: false, isWritable: true },
          { pubkey: vaultAddress, isSigner: false, isWritable: true }, // lamports to
          { pubkey: managerFeeAccount, isSigner: false, isWritable: true },
          { pubkey: poolMint, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
          Buffer.from([15]), // withdrawSol instruction discriminator
          Buffer.from(new Uint8Array(new BigUint64Array([BigInt(parsedAmount * 1e9)]).buffer)), // Pool tokens in smallest units
        ]),
      };

      const blockhash = (await connection.getLatestBlockhash()).blockhash;

      // Create the transaction message for the vault
      const withdrawMessage = new TransactionMessage({
        instructions: [withdrawSolIx],
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
        transactionMessage: withdrawMessage,
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

      toast.loading('Confirming unstake transaction...', { id: 'unstake-transaction' });

      const confirmations = await waitForConfirmation(connection, [signature]);
      if (!confirmations[0]) {
        throw new Error(`Transaction failed or unable to confirm. Check ${signature}`);
      }

      toast.success(
        `Successfully proposed unstaking ${parsedAmount} pool tokens from ${selectedPoolInfo.name}`,
        {
          id: 'unstake-transaction',
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
      console.error('Error creating unstake transaction:', error);
      toast.error(
        `Failed to unstake: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          id: 'unstake-transaction',
        }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!isMember || stakedPools.length === 0}
          onClick={(e) => {
            if (!wallet.publicKey) {
              e.preventDefault();
              walletModal.setVisible(true);
              return;
            }
            setIsOpen(true);
          }}
        >
          Unstake XNT
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Unstake XNT</DialogTitle>
          <DialogDescription>
            Withdraw your staked XNT from a pool. Select a pool and enter the amount of pool tokens
            to burn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="pool">Select Staked Pool</Label>
            <Select value={selectedPool} onValueChange={setSelectedPool}>
              <SelectTrigger id="pool">
                <SelectValue placeholder="Choose a pool to unstake from" />
              </SelectTrigger>
              <SelectContent>
                {poolsLoading ? (
                  <SelectItem value="loading" disabled>
                    Loading pools...
                  </SelectItem>
                ) : stakedPools.length > 0 ? (
                  stakedPools.map((pool) => (
                    <SelectItem key={pool.address} value={pool.address}>
                      <div className="flex flex-col">
                        <span>{pool.name}</span>
                        <span className="text-sm text-muted-foreground">
                          Staked: {pool.userBalance?.toFixed(4)} tokens
                        </span>
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    No staked positions
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedPoolInfo && (
            <div className="space-y-2">
              <Label>Staked Balance</Label>
              <div className="text-2xl font-bold">
                {selectedPoolInfo.userBalance?.toFixed(4)} Pool Tokens
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">Pool Tokens to Burn</Label>
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
              <p className="text-sm text-destructive">Exceeds staked balance</p>
            )}
          </div>

          {selectedPoolInfo && isAmountValid && (
            <div className="space-y-1 rounded-lg bg-muted p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Est. XNT to Receive:</span>
                <span className="font-semibold">{estimatedSol.toFixed(4)} XNT</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Withdrawal Fee:</span>
                <span>0.1%</span>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-orange-50 p-3 dark:bg-orange-950">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              Note: Unstaking may have a cooldown period depending on the pool configuration.
            </p>
          </div>

          <Button
            className="w-full"
            onClick={handleWithdraw}
            disabled={!selectedPool || !isAmountValid || parsedAmount > maxAmount || isSubmitting}
          >
            {isSubmitting ? 'Creating Proposal...' : 'Propose Unstake Transaction'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
