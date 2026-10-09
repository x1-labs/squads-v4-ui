import * as multisig from '@sqds/multisig';
import { useMultisig } from './useServices';
import { useWallet } from '@solana/wallet-adapter-react';
import { isMember } from '@/lib/utils';

export const useAccess = () => {
  const { data: multisig } = useMultisig();
  const { publicKey } = useWallet();
  
  // Always call hooks first, then check conditions
  if (!multisig || !publicKey) {
    return false;
  }
  
  try {
    // if the pubkeyKey is in members return true
    const memberExists = isMember(publicKey, multisig.members);
    // return true if found
    return !!memberExists;
  } catch (error) {
    // If there's an error fetching multisig (e.g., invalid address), return false
    // Silently handle the error - this is expected when no multisig is selected
    return false;
  }
};

/**
 * Whether the connected wallet is a member with the Vote permission, which the
 * program requires for approve, reject and cancel. useAccess only checks
 * membership.
 */
export const useCanVote = () => {
  const { data: multisigAccount } = useMultisig();
  const { publicKey } = useWallet();

  if (!multisigAccount || !publicKey) {
    return false;
  }

  const member = isMember(publicKey, multisigAccount.members);
  return (
    !!member &&
    (member.permissions.mask & multisig.types.Permission.Vote) === multisig.types.Permission.Vote
  );
};

/**
 * Permissions of the connected wallet in the selected multisig. Config
 * transaction create needs Initiate, and approve needs Vote.
 */
export const useMemberPermissions = () => {
  const { data: multisigAccount } = useMultisig();
  const { publicKey } = useWallet();

  const member =
    multisigAccount && publicKey ? isMember(publicKey, multisigAccount.members) : undefined;
  const mask = member?.permissions.mask ?? 0;
  const has = (permission: number) => (mask & permission) === permission;
  return {
    canInitiate: has(multisig.types.Permission.Initiate),
    canVote: has(multisig.types.Permission.Vote),
  };
};
