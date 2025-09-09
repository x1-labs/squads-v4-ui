import { LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import SendTokens from './SendTokensButton';
import SendSol from './SendSolButton';
import { useMultisigData } from '~/hooks/useMultisigData';
import { useBalance, useGetTokens } from '~/hooks/useServices';
import { useEffect, useState, useMemo } from 'react';
import { getTokenMetadata, TokenMetadata } from '~/lib/token/tokenMetadata';
import { useRpcUrl } from '~/hooks/useSettings';

type TokenListProps = {
  multisigPda: string;
};

export function TokenList({ multisigPda }: TokenListProps) {
  const { vaultIndex, programId } = useMultisigData();
  const { data: solBalance } = useBalance();
  const { data: tokens = null } = useGetTokens();
  const { rpcUrl } = useRpcUrl();
  const connection = useMemo(
    () => new Connection(rpcUrl || 'https://rpc.testnet.x1.xyz'),
    [rpcUrl]
  );
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, TokenMetadata>>(new Map());
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // Fetch token metadata when tokens change
  useEffect(() => {
    async function fetchMetadata() {
      if (!tokens || tokens.length === 0) return;

      setLoadingMetadata(true);
      const metadata = new Map<string, TokenMetadata>();

      try {
        // Fetch metadata for each token in parallel
        const promises = tokens.map(async (token) => {
          const mint = token.account.data.parsed.info.mint;
          const data = await getTokenMetadata(mint, connection);
          metadata.set(mint, data);
        });

        await Promise.all(promises);
        setTokenMetadata(metadata);
      } catch (error) {
        console.error('Failed to fetch token metadata:', error);
      } finally {
        setLoadingMetadata(false);
      }
    }

    fetchMetadata();
  }, [tokens, connection]);

  // Format mint address for display
  const formatMint = (mint: string) => {
    if (mint.length <= 20) return mint;
    return `${mint.slice(0, 8)}...${mint.slice(-8)}`;
  };

  // Format balance for display with appropriate decimal places
  const formatBalance = (amount: number | null | undefined, decimals?: number): string => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0';

    // For very small amounts, show more decimal places
    if (amount > 0 && amount < 0.0001) {
      return amount.toExponential(2);
    }

    // For XNT and tokens with high value, show 4 decimal places
    if (decimals === undefined || decimals === 9) {
      return amount.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
      });
    }

    // For other tokens, adjust based on their decimals
    const maxDecimals = Math.min(decimals, 6);
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Assets</CardTitle>
        <CardDescription>Vault holdings</CardDescription>
      </CardHeader>
      <CardContent>
        {/* XNT Balance */}
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
                <span className="text-sm font-bold text-white">XNT</span>
              </div>
              <div>
                <p className="font-medium">XNT</p>
                <p className="text-sm text-muted-foreground">
                  {formatBalance((solBalance || 0) / LAMPORTS_PER_SOL, 9)} XNT
                </p>
              </div>
            </div>
            <SendSol multisigPda={multisigPda} vaultIndex={vaultIndex} />
          </div>

          {/* SPL Tokens */}
          {tokens && tokens.length > 0 && (
            <>
              <div className="my-2 border-t border-border" />
              {tokens.map((token) => {
                const mint = token.account.data.parsed.info.mint;
                const metadata = tokenMetadata.get(mint);
                const isLoading = loadingMetadata && !metadata;

                return (
                  <div
                    key={mint}
                    className="flex items-center justify-between rounded-lg bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted">
                        {metadata?.logoURI && !imageErrors.has(mint) ? (
                          <img
                            src={metadata.logoURI}
                            alt={metadata.symbol || 'Token'}
                            className="h-full w-full object-cover"
                            onError={() => {
                              setImageErrors((prev) => new Set(prev).add(mint));
                            }}
                          />
                        ) : (
                          <span className="text-xs font-bold text-foreground">
                            {metadata?.symbol || 'SPL'}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {isLoading ? (
                            <span className="text-muted-foreground">Loading...</span>
                          ) : (
                            metadata?.name || metadata?.symbol || formatMint(mint)
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatBalance(
                            token.account.data.parsed.info.tokenAmount.uiAmount,
                            token.account.data.parsed.info.tokenAmount.decimals
                          )}{' '}
                          {metadata?.symbol || 'tokens'}
                        </p>
                        {metadata && !metadata.name && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {formatMint(mint)}
                          </p>
                        )}
                      </div>
                    </div>
                    <SendTokens
                      mint={mint}
                      tokenAccount={token.pubkey.toBase58()}
                      decimals={token.account.data.parsed.info.tokenAmount.decimals}
                      multisigPda={multisigPda}
                      vaultIndex={vaultIndex}
                      programId={programId.toBase58()}
                    />
                  </div>
                );
              })}
            </>
          )}

          {/* Empty state */}
          {(!tokens || tokens.length === 0) && (!solBalance || solBalance === 0) && (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">No assets in this vault</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
