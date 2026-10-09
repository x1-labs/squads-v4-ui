import { useAccess, useMemberPermissions } from './useAccess';
import { NEEDS_INITIATE } from '../lib/transaction/proposalInstructions';

/**
 * Permissions for flows that create a proposal. Create needs Initiate. The
 * creator approves in the same send only with Vote. MembershipWarning covers
 * a wallet that is not a member, so the reason is only for members.
 */
export const useProposePermissions = () => {
  const isMember = useAccess();
  const { canInitiate, canVote } = useMemberPermissions();
  return {
    canInitiate,
    canVote,
    initiateReason: isMember && !canInitiate ? NEEDS_INITIATE : undefined,
  };
};
