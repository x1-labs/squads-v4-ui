import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Eye } from 'lucide-react';

interface ReviewButtonProps {
  transactionPda: string;
}

const ReviewButton: React.FC<ReviewButtonProps> = ({ transactionPda }) => {
  const navigate = useNavigate();

  const handleReview = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    navigate(`/transactions/${transactionPda}`);
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
