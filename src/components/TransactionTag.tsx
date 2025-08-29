import React from 'react';
import { TransactionTag as TagType } from '../lib/tags/types';

interface TransactionTagProps {
  tag: TagType;
  size?: 'sm' | 'md';
}

export const TransactionTag: React.FC<TransactionTagProps> = ({ tag, size = 'sm' }) => {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-0.5 text-sm',
  };

  const colorClasses: Record<string, string> = {
    // Subtle backgrounds with no borders for a label-like appearance
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    green: 'bg-green-500/10 text-green-700 dark:text-green-400',
    purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
    orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    yellow: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    pink: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
    indigo: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
    gray: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
    red: 'bg-red-500/10 text-red-700 dark:text-red-400',
    default: 'bg-muted/50 text-muted-foreground',
  };

  const variantClasses = {
    default: '',
    outline: 'bg-transparent ring-1 ring-current/20',
    subtle: '',
  };

  const color = tag.color || 'default';
  const variant = tag.variant || 'default';

  // For outline variant, use simpler color classes
  const getColorClass = () => {
    if (variant === 'outline') {
      return 'text-muted-foreground ring-muted-foreground/30';
    }
    return colorClasses[color] || colorClasses.default;
  };

  return (
    <span
      className={`inline-flex items-center rounded font-medium ${sizeClasses[size]} ${variantClasses[variant]} ${getColorClass()}`}
    >
      {tag.label}
    </span>
  );
};

interface TransactionTagListProps {
  tags: TagType[];
  size?: 'sm' | 'md';
  maxTags?: number;
  showIcon?: boolean;
}

export const TransactionTagList: React.FC<TransactionTagListProps> = ({
  tags,
  size = 'sm',
  maxTags = 5,
  showIcon = true,
}) => {
  const visibleTags = tags.slice(0, maxTags);
  const hiddenCount = tags.length - maxTags;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showIcon && (
        <svg
          className="h-3.5 w-3.5 text-muted-foreground/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
      )}
      {visibleTags.map((tag, index) => (
        <TransactionTag key={`${tag.label}-${index}`} tag={tag} size={size} />
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          +{hiddenCount} more
        </span>
      )}
    </div>
  );
};
