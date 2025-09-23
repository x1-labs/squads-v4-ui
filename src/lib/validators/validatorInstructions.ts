import {
  TransactionInstruction,
  PublicKey,
  LAMPORTS_PER_SOL,
  VoteProgram,
  VoteAuthorizationLayout,
  SystemProgram,
  Transaction,
  SYSVAR_CLOCK_PUBKEY
} from '@solana/web3.js';

export function createUpdateCommissionInstruction(
  votePubkey: PublicKey,
  authorizedWithdrawer: PublicKey,
  commission: number
): TransactionInstruction {
  console.log('Creating UpdateCommission instruction:');
  console.log('  Vote account:', votePubkey.toBase58());
  console.log('  Authorized withdrawer:', authorizedWithdrawer.toBase58());
  console.log('  New commission:', commission);
  
  // Validate commission is within valid range
  if (commission < 0 || commission > 100) {
    throw new Error(`Invalid commission value: ${commission}. Must be between 0 and 100.`);
  }
  
  // IMPORTANT: UpdateCommission might be restricted or disabled
  // Let's add a warning
  console.warn('⚠️  UpdateCommission may be disabled in current Solana/X1 version');
  console.warn('    Consider using vote-update-validator or other methods');
  
  // UpdateCommission(u8) specification:
  // - Instruction discriminator: 5 (UpdateCommission in VoteInstruction enum)
  // - Parameter: commission as u8 (0-100)
  // Account references:
  // - [WRITE] Vote account to be updated
  // - [SIGNER] Withdraw authority
  
  console.log('Building UpdateCommission instruction data');
  
  // Based on actual transaction data "0500000011" for commission 17:
  // The format is: [discriminator][padding][commission]
  // [05] = UpdateCommission discriminator
  // [00][00][00] = padding (3 bytes)
  // [11] = commission (17 in decimal)
  
  // Create the instruction data with padding before commission
  const instructionData = Buffer.from([
    5,          // UpdateCommission discriminator
    0, 0, 0,    // 3 bytes of padding
    commission  // Commission value as u8
  ]);
  
  console.log('  Using u32 format based on working transaction');
  console.log('  Expected format: [5 (discriminator)] + [commission as u32 LE]');
  console.log('  Data hex:', instructionData.toString('hex'));
  console.log('  Data bytes:', Array.from(instructionData));
  
  console.log('  Using instruction data:', instructionData.toString('hex'));
  console.log('  Data bytes:', Array.from(instructionData));
  console.log('  Data length:', instructionData.length);
  
  // Account setup - exact order matters
  // IMPORTANT: When executed through multisig, the withdrawer (vault) doesn't sign directly
  // The multisig program signs on behalf of the vault
  const keysWithoutClock = [
    { 
      pubkey: votePubkey, 
      isSigner: false, 
      isWritable: true // [WRITE] Vote account
    },
    { 
      pubkey: authorizedWithdrawer, 
      isSigner: true, // [SIGNER] Withdraw authority (multisig will handle this)
      isWritable: false
    },
  ];
  
  const keysWithClock = [
    { 
      pubkey: votePubkey, 
      isSigner: false, 
      isWritable: true // [WRITE] Vote account
    },
    { 
      pubkey: authorizedWithdrawer, 
      isSigner: true, // [SIGNER] Withdraw authority  
      isWritable: false
    },
    {
      pubkey: SYSVAR_CLOCK_PUBKEY,
      isSigner: false,
      isWritable: false // Clock sysvar (might be required)
    }
  ];
  
  // Based on the successful transaction, only 2 accounts are needed
  // No Clock sysvar required
  const keys = keysWithoutClock;
  console.log('  Using 2 accounts (no Clock sysvar needed)');
  
  console.log('  Account configuration:');
  keys.forEach((key, i) => {
    console.log(`    [${i}] ${key.pubkey.toBase58()}`);
    console.log(`        signer=${key.isSigner}, writable=${key.isWritable}`);
  });

  const instruction = new TransactionInstruction({
    keys,
    programId: VoteProgram.programId,
    data: instructionData,
  });
  
  console.log('Final UpdateCommission instruction:');
  console.log('  Program:', instruction.programId.toBase58());
  console.log('  Data hex:', Buffer.from(instruction.data).toString('hex'));
  console.log('  Data bytes:', Array.from(instruction.data));
  console.log('  Accounts:', instruction.keys.length);
  
  return instruction;
}

export function createWithdrawInstruction(
  votePubkey: PublicKey,
  authorizedWithdrawer: PublicKey,
  toPubkey: PublicKey,
  lamports: number
): TransactionInstruction {
  console.log('createWithdrawInstruction called with:');
  console.log('  votePubkey:', votePubkey.toBase58());
  console.log('  authorizedWithdrawer:', authorizedWithdrawer.toBase58());
  console.log('  toPubkey:', toPubkey.toBase58());
  console.log('  lamports:', lamports);
  console.log('  lamports in SOL:', lamports / 1_000_000_000);
  
  // The SDK generates the instruction with the withdrawer as a signer
  // When executed through multisig, the multisig will sign on behalf of the vault
  const withdrawTx = VoteProgram.withdraw({
    votePubkey,
    authorizedWithdrawerPubkey: authorizedWithdrawer,
    toPubkey,
    lamports
  });
  
  const sdkInstruction = withdrawTx.instructions[0];
  
  // For multisig execution, we need to ensure the withdrawer account isn't marked as signer
  // The multisig program will handle the signature
  const adjustedKeys = sdkInstruction.keys.map(key => {
    if (key.pubkey.equals(authorizedWithdrawer)) {
      // Remove signer flag for the withdrawer when it's the multisig vault
      return { ...key, isSigner: false };
    }
    return key;
  });
  
  const adjustedInstruction = new TransactionInstruction({
    keys: adjustedKeys,
    programId: sdkInstruction.programId,
    data: sdkInstruction.data
  });
  
  console.log('Adjusted instruction for multisig:');
  console.log('  Data hex:', Buffer.from(adjustedInstruction.data).toString('hex'));
  console.log('  Data length:', adjustedInstruction.data.length);
  console.log('  Accounts:', adjustedInstruction.keys.map((k, i) => 
    `[${i}] ${k.pubkey.toBase58()} (signer=${k.isSigner}, writable=${k.isWritable})`
  ));
  
  return adjustedInstruction;
}

export function createAuthorizeWithdrawerInstruction(
  votePubkey: PublicKey,
  authorizedWithdrawer: PublicKey,
  newWithdrawAuthority: PublicKey
): TransactionInstruction {
  console.log('Creating Authorize Withdrawer instruction:');
  console.log('  Vote account:', votePubkey.toBase58());
  console.log('  Current withdrawer:', authorizedWithdrawer.toBase58());
  console.log('  New withdraw authority:', newWithdrawAuthority.toBase58());
  
  const authorizeIx = VoteProgram.authorize({
    votePubkey,
    authorizedPubkey: authorizedWithdrawer,
    newAuthorizedPubkey: newWithdrawAuthority,
    voteAuthorizationType: VoteAuthorizationLayout.Withdrawer
  });
  
  const instruction = authorizeIx.instructions[0];
  console.log('  Instruction data hex:', instruction.data.toString('hex'));
  console.log('  Instruction accounts:', instruction.keys.map(k => k.pubkey.toBase58()));
  
  // Extract the instruction from the transaction
  return instruction;
}

