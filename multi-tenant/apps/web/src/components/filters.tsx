'use client';

import { SearchInput, Select, cn } from '@repo/ui';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/** Search box bound to a URL parameter, debounced so typing does not flood the API. */
export function SearchFilter({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  className?: string;
}) {
  const [text, setText] = useState(value ?? '');
  const [syncedValue, setSyncedValue] = useState(value);
  const timer = useRef<number | undefined>(undefined);

  // The URL changed elsewhere (e.g. "clear filters"): show the new value.
  if (value !== syncedValue) {
    setSyncedValue(value);
    if ((value ?? '') !== text.trim()) setText(value ?? '');
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleChange = (next: string) => {
    setText(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const trimmed = next.trim();
      onChange(trimmed.length > 0 ? trimmed : undefined);
    }, 300);
  };

  return (
    <SearchInput
      value={text}
      onChange={(event) => handleChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={cn('w-full sm:w-64', className)}
      maxLength={100}
    />
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/** Compact select whose empty option reads "<label>: All". */
export function SelectFilter({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string | undefined;
  options: readonly FilterOption[];
  onChange: (value: string | undefined) => void;
  className?: string;
}) {
  const t = useTranslations('common');
  return (
    <Select
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || undefined)}
      aria-label={label}
      className={cn('w-auto min-w-[140px]', className)}
    >
      <option value="">{`${label}: ${t('all')}`}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('common');
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface-hover hover:text-fg"
    >
      <X className="size-3.5" aria-hidden="true" />
      {t('clearFilters')}
    </button>
  );
}
