import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  label?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, label, children, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            {label}
          </label>
        )}
        <select
          className={twMerge(
            clsx(
              'flex h-10 w-full rounded-sm border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-luxury-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/50',
              className
            )
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
