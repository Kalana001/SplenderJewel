import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luxury-gold/50 disabled:pointer-events-none disabled:opacity-50 select-none tracking-wide',
  {
    variants: {
      variant: {
        primary:
          'bg-luxury-black text-white hover:bg-neutral-900 border border-luxury-gold/40 hover:border-luxury-gold shadow-sm',
        gold:
          'bg-luxury-gold text-luxury-black hover:bg-luxury-gold-hover font-semibold shadow-sm',
        outline:
          'border border-neutral-300 dark:border-neutral-700 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-foreground',
        secondary:
          'bg-neutral-100 dark:bg-neutral-800 text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-700',
        ghost:
          'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-foreground',
        destructive:
          'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-500',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-sm',
        md: 'h-10 px-5 text-sm rounded-sm',
        lg: 'h-12 px-7 text-base rounded-sm',
        icon: 'h-10 w-10 rounded-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={twMerge(clsx(buttonVariants({ variant, size, className })))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
