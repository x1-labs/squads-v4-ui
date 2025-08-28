import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { types as multisigTypes, accounts } from '@sqds/multisig';
import { PublicKey, Connection } from '@solana/web3.js';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}

export const renderPermissions = (permissionsMask: number) => {
  return (
    Object.entries(multisigTypes.Permission)
      .filter(([_, bit]) => (permissionsMask & bit) === bit) // Check which bits are set
      .map(([key]) => key) // Get the permission names
      .join(', ') || 'None'
  ); // Handle empty case
};

export const isMember = (publicKey: PublicKey, members: multisigTypes.Member[]) => {
  return members.find((v: multisigTypes.Member) => v.key.equals(publicKey));
};

export const validateSquadAddress = async (
  connection: Connection,
  address: string
): Promise<{ isValid: boolean; error?: string }> => {
  try {
    const pubkey = new PublicKey(address);
    
    const accountInfo = await connection.getAccountInfo(pubkey);
    if (!accountInfo) {
      return { isValid: false, error: 'Address does not exist on chain' };
    }
    
    try {
      // @ts-ignore - Connection type mismatch between versions
      await accounts.Multisig.fromAccountAddress(connection, pubkey);
      return { isValid: true };
    } catch (e) {
      return { isValid: false, error: 'Address is not a valid Squad (multisig)' };
    }
  } catch (e) {
    return { isValid: false, error: 'Invalid Solana address format' };
  }
};
