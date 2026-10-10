import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          type={type}
          className={twMerge(
            clsx(
              'flex h-10 w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-luxury-surface px-3 py-2 text-sm text-foreground placeholder:text-neutral-400 focus:outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/50',
              className
            )
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
