import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
        gold: 'bg-luxury-gold/15 text-luxury-gold-dark dark:text-luxury-gold-light border border-luxury-gold/30',
        ruby: 'bg-luxury-ruby/15 text-luxury-ruby-light border border-luxury-ruby/30',
        'ruby-solid': 'bg-luxury-ruby text-white font-semibold shadow-sm',
        success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
        warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20',
        danger: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20',
        outline: 'border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={twMerge(clsx(badgeVariants({ variant }), className))} {...props} />
  );
}
