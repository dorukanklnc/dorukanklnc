import { type ReactNode, useId } from 'react';
import { cn } from '../lib/cn';

export interface FieldProps {
  label: ReactNode;
  /** Render prop receives ids for accessible wiring (id, aria-describedby, aria-invalid, aria-required). */
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    'aria-required'?: boolean;
  }) => ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  optionalLabel?: string;
  className?: string;
}

/** Label + control + hint/error with correct ARIA relationships. */
export function Field({
  label,
  children,
  hint,
  error,
  required,
  optionalLabel,
  className,
}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline gap-1 text-sm font-medium text-fg">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
        {!required && optionalLabel ? (
          <span className="text-xs font-normal text-fg-subtle">{optionalLabel}</span>
        ) : null}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        // The asterisk is visual only; assistive technology learns about it from the control.
        'aria-required': required ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-xs text-danger-fg" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
