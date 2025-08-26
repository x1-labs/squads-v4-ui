import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import SendTokens from './SendTokensButton';
import SendSol from './SendSolButton';
import { useMultisigData } from '~/hooks/useMultisigData';
import { useBalance, useGetTokens } from '~/hooks/useServices';

type TokenListProps = {
  multisigPda: string;
};

export function TokenList({ multisigPda }: TokenListProps) {
  const { vaultIndex, programId } = useMultisigData();
  const { data: solBalance } = useBalance();
  const { data: tokens = null } = useGetTokens();
  
  // Format mint address for display
  const formatMint = (mint: string) => {
    if (mint.length <= 20) return mint;
    return `${mint.slice(0, 8)}...${mint.slice(-8)}`;
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Assets</CardTitle>
        <CardDescription>Vault holdings</CardDescription>
      </CardHeader>
      <CardContent>
        {/* SOL Balance */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">SOL</span>
              </div>
              <div>
                <p className="font-medium">Solana</p>
                <p className="text-sm text-muted-foreground">
                  {((solBalance || 0) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </p>
              </div>
            </div>
            <SendSol multisigPda={multisigPda} vaultIndex={vaultIndex} />
          </div>
          
          {/* SPL Tokens */}
          {tokens && tokens.length > 0 && (
            <>
              <div className="border-t border-border my-2" />
              {tokens.map((token) => (
                <div key={token.account.data.parsed.info.mint} 
                     className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-foreground font-bold text-xs">SPL</span>
                    </div>
                    <div>
                      <p className="font-medium font-mono text-sm">
                        {formatMint(token.account.data.parsed.info.mint)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {token.account.data.parsed.info.tokenAmount.uiAmount} tokens
                      </p>
                    </div>
                  </div>
                  <SendTokens
                    mint={token.account.data.parsed.info.mint}
                    tokenAccount={token.pubkey.toBase58()}
                    decimals={token.account.data.parsed.info.tokenAmount.decimals}
                    multisigPda={multisigPda}
                    vaultIndex={vaultIndex}
                    programId={programId.toBase58()}
                  />
                </div>
              ))}
            </>
          )}
          
          {/* Empty state */}
          {(!tokens || tokens.length === 0) && (!solBalance || solBalance === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No assets in this vault</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
