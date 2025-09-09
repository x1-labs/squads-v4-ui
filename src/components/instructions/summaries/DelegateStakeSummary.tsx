import React, { useEffect, useState } from 'react';
import { InstructionSummaryProps } from '@/lib/instructions/types';
import { formatXNT } from '@/lib/utils/formatters';
import { AddressWithButtons } from '@/components/AddressWithButtons';
import { PublicKey } from '@solana/web3.js';
import { getValidatorInfo } from '@/lib/staking/validatorStakeUtils';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useExplorerUrl } from '@/hooks/useSettings';

/**
 * Summary component for Stake Delegate instructions
 */
export const DelegateStakeSummary: React.FC<InstructionSummaryProps> = ({
  instruction,
  connection,
}) => {
  const [validatorName, setValidatorName] = useState<string | null>(null);
  const [stakeAmount, setStakeAmount] = useState<string | null>(null);
  const { explorerUrl } = useExplorerUrl();

  // Get the stake account and vote account from the instruction
  const stakeAccount = instruction.args?.stakeAccount || instruction.accounts?.[0]?.pubkey;
  const voteAccount = instruction.args?.voteAccount || instruction.accounts?.[1]?.pubkey;

  useEffect(() => {
    const fetchValidatorInfo = async () => {
      if (!voteAccount) return;

      try {
        const voteAccountPubkey = new PublicKey(voteAccount);
        const info = await getValidatorInfo(connection, voteAccountPubkey);
        if (info?.name) {
          setValidatorName(info.name);
        }
      } catch (error) {
        console.error('Failed to fetch validator info:', error);
      }
    };

    const fetchStakeAccountBalance = async () => {
      if (!stakeAccount) return;

      try {
        const stakeAccountPubkey = new PublicKey(stakeAccount);
        const accountInfo = await connection.getAccountInfo(stakeAccountPubkey);
        if (accountInfo) {
          // Convert lamports to XNT
          setStakeAmount(formatXNT(accountInfo.lamports));
        }
      } catch (error) {
        console.error('Failed to fetch stake account balance:', error);
      }
    };

    fetchValidatorInfo();
    fetchStakeAccountBalance();
  }, [voteAccount, stakeAccount, connection]);

  if (!stakeAccount || !voteAccount) {
    return null;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold text-green-600 dark:text-green-400">Delegate Stake</div>
      <div className="space-y-1.5">
        {stakeAmount && (
          <div className="grid grid-cols-[80px,1fr] gap-2">
            <span className="text-muted-foreground">Amount:</span>
            <span className="font-medium">{stakeAmount}</span>
          </div>
        )}
        <AddressWithButtons address={stakeAccount} label="Stake Account" />
        <div className="grid grid-cols-[80px,1fr] gap-2">
          <span className="text-muted-foreground">Validator:</span>
          <div className="space-y-0.5">
            {validatorName && (
              <div className="text-xs font-medium text-muted-foreground">{validatorName}</div>
            )}
            <div className="flex items-center gap-1">
              <code className="flex-1 break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                {voteAccount}
              </code>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(voteAccount);
                  toast.success('Address copied to clipboard');
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Copy address"
              >
                <Copy className="h-3 w-3" />
              </button>
              <a
                href={`${explorerUrl}/address/${voteAccount}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="View on explorer"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
