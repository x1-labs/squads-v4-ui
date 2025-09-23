import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

interface ViewDetailsButtonProps {
  multisigPda: string;
  transactionIndex: number;
  programId?: string;
}

export default function ViewDetailsButton({
  multisigPda,
  transactionIndex,
  programId = multisig.PROGRAM_ID.toBase58(),
}: ViewDetailsButtonProps) {
  const navigate = useNavigate();

  // Get the transaction PDA to use as the route parameter
  const [transactionPda] = multisig.getTransactionPda({
    multisigPda: new PublicKey(multisigPda),
    index: BigInt(transactionIndex),
    programId: new PublicKey(programId),
  });

  const handleClick = () => {
    // Navigate to the transaction details page
    navigate(`/${multisigPda}/transactions/${transactionPda.toBase58()}`);
  };

  return (
    <button
      onClick={handleClick}
      className="h-8 rounded bg-muted px-3 text-sm text-foreground transition-colors hover:bg-muted/80"
      title="View decoded transaction details"
    >
      Details
    </button>
  );
}
