import React, { createContext, useContext } from 'react';

/**
 * Status of the proposal whose instructions are being summarized (`Active`,
 * `Executed`, …). Summaries use it to skip preflight checks once the proposal
 * can no longer run as proposed — an executed proposal's own effects are on
 * chain and would otherwise be read back as reasons it "would fail".
 */
const ProposalStatusContext = createContext<string | undefined>(undefined);

export const ProposalStatusProvider: React.FC<{
  status: string | undefined;
  children: React.ReactNode;
}> = ({ status, children }) => (
  <ProposalStatusContext.Provider value={status}>{children}</ProposalStatusContext.Provider>
);

export function useProposalStatus(): string | undefined {
  return useContext(ProposalStatusContext);
}
