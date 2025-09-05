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
import { useBalance, useMultisig } from '../hooks/useServices';
import { useQueryClient } from '@tanstack/react-query';
import { waitForConfirmation } from '../lib/transactionConfirmation';
import { stakePoolInfo, getStakePoolAccount, StakePoolInstruction } from '@x1-labs/spl-stake-pool';
import * as splToken from '@solana/spl-token';
import { useAccess } from '../hooks/useAccess';
import { createMemoInstruction } from '../lib/utils/memoInstruction';

export function DepositXntDialog() {
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
  const { data: solBalance } = useBalance();
  const { data: multisigInfo } = useMultisig();
  const queryClient = useQueryClient();
  const isMember = useAccess();

  const parsedAmount = parseFloat(amount);
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0;
  const maxAmount = solBalance ? solBalance / LAMPORTS_PER_SOL : 0;

  const selectedPoolInfo = stakePools?.find((p) => p.address === selectedPool);

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
      const lamports = Math.floor(parsedAmount * LAMPORTS_PER_SOL);

      // First get stake pool info
      const poolInfo = await stakePoolInfo(connection as any, stakePoolAddress);

      if (!poolInfo) {
        throw new Error('Failed to fetch stake pool info');
      }

      // Get pool mint from the stake pool info
      const poolMint = poolInfo.poolMint;

      // For multisig vaults, we need to create the deposit instruction directly
      // without the ephemeral transfer account that the library uses

      // Get the stake pool account data
      const stakePoolAccount = await getStakePoolAccount(connection as any, stakePoolAddress);
      const stakePool = stakePoolAccount.account.data;

      // Find or create the vault's token account for pool tokens
      let destinationTokenAccount: PublicKey;
      const tokenAccounts = await connection.getTokenAccountsByOwner(vaultAddress, {
        mint: stakePool.poolMint,
      });

      const depositInstructions = [];

      if (tokenAccounts.value.length > 0) {
        // Use the existing token account
        destinationTokenAccount = tokenAccounts.value[0].pubkey;
      } else {
        // Create associated token account for the vault
        destinationTokenAccount = await splToken.getAssociatedTokenAddress(
          stakePool.poolMint,
          vaultAddress,
          true // allowOwnerOffCurve - important for PDAs
        );

        depositInstructions.push(
          splToken.createAssociatedTokenAccountInstruction(
            wallet.publicKey, // payer
            destinationTokenAccount,
            vaultAddress, // owner
            stakePool.poolMint
          )
        );
      }

      // Get the withdraw authority PDA
      const [withdrawAuthority] = PublicKey.findProgramAddressSync(
        [stakePoolAddress.toBuffer(), Buffer.from('withdraw')],
        new PublicKey('XPoo1Fx6KNgeAzFcq2dPTo95bWGUSj5KdPVqYj9CZux')
      );

      // Create the deposit SOL instruction
      // For multisig vaults, the vault itself is the funding account
      depositInstructions.push(
        StakePoolInstruction.depositSol({
          programId: new PublicKey('XPoo1Fx6KNgeAzFcq2dPTo95bWGUSj5KdPVqYj9CZux'),
          stakePool: stakePoolAddress,
          reserveStake: stakePool.reserveStake,
          fundingAccount: vaultAddress, // Vault is the source of funds
          destinationPoolAccount: destinationTokenAccount,
          managerFeeAccount: stakePool.managerFeeAccount,
          referralPoolAccount: destinationTokenAccount, // No referrer
          poolMint: stakePool.poolMint,
          lamports,
          withdrawAuthority,
          depositAuthority: undefined,
        })
      );

      console.log('=== DEPOSIT TRANSACTION DEBUG ===');
      console.log('Vault address:', vaultAddress.toBase58());
      console.log('Stake pool address:', stakePoolAddress.toBase58());
      console.log('Lamports:', lamports);
      console.log(
        'Destination token account:',
        destinationTokenAccount?.toBase58() || 'will be created'
      );
      console.log('Number of deposit instructions:', depositInstructions.length);
      depositInstructions.forEach((ix, i) => {
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
        console.log('  Data (hex):', ix.data.toString('hex'));
      });

      const blockhash = (await connection.getLatestBlockhash()).blockhash;

      // Create the transaction message for the vault
      const depositMessage = new TransactionMessage({
        instructions: depositInstructions,
        payerKey: vaultAddress,
        recentBlockhash: blockhash,
      });

      console.log('Transaction message payer:', vaultAddress.toBase58());
      console.log('Blockhash:', blockhash);

      // Add memo instruction if provided
      const memoInstruction = createMemoInstruction(memo, vaultAddress);
      if (memoInstruction) {
        depositInstructions.push(memoInstruction);
        console.log('Added memo instruction:', memo);
      }

      const transactionIndex = BigInt(Number(multisigInfo.transactionIndex) + 1);

      // Create multisig instructions
      // For multisig vault transactions, the vault needs to sign
      // Check if vault is a signer in any of the instructions
      let vaultNeedsToSign = false;
      depositInstructions.forEach((ix) => {
        ix.keys.forEach((key: any) => {
          if (key.isSigner && key.pubkey.equals(vaultAddress)) {
            vaultNeedsToSign = true;
            console.log('Vault needs to sign for instruction:', ix.programId.toBase58());
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
      setMemo('');
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
          Stake
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Stake XNT</DialogTitle>
          <DialogDescription>
            Stake to earn rewards. Select a pool and enter the amount to stake.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Available Balance</Label>
            <div className="text-2xl font-bold">
              {maxAmount.toLocaleString(undefined, {
                maximumFractionDigits: 4,
                minimumFractionDigits: 0,
              })}{' '}
              XNT
            </div>
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
                      <span>{pool.name}</span>
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

          <div className="space-y-2">
            <Label htmlFor="memo">Memo (optional)</Label>
            <Textarea
              id="memo"
              placeholder="Add a note about this stake transaction..."
              value={memo}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMemo(e.target.value)}
              className="resize-none"
              rows={2}
            />
          </div>

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
