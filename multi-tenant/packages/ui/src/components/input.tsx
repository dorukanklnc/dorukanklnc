import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '../lib/cn';

const control =
  'w-full rounded-md border border-line-strong bg-surface text-sm text-fg shadow-xs transition-[border-color,box-shadow] ' +
  'placeholder:text-fg-subtle hover:border-gray-400 focus:border-primary focus:outline-none focus:ring-3 focus:ring-ring/50 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Input({ className, leading, trailing, ref, ...props }: InputProps) {
  if (!leading && !trailing) {
    return <input ref={ref} className={cn(control, 'h-8 px-2.5', className)} {...props} />;
  }
  return (
    <div className={cn('relative flex items-center', className)}>
      {leading ? (
        <span className="pointer-events-none absolute left-2.5 flex text-fg-subtle [&_svg]:size-4">
          {leading}
        </span>
      ) : null}
      <input
        ref={ref}
        className={cn(control, 'h-8', leading ? 'pl-8' : 'pl-2.5', trailing ? 'pr-9' : 'pr-2.5')}
        {...props}
      />
      {trailing ? <span className="absolute right-2 flex text-fg-subtle">{trailing}</span> : null}
    </div>
  );
}

export function SearchInput(props: Omit<InputProps, 'leading' | 'type'>) {
  return (
    <Input type="search" leading={<Search />} autoComplete="off" spellCheck={false} {...props} />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea ref={ref} className={cn(control, 'min-h-20 px-2.5 py-2', className)} {...props} />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>;
}

/** Native select: fully accessible, keyboard friendly and fast for forms and filters. */
export function Select({ className, children, ref, ...props }: SelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(control, 'h-8 appearance-none pl-2.5 pr-8')} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}
