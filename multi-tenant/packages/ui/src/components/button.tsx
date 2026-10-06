import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../lib/cn';
import { Spinner } from './spinner';

const variants = {
  primary: 'bg-primary text-primary-fg shadow-xs hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-fg shadow-xs hover:bg-surface-hover',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  subtle: 'bg-primary-subtle text-primary-subtle-fg hover:bg-brand-100',
  danger: 'bg-danger text-white shadow-xs hover:bg-danger-fg',
  'danger-ghost': 'text-danger-fg hover:bg-danger-bg',
  link: 'h-auto px-0 text-primary underline-offset-2 hover:underline',
} as const;

const sizes = {
  xs: 'h-6 gap-1 px-2 text-xs',
  sm: 'h-7 gap-1.5 px-2.5 text-sm',
  md: 'h-8 gap-1.5 px-3 text-sm',
  lg: 'h-9 gap-2 px-4 text-base',
  icon: 'h-8 w-8',
  'icon-sm': 'h-7 w-7',
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Render the child element (e.g. a link) with button styles. */
  asChild?: boolean;
  leadingIcon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  asChild = false,
  leadingIcon,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    className,
  );
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : leadingIcon}
      {children}
    </button>
  );
}
