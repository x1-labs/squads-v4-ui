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
import { Textarea } from './ui/textarea';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { toast } from 'sonner';
import { useMultisigData } from '../hooks/useMultisigData';
import { useStakePools } from '../hooks/useStakePools';
import { useMultisig } from '../hooks/useServices';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';
import { stakePoolInfo, getStakePoolAccount, StakePoolInstruction } from '@x1-labs/spl-stake-pool';
import * as splToken from '@solana/spl-token';
import { useAccess } from '../hooks/useAccess';
import { createMemoInstruction } from '../lib/utils/memoInstruction';

export function WithdrawXntDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [selectedPool, setSelectedPool] = useState('');
  const [memo, setMemo] = useState('');
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
      const poolTokenAmount = Math.floor(parsedAmount * 1e9); // Pool tokens in smallest units

      // Get the stake pool account data
      const stakePoolAccount = await getStakePoolAccount(connection as any, stakePoolAddress);
      const stakePool = stakePoolAccount.account.data;

      // Find the vault's token account for pool tokens
      const tokenAccounts = await connection.getTokenAccountsByOwner(vaultAddress, {
        mint: stakePool.poolMint,
      });

      if (tokenAccounts.value.length === 0) {
        throw new Error('No pool token account found for vault');
      }

      const poolTokenAccount = tokenAccounts.value[0].pubkey;

      // Get the withdraw authority PDA
      const [withdrawAuthority] = PublicKey.findProgramAddressSync(
        [stakePoolAddress.toBuffer(), Buffer.from('withdraw')],
        new PublicKey('XPoo1Fx6KNgeAzFcq2dPTo95bWGUSj5KdPVqYj9CZux')
      );

      // Create the withdraw SOL instruction
      const withdrawInstructions = [
        StakePoolInstruction.withdrawSol({
          programId: new PublicKey('XPoo1Fx6KNgeAzFcq2dPTo95bWGUSj5KdPVqYj9CZux'),
          stakePool: stakePoolAddress,
          sourcePoolAccount: poolTokenAccount,
          withdrawAuthority,
          reserveStake: stakePool.reserveStake,
          destinationSystemAccount: vaultAddress, // Vault receives the SOL
          sourceTransferAuthority: vaultAddress, // Vault owns the pool tokens
          solWithdrawAuthority: undefined,
          managerFeeAccount: stakePool.managerFeeAccount,
          poolMint: stakePool.poolMint,
          poolTokens: poolTokenAmount,
        }),
      ];

      console.log('=== WITHDRAW TRANSACTION DEBUG ===');
      console.log('Vault address:', vaultAddress.toBase58());
      console.log('Stake pool address:', stakePoolAddress.toBase58());
      console.log('Pool token amount:', poolTokenAmount);
      console.log('Pool token account:', poolTokenAccount.toBase58());
      console.log('Number of withdraw instructions:', withdrawInstructions.length);

      withdrawInstructions.forEach((ix, i) => {
        console.log(`Instruction ${i}:`);
        console.log('  Program ID:', ix.programId.toBase58());
        console.log('  Keys:');
        ix.keys.forEach((k: any, idx: number) => {
          console.log(`    [${idx}] ${k.pubkey.toBase58()}`);
          console.log(`        isSigner: ${k.isSigner}, isWritable: ${k.isWritable}`);
          if (k.isSigner) {
            console.log(`        ⚠️ This account needs to sign!`);
          }
        });
      });

      const blockhash = (await connection.getLatestBlockhash()).blockhash;

      // Add memo instruction if provided
      const memoInstruction = createMemoInstruction(memo, vaultAddress);
      if (memoInstruction) {
        withdrawInstructions.push(memoInstruction);
      }

      // Create the transaction message for the vault
      const withdrawMessage = new TransactionMessage({
        instructions: withdrawInstructions,
        payerKey: vaultAddress,
        recentBlockhash: blockhash,
      });

      const transactionIndex = BigInt(Number(multisigInfo.transactionIndex) + 1);

      // Create multisig instructions
      // For multisig vault transactions, check if vault needs to sign
      let vaultNeedsToSign = false;
      withdrawInstructions.forEach((ix) => {
        ix.keys.forEach((key: any) => {
          if (key.isSigner && key.pubkey.equals(vaultAddress)) {
            vaultNeedsToSign = true;
            console.log('Vault needs to sign for withdraw instruction');
          }
        });
      });

      console.log('Vault needs to sign:', vaultNeedsToSign);
      console.log('Setting ephemeralSigners to:', vaultNeedsToSign ? 1 : 0);

      const multisigTransactionIx = multisig.instructions.vaultTransactionCreate({
        multisigPda: new PublicKey(multisigAddress),
        creator: wallet.publicKey,
        ephemeralSigners: vaultNeedsToSign ? 1 : 0,
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
      setMemo('');
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
          Unstake
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
                          Staked:{' '}
                          {pool.userBalance?.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                            minimumFractionDigits: 0,
                          })}{' '}
                          tokens
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
                {selectedPoolInfo.userBalance?.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                  minimumFractionDigits: 0,
                })}{' '}
                Pool Tokens
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

          <div className="space-y-2">
            <Label htmlFor="memo">Memo (optional)</Label>
            <Textarea
              id="memo"
              placeholder="Add a note about this unstake transaction..."
              value={memo}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMemo(e.target.value)}
              className="resize-none"
              rows={2}
            />
          </div>

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
