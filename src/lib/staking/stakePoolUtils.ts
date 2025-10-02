import { PublicKey, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getTokenMetadata } from '../token/tokenMetadata';

export interface StakePoolInfo {
  address: string;
  name: string;
  poolMint: string;
  reserveStake: string;
  tokenSymbol?: string;
  totalStaked?: number;
  userBalance?: number;
}

// Load stake pools from environment variables
function loadStakePoolsFromEnv(): StakePoolInfo[] {
  console.log('[loadStakePoolsFromEnv] Starting to load stake pools from environment');
  const pools: StakePoolInfo[] = [];

  // Get the stake pools object from webpack
  const stakePools = (process.env as any).APP_STAKE_POOLS || {};
  console.log('[loadStakePoolsFromEnv] Raw stakePools object:', stakePools);
  console.log('[loadStakePoolsFromEnv] Type of stakePools:', typeof stakePools);
  console.log('[loadStakePoolsFromEnv] Keys in stakePools:', Object.keys(stakePools));

  // Look for environment variables in the format:
  // APP_STAKE_<NAME>_ADDRESS, APP_STAKE_<NAME>_MINT, APP_STAKE_<NAME>_RESERVE
  // or REACT_APP_STAKE_POOL_<NUMBER>_ADDRESS, etc.

  // First, try to load APP_STAKE_ format
  const appStakeKeys = Object.keys(stakePools).filter(key => key.startsWith('APP_STAKE_'));
  console.log('[loadStakePoolsFromEnv] Found APP_STAKE_ keys:', appStakeKeys);
  
  const stakeNames = new Set<string>();

  // Extract unique stake names from APP_STAKE_ format
  appStakeKeys.forEach(key => {
    const match = key.match(/^APP_STAKE_(.+?)_(ADDRESS|MINT|RESERVE|NAME)$/);
    if (match) {
      console.log(`[loadStakePoolsFromEnv] Matched key ${key} -> stake name: ${match[1]}`);
      stakeNames.add(match[1]);
    } else {
      console.log(`[loadStakePoolsFromEnv] Key ${key} did not match pattern`);
    }
  });

  console.log('[loadStakePoolsFromEnv] Unique stake names found:', Array.from(stakeNames));

  // Load pools with APP_STAKE_ format
  stakeNames.forEach(stakeName => {
    const address = stakePools[`APP_STAKE_${stakeName}_ADDRESS`];
    const mint = stakePools[`APP_STAKE_${stakeName}_MINT`];
    const reserve = stakePools[`APP_STAKE_${stakeName}_RESERVE`];
    const name = stakePools[`APP_STAKE_${stakeName}_NAME`] || stakeName.replace(/_/g, ' ');
    const tokenSymbol = stakePools[`APP_STAKE_${stakeName}_SYMBOL`];

    console.log(`[loadStakePoolsFromEnv] Processing stake ${stakeName}:`, {
      address,
      mint,
      reserve,
      name,
      tokenSymbol
    });

    if (address && mint && reserve) {
      console.log(`[loadStakePoolsFromEnv] Adding pool for ${stakeName}`);
      pools.push({
        address,
        name,
        tokenSymbol,
        poolMint: mint,
        reserveStake: reserve,
      });
    } else {
      console.log(`[loadStakePoolsFromEnv] Missing required fields for ${stakeName}, skipping`);
    }
  });

  // Also check for APP_STAKE_POOL_ format for backward compatibility
  console.log('[loadStakePoolsFromEnv] Checking APP_STAKE_POOL_ format for backward compatibility');
  for (let i = 1; i <= 10; i++) {
    const prefix = `APP_STAKE_POOL_${i}`;
    const address = stakePools[`${prefix}_ADDRESS`];
    const mint = stakePools[`${prefix}_MINT`];
    const reserve = stakePools[`${prefix}_RESERVE`];
    const name = stakePools[`${prefix}_NAME`] || `Stake Pool ${i}`;

    if (address || mint || reserve) {
      console.log(`[loadStakePoolsFromEnv] Found APP_STAKE_POOL_${i}:`, {
        address,
        mint,
        reserve,
        name
      });
    }

    if (address && mint && reserve) {
      console.log(`[loadStakePoolsFromEnv] Adding pool ${i} from backward compatible format`);
      pools.push({
        address,
        name,
        poolMint: mint,
        reserveStake: reserve,
      });
    }
  }

  console.log(`[loadStakePoolsFromEnv] Total pools loaded: ${pools.length}`);
  console.log('[loadStakePoolsFromEnv] Final pools array:', pools);
  return pools;
}

export const TESTNET_STAKE_POOLS: StakePoolInfo[] = loadStakePoolsFromEnv();

export async function getPoolTokenAccount(
  walletAddress: PublicKey,
  poolMint: PublicKey
): Promise<PublicKey> {
  return getAssociatedTokenAddress(poolMint, walletAddress, true, TOKEN_PROGRAM_ID);
}

export async function getStakePoolsForDisplay(
  connection: Connection,
  vaultAddress?: PublicKey
): Promise<StakePoolInfo[]> {
  const pools = [...TESTNET_STAKE_POOLS];

  // Fetch metadata and balances for each pool
  for (const pool of pools) {
    try {
      const poolMint = new PublicKey(pool.poolMint);

      // Fetch token metadata to get the symbol
      try {
        const metadata = await getTokenMetadata(poolMint, connection);
        if (metadata.symbol) {
          pool.tokenSymbol = metadata.symbol;
        }
      } catch (error) {
        console.debug('Failed to fetch metadata for pool token:', pool.poolMint);
      }

      // If vault address provided, fetch user balances
      if (vaultAddress) {
        try {
          const poolTokenAccount = await getPoolTokenAccount(vaultAddress, poolMint);
          const tokenAccountInfo = await connection.getTokenAccountBalance(poolTokenAccount);

          if (tokenAccountInfo && tokenAccountInfo.value) {
            pool.userBalance = tokenAccountInfo.value.uiAmount || 0;
          }
        } catch (error) {
          // Account doesn't exist yet, balance is 0
          pool.userBalance = 0;
        }
      }
    } catch (error) {
      console.error(`Error processing pool ${pool.name}:`, error);
    }
  }

  return pools;
}
