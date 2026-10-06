'use client';

import { Panel } from '@repo/ui';
import { useEffect } from 'react';
import { ErrorState } from '@/components/states';

/** Unexpected rendering failure inside the signed-in area; the shell stays usable. */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Panel>
      <ErrorState error={error} onRetry={retry} />
    </Panel>
  );
}
