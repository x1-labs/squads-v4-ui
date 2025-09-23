import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';

interface ReviewButtonProps {
  multisigPda: string;
  transactionPda: string;
}

const ReviewButton: React.FC<ReviewButtonProps> = ({ multisigPda, transactionPda }) => {
  const navigate = useNavigate();

  const handleReview = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    navigate(`/${multisigPda}/transactions/${transactionPda}`);
  };

  return (
    <Button
      onClick={handleReview}
      size="sm"
      variant="secondary"
      className="h-8"
      title="Review transaction details"
    >
      Review
    </Button>
  );
};

export default ReviewButton;
