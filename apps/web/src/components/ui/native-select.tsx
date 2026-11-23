import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * A styled browser <select>. Used for the filters instead of a custom dropdown: it works
 * with the keyboard and screen readers out of the box, and on phones it opens the native picker.
 */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
