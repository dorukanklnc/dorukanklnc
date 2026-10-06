'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { type ClientErrorCode, isApiError } from './api/errors';

/** Maps any thrown value to a localized, user-facing message. */
export function useErrorMessage() {
  const t = useTranslations('errors');
  return useCallback(
    (error: unknown): string => {
      const code: ClientErrorCode = isApiError(error) ? error.code : 'INTERNAL_ERROR';
      return t(code);
    },
    [t],
  );
}

/**
 * Copies server-side field errors (`errors[].path`, e.g. `guardians.0.phone`) onto a form.
 * `mapPath` translates an API path to a form field (or null to ignore it). Returns true when at
 * least one field error was applied, so callers can skip a generic toast.
 */
export function useApplyFieldErrors() {
  const t = useTranslations('validation');
  return useCallback(
    <T extends FieldValues>(
      error: unknown,
      setError: UseFormSetError<T>,
      mapPath: (apiPath: string) => Path<T> | null,
    ): boolean => {
      if (!isApiError(error) || error.fieldErrors.length === 0) return false;
      let applied = false;
      for (const fieldError of error.fieldErrors) {
        const field = mapPath(fieldError.path);
        if (!field) continue;
        setError(field, { type: 'server', message: t('invalid') });
        applied = true;
      }
      return applied;
    },
    [t],
  );
}
