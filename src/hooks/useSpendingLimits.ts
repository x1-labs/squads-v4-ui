import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import * as multisig from '@sqds/multisig';
import bs58 from 'bs58';
import { useMultisigData } from './useMultisigData';
import { useNativeSymbol } from './useNativeSymbol';
import { getTokenMetadata } from '@/lib/token/tokenMetadata';
import { NATIVE_DECIMALS, isNativeMint } from '@/lib/spendingLimits';

export type SpendingLimitToken = {
  mint: PublicKey;
  native: boolean;
  symbol: string;
  /** Null when the mint account cannot be read. */
  decimals: number | null;
  /** Owner of the SPL mint (Token or Token-2022). Null for the native token. */
  tokenProgram: PublicKey | null;
};

export type SpendingLimitEntry = {
  address: PublicKey;
  account: multisig.accounts.SpendingLimit;
  token: SpendingLimitToken;
};

/** Byte offset of `multisig` in the SpendingLimit account, after the 8-byte discriminator. */
const MULTISIG_OFFSET = 8;

/** Decimals, token program and symbol of an SPL mint. */
export async function fetchSplToken(
  connection: Connection,
  mint: PublicKey
): Promise<SpendingLimitToken> {
  const info = await connection.getAccountInfo(mint);
  const isTokenProgram =
    !!info && (info.owner.equals(TOKEN_PROGRAM_ID) || info.owner.equals(TOKEN_2022_PROGRAM_ID));
  if (!info || !isTokenProgram) {
    return { mint, native: false, symbol: shortMint(mint), decimals: null, tokenProgram: null };
  }
  const { decimals } = unpackMint(mint, info, info.owner);
  const metadata = await getTokenMetadata(mint, connection).catch(() => null);
  return {
    mint,
    native: false,
    symbol: metadata?.symbol || shortMint(mint),
    decimals,
    tokenProgram: info.owner,
  };
}

function shortMint(mint: PublicKey): string {
  const s = mint.toBase58();
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

/**
 * All SpendingLimit accounts of the selected multisig. The multisig account
 * does not list its limits, so this scans the program accounts. A failed scan
 * is an error, never an empty list.
 */
export const useSpendingLimits = () => {
  const { connection, multisigAddress, programId } = useMultisigData();
  const nativeSymbol = useNativeSymbol();

  return useQuery({
    queryKey: ['spendingLimits', multisigAddress, programId.toBase58(), nativeSymbol],
    enabled: !!multisigAddress,
    queryFn: async (): Promise<SpendingLimitEntry[]> => {
      const multisigPda = new PublicKey(multisigAddress!);
      const accounts = await connection.getProgramAccounts(programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(Buffer.from(multisig.accounts.spendingLimitDiscriminator)),
            },
          },
          { memcmp: { offset: MULTISIG_OFFSET, bytes: multisigPda.toBase58() } },
        ],
      });

      const limits = accounts.map(({ pubkey, account }) => ({
        address: pubkey,
        account: multisig.accounts.SpendingLimit.fromAccountInfo(account)[0],
      }));

      const splMints = [
        ...new Set(
          limits.filter((l) => !isNativeMint(l.account.mint)).map((l) => l.account.mint.toBase58())
        ),
      ];
      const tokens = new Map(
        await Promise.all(
          splMints.map(
            async (mint) => [mint, await fetchSplToken(connection, new PublicKey(mint))] as const
          )
        )
      );

      return limits
        .map((l) => ({
          ...l,
          token: isNativeMint(l.account.mint)
            ? {
                mint: l.account.mint,
                native: true,
                symbol: nativeSymbol,
                decimals: NATIVE_DECIMALS,
                tokenProgram: null,
              }
            : tokens.get(l.account.mint.toBase58())!,
        }))
        .sort(
          (a, b) =>
            a.account.vaultIndex - b.account.vaultIndex ||
            a.address.toBase58().localeCompare(b.address.toBase58())
        );
    },
  });
};
