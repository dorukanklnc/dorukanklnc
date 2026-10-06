import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Side sheet for focused edits without leaving the current page. */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

const widths = {
  sm: 'max-w-[280px]',
  md: 'max-w-[480px]',
  lg: 'max-w-[600px]',
  xl: 'max-w-[760px]',
} as const;

export function SheetContent({
  className,
  children,
  size = 'md',
  side = 'right',
  closeLabel = 'Close',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  size?: keyof typeof widths;
  side?: 'left' | 'right';
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col border-line bg-surface shadow-lg outline-none',
          side === 'right'
            ? 'right-0 border-l data-[state=open]:animate-slide-in-right'
            : 'left-0 border-r data-[state=open]:animate-slide-in-left',
          widths[size],
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3.5 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          aria-label={closeLabel}
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ title, description }: { title: ReactNode; description?: ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-3.5 pr-12">
      <DialogPrimitive.Title className="text-md font-semibold text-fg">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-0.5 text-sm text-fg-muted">
          {description}
        </DialogPrimitive.Description>
      ) : (
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
      )}
    </div>
  );
}

export function SheetBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...props} />;
}

export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-line bg-surface-muted px-5 py-3',
        className,
      )}
      {...props}
    />
  );
}
