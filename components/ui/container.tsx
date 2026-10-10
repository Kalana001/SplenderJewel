import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export function Container({ className, size = 'xl', children, ...props }: ContainerProps) {
  const sizeClasses = {
    sm: 'max-w-3xl',
    md: 'max-w-5xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
    full: 'max-w-full',
  };

  return (
    <div
      className={twMerge(
        clsx(
          'w-full mx-auto px-4 sm:px-6 lg:px-8',
          sizeClasses[size],
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
}
