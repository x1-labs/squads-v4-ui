import * as React from 'react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SplitButtonItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface SplitButtonProps {
  children: React.ReactNode;
  items: SplitButtonItem[];
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm';
  disabled?: boolean;
  className?: string;
}

/**
 * A split button that wraps any button element and adds a dropdown chevron.
 * The main button (children) keeps its original click behavior.
 * The chevron opens a dropdown menu with additional actions.
 */
export function SplitButton({
  children,
  items,
  variant = 'default',
  size = 'sm',
  disabled,
  className,
}: SplitButtonProps) {
  const chevronHeight = size === 'sm' ? 'h-8' : 'h-10';

  return (
    <div className={cn('inline-flex', className)}>
      <div className="[&_button]:rounded-r-none [&_button]:border-r-0">
        {children}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={variant}
            disabled={disabled}
            className={cn(
              chevronHeight,
              'rounded-l-none px-1.5',
              variant === 'default' && 'border-l border-l-primary-foreground/20',
              variant === 'outline' && 'border-l-0'
            )}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item, index) => (
            <DropdownMenuItem
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
              }}
              disabled={item.disabled}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
