import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js';

const CONFIG_PROGRAM_ID = new PublicKey('Config1111111111111111111111111111111111111');
const VALIDATOR_INFO_ACCOUNT = 'Va1idator1nfo111111111111111111111111111111';

export interface ValidatorMetadata {
  voteAccount: string;
  identity?: string;
  name?: string;
  avatarUrl?: string;
  website?: string;
  details?: string;
  commission?: number;
}

export interface ValidatorInfo {
  name?: string;
  website?: string;
  details?: string;
  keybaseUsername?: string;
  iconUrl?: string;
}

// Cache for validator metadata
const validatorCache = new Map<string, ValidatorMetadata>();
// Cache for validator info by identity
const validatorInfoCache = new Map<string, ValidatorInfo>();

// Get validator identity from vote account
async function getValidatorIdentity(
  voteAccount: string,
  connection: Connection
): Promise<string | null> {
  try {
    // Get vote account info which contains the node pubkey (validator identity)
    const voteAccountInfo = await connection.getAccountInfo(new PublicKey(voteAccount));
    if (!voteAccountInfo || !voteAccountInfo.data) {
      return null;
    }

    // Parse vote account data to get node pubkey (validator identity)
    // The node pubkey is at offset 4 in the vote account data
    const nodePubkey = new PublicKey(voteAccountInfo.data.slice(4, 36));
    return nodePubkey.toBase58();
  } catch (error) {
    console.debug('Failed to get validator identity from vote account:', error);
    return null;
  }
}

// Fetch validator info from the Config program for a specific identity
async function getValidatorInfoForIdentity(
  identity: string,
  connection: Connection
): Promise<ValidatorInfo | null> {
  // Check cache first
  if (validatorInfoCache.has(identity)) {
    return validatorInfoCache.get(identity)!;
  }

  try {
    // Fetch all validator info accounts (we need to do this because we can't filter by identity directly)
    const accounts = await connection.getParsedProgramAccounts(CONFIG_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 1,
            bytes: VALIDATOR_INFO_ACCOUNT,
          },
        },
      ],
    });

    // Find the account for our specific identity
    for (const account of accounts) {
      const accountData = account.account.data;
      if ('parsed' in accountData) {
        const parsedData = (accountData as ParsedAccountData).parsed;
        const accountIdentity = parsedData?.info?.keys?.[1]?.pubkey;
        const configData = parsedData?.info?.configData;

        if (accountIdentity === identity && configData) {
          const validatorInfo: ValidatorInfo = {
            name: configData.name,
            website: configData.website,
            details: configData.details,
            keybaseUsername: configData.keybaseUsername,
            iconUrl: configData.iconUrl,
          };

          // Cache the result
          validatorInfoCache.set(identity, validatorInfo);
          return validatorInfo;
        }
      }
    }
  } catch (error) {
    console.debug('Failed to fetch validator info from Config program:', error);
  }

  return null;
}

export async function getValidatorMetadata(
  voteAccount: string,
  connection?: Connection
): Promise<ValidatorMetadata> {
  // Check cache first
  if (validatorCache.has(voteAccount)) {
    return validatorCache.get(voteAccount)!;
  }

  let identity: string | null = null;
  let validatorInfo: ValidatorInfo | null = null;

  // Get validator identity from vote account if we have a connection
  if (connection) {
    identity = await getValidatorIdentity(voteAccount, connection);

    // Get validator info from Config program using the identity
    if (identity) {
      validatorInfo = await getValidatorInfoForIdentity(identity, connection);
    }
  }

  // Build metadata from on-chain validator info
  let metadata: ValidatorMetadata;

  if (validatorInfo) {
    // Use the icon URL from the config program data first
    let avatarUrl: string | undefined = validatorInfo.iconUrl;

    // Fallback to keybase if no iconUrl but has keybase username
    if (!avatarUrl && validatorInfo.keybaseUsername) {
      avatarUrl = `https://keybase.io/${validatorInfo.keybaseUsername}/picture`;
    }

    metadata = {
      voteAccount,
      identity: identity || undefined,
      name: validatorInfo.name || `Validator ${voteAccount.slice(0, 4)}...${voteAccount.slice(-4)}`,
      avatarUrl,
      website: validatorInfo.website,
      details: validatorInfo.details,
    };
  } else {
    // Default fallback if no on-chain info found
    metadata = {
      voteAccount,
      identity: identity || undefined,
      name: `Validator ${voteAccount.slice(0, 4)}...${voteAccount.slice(-4)}`,
      avatarUrl: undefined, // Don't generate an avatar, let the UI handle missing icons
    };
  }

  validatorCache.set(voteAccount, metadata);
  return metadata;
}
