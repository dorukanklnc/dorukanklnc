import { cn } from '@repo/ui';

/**
 * Product mark. The product name comes from the message catalog (`app.name`) so the temporary
 * codename can be replaced in one place.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('size-7 shrink-0', className)}
    >
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <path
        d="M21.5 11.2A7 7 0 1 0 21.5 20.8"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="22.4" cy="16" r="1.9" className="fill-brand-300" />
    </svg>
  );
}

export function BrandLockup({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <BrandMark />
      <span className="text-md font-semibold tracking-tight text-fg">{name}</span>
    </span>
  );
}
