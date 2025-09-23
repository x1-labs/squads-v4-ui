import { Connection, PublicKey, LAMPORTS_PER_SOL, VoteProgram } from '@solana/web3.js';

export interface ValidatorInfo {
  votePubkey: PublicKey;
  nodePubkey: PublicKey;
  commission: number;
  withdrawAuthority: PublicKey;
  authorizedVoters: Array<{ epoch: number; authorizedVoter: PublicKey }>;
  epochCredits: Array<{ epoch: number; credits: number; previousCredits: number }>;
  lastTimestamp: { slot: number; timestamp: number };
  rootSlot: number | null;
  balance: number;
  rewards: number;
}

export async function fetchValidatorsByWithdrawAuthority(
  connection: Connection,
  withdrawAuthority: PublicKey
): Promise<ValidatorInfo[]> {
  try {
    // Get all vote accounts - this returns basic data including commission and stake
    const voteAccounts = await connection.getVoteAccounts();
    const allVoteAccounts = [...voteAccounts.current, ...voteAccounts.delinquent];

    console.log(`Total vote accounts fetched: ${allVoteAccounts.length}`);
    console.log(`Looking for withdraw authority: ${withdrawAuthority.toBase58()}`);
    
    // Process accounts in batches for better performance
    const BATCH_SIZE = 100; // Process 100 accounts at a time
    const validators: ValidatorInfo[] = [];
    
    // Process in batches to avoid overwhelming the RPC
    for (let i = 0; i < allVoteAccounts.length; i += BATCH_SIZE) {
      const batch = allVoteAccounts.slice(i, Math.min(i + BATCH_SIZE, allVoteAccounts.length));
      
      // Create promises for parallel fetching
      const batchPromises = batch.map(async (account) => {
        const votePubkey = new PublicKey(account.votePubkey);
        
        try {
          // Get the parsed vote account data
          const parsedAccountInfo = await connection.getParsedAccountInfo(votePubkey);
          
          if (!parsedAccountInfo || !parsedAccountInfo.value) {
            return null;
          }
          
          const accountData = parsedAccountInfo.value.data;
          
          // Check if it's a parsed account
          if ('parsed' in accountData && accountData.parsed) {
            const parsedData = accountData.parsed;
            
            // Vote accounts have a specific structure
            if (parsedData.type === 'vote' && parsedData.info) {
              const voteInfo = parsedData.info;
              
              // Check if authorized withdrawer matches
              const authorizedWithdrawer = voteInfo.authorizedWithdrawer;
              if (authorizedWithdrawer) {
                const withdrawerPubkey = new PublicKey(authorizedWithdrawer);
                
                if (withdrawerPubkey.equals(withdrawAuthority)) {
                  console.log(`Found matching validator: ${votePubkey.toBase58()}`);
                  
                  // Extract validator info from parsed data
                  return {
                    votePubkey,
                    nodePubkey: new PublicKey(voteInfo.nodePubkey || account.nodePubkey),
                    commission: voteInfo.commission || account.commission,
                    withdrawAuthority: withdrawerPubkey,
                    authorizedVoters: voteInfo.authorizedVoters ? voteInfo.authorizedVoters.map((v: any) => ({
                      epoch: v.epoch,
                      authorizedVoter: new PublicKey(v.authorizedVoter)
                    })) : [],
                    epochCredits: voteInfo.epochCredits ? voteInfo.epochCredits.slice(-10).map((ec: any) => ({
                      epoch: ec.epoch,
                      credits: ec.credits,
                      previousCredits: ec.prevCredits || ec.previousCredits || 0
                    })) : [],
                    lastTimestamp: voteInfo.lastTimestamp || { slot: 0, timestamp: 0 },
                    rootSlot: voteInfo.rootSlot || null,
                    balance: (parsedAccountInfo.value.lamports || 0) / LAMPORTS_PER_SOL,
                    rewards: Math.max(0, ((parsedAccountInfo.value.lamports || 0) - 50000000) / LAMPORTS_PER_SOL)
                  };
                }
              }
            }
          }
          return null;
        } catch (error) {
          // Silently skip errors for individual accounts
          return null;
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Filter out nulls and add to validators
      const validResults = batchResults.filter((v): v is ValidatorInfo => v !== null);
      validators.push(...validResults);
      
      // Log progress
      console.log(`Processed ${Math.min(i + BATCH_SIZE, allVoteAccounts.length)} of ${allVoteAccounts.length} validators...`);
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < allVoteAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Found ${validators.length} validators with matching withdraw authority`);
    return validators;
  } catch (error) {
    console.error('Error fetching validators:', error);
    return [];
  }
}

export async function fetchValidatorInfo(
  connection: Connection,
  votePubkey: PublicKey
): Promise<ValidatorInfo | null> {
  try {
    // Get the parsed vote account data
    const parsedAccountInfo = await connection.getParsedAccountInfo(votePubkey);
    
    if (!parsedAccountInfo || !parsedAccountInfo.value) {
      return null;
    }
    
    const accountData = parsedAccountInfo.value.data;
    
    // Check if it's a parsed account
    if ('parsed' in accountData && accountData.parsed) {
      const parsedData = accountData.parsed;
      
      // Vote accounts have a specific structure
      if (parsedData.type === 'vote' && parsedData.info) {
        const voteInfo = parsedData.info;
        
        return {
          votePubkey,
          nodePubkey: new PublicKey(voteInfo.nodePubkey),
          commission: voteInfo.commission || 0,
          withdrawAuthority: new PublicKey(voteInfo.authorizedWithdrawer),
          authorizedVoters: voteInfo.authorizedVoters ? voteInfo.authorizedVoters.map((v: any) => ({
            epoch: v.epoch,
            authorizedVoter: new PublicKey(v.authorizedVoter)
          })) : [],
          epochCredits: voteInfo.epochCredits ? voteInfo.epochCredits.slice(-10).map((ec: any) => ({
            epoch: ec.epoch,
            credits: ec.credits,
            previousCredits: ec.prevCredits || ec.previousCredits || 0
          })) : [],
          lastTimestamp: voteInfo.lastTimestamp || { slot: 0, timestamp: 0 },
          rootSlot: voteInfo.rootSlot || null,
          balance: (parsedAccountInfo.value.lamports || 0) / LAMPORTS_PER_SOL,
          rewards: Math.max(0, ((parsedAccountInfo.value.lamports || 0) - 50000000) / LAMPORTS_PER_SOL)
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching validator info:', error);
    return null;
  }
}
