import { useMemo } from 'react';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
import { useRpcUrl, useProgramId } from './useSettings';
import { useVaultIndex } from './useVaultIndex';
import { useMultisigAddress } from './useMultisigAddress';
import * as multisig from '@sqds/multisig';

export const useMultisigData = () => {
  // Fetch settings from React Query hooks
  const { rpcUrl } = useRpcUrl();
  const { programId: storedProgramId } = useProgramId();
  const { multisigAddress } = useMultisigAddress();
  const { vaultIndex } = useVaultIndex();

  // Ensure we have a valid RPC URL (fallback to mainnet-beta)
  const effectiveRpcUrl = rpcUrl || clusterApiUrl('mainnet-beta');
  // 'confirmed' explicitly, rather than letting the RPC apply its 'finalized'
  // default. Finalized lags roughly 31 blocks (~12s), which showed up two ways:
  // account reads served stale state right after an action, and — worse —
  // `getLatestBlockhash()` handed back a blockhash that had already burned a
  // fifth of its ~150-block validity window before the wallet even prompted.
  const connection = useMemo(() => new Connection(effectiveRpcUrl, 'confirmed'), [effectiveRpcUrl]);

  // Compute programId safely
  const programId = useMemo(
    () => (storedProgramId ? new PublicKey(storedProgramId) : multisig.PROGRAM_ID),
    [storedProgramId]
  );

  // Compute the multisig vault PDA
  const multisigVault = useMemo(() => {
    if (multisigAddress) {
      return multisig.getVaultPda({
        multisigPda: new PublicKey(multisigAddress),
        index: vaultIndex,
        programId,
      })[0];
    }
    return null;
  }, [multisigAddress, vaultIndex, programId]);

  return {
    rpcUrl: effectiveRpcUrl,
    connection,
    multisigAddress,
    vaultIndex,
    programId,
    multisigVault,
  };
};
