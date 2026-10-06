'use client';

import { Button, EmptyState, Panel, Skeleton } from '@repo/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, FileQuestion, Lock, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { isApiError } from '@/lib/api/errors';
import { useErrorMessage } from '@/lib/use-error-message';

export function ForbiddenState({ className }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <EmptyState
      className={className}
      icon={<Lock />}
      title={t('forbiddenTitle')}
      description={t('forbiddenHint')}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/dashboard">{t('goToDashboard')}</Link>
        </Button>
      }
    />
  );
}

export function NotFoundState({ className }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <EmptyState
      className={className}
      icon={<FileQuestion />}
      title={t('notFoundTitle')}
      description={t('notFoundHint')}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/dashboard">{t('goToDashboard')}</Link>
        </Button>
      }
    />
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations('common');
  const message = useErrorMessage();
  const requestId = isApiError(error) ? error.requestId : undefined;
  const offline = isApiError(error) && error.code === 'NETWORK_ERROR';
  return (
    <EmptyState
      className={className}
      icon={offline ? <WifiOff /> : <AlertTriangle />}
      title={offline ? message(error) : t('unexpectedError')}
      description={
        <>
          {offline ? null : <span className="block">{message(error)}</span>}
          {requestId ? (
            <span className="mt-1 block font-mono text-xs text-fg-subtle">
              {t('requestId', { id: requestId })}
            </span>
          ) : null}
        </>
      }
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        ) : null
      }
    />
  );
}

/** Renders the right state for a failed query: forbidden, not found or a retryable error. */
export function QueryError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  if (isApiError(error) && error.isForbidden) return <ForbiddenState className={className} />;
  if (isApiError(error) && error.isNotFound) return <NotFoundState className={className} />;
  return <ErrorState error={error} onRetry={onRetry} className={className} />;
}

/**
 * Loading → error → content for a single query. Keeps every screen honest about its state
 * without repeating the same branches.
 */
export function QueryContent<T>({
  query,
  loading,
  children,
}: {
  query: UseQueryResult<T>;
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{loading ?? <PanelSkeleton />}</>;
  if (query.isError) {
    return (
      <Panel>
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </Panel>
    );
  }
  return <>{children(query.data)}</>;
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Panel className="p-4" aria-busy="true">
      <Skeleton className="mb-4 h-4 w-40" />
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-3.5" style={{ width: `${92 - index * 9}%` }} />
        ))}
      </div>
    </Panel>
  );
}
