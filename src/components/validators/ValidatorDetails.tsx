import { ValidatorInfo } from '@/lib/validators/validatorUtils';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ValidatorDetailsProps {
  validator: ValidatorInfo;
  onClose: () => void;
}

export function ValidatorDetails({ validator }: ValidatorDetailsProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <Card className="ml-14 animate-in slide-in-from-top-2">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div>
            <h4 className="mb-3 text-sm font-semibold text-muted-foreground">Validator Details</h4>
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <span className="text-sm text-muted-foreground">Vote Account</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm">{validator.votePubkey.toBase58()}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(validator.votePubkey.toBase58(), 'vote')}
                  >
                    {copiedField === 'vote' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
              
              <div className="flex items-start justify-between">
                <span className="text-sm text-muted-foreground">Node Pubkey</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm">{validator.nodePubkey.toBase58()}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(validator.nodePubkey.toBase58(), 'node')}
                  >
                    {copiedField === 'node' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-start justify-between">
                <span className="text-sm text-muted-foreground">Withdraw Authority</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm">{validator.withdrawAuthority.toBase58()}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(validator.withdrawAuthority.toBase58(), 'withdraw')}
                  >
                    {copiedField === 'withdraw' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="my-4 border-t" />

          <div>
            <h4 className="mb-3 text-sm font-semibold text-muted-foreground">Financial Information</h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Commission</p>
                <p className="text-lg font-semibold">{validator.commission}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Balance</p>
                <p className="text-lg font-semibold">{validator.balance.toFixed(4)} SOL</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Available Rewards</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                  {validator.rewards.toFixed(4)} SOL
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Root Slot</p>
                <p className="text-lg font-semibold">{validator.rootSlot?.toLocaleString() || 'N/A'}</p>
              </div>
            </div>
          </div>

          {validator.epochCredits.length > 0 && (
            <>
              <div className="my-4 border-t" />
              <div>
                <h4 className="mb-3 text-sm font-semibold text-muted-foreground">Recent Epoch Credits</h4>
                <div className="space-y-2">
                  {validator.epochCredits.slice(-5).reverse().map((credit, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                      <span className="text-sm text-muted-foreground">Epoch {credit.epoch}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm">
                          Credits: <span className="font-medium">{credit.credits.toLocaleString()}</span>
                        </span>
                        <span className="text-sm">
                          Previous: <span className="font-medium">{credit.previousCredits.toLocaleString()}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {validator.authorizedVoters.length > 0 && (
            <>
              <div className="my-4 border-t" />
              <div>
                <h4 className="mb-3 text-sm font-semibold text-muted-foreground">Authorized Voters</h4>
                <div className="space-y-2">
                  {validator.authorizedVoters.map((voter, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Epoch {voter.epoch}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs">
                          {voter.authorizedVoter.toBase58().slice(0, 8)}...
                          {voter.authorizedVoter.toBase58().slice(-8)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyToClipboard(voter.authorizedVoter.toBase58(), `voter-${index}`)}
                        >
                          {copiedField === `voter-${index}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}