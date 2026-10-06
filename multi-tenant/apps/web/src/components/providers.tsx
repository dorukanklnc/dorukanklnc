'use client';

import { TooltipProvider } from '@repo/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { z } from 'zod';
import { createQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const locale = useLocale();

  useEffect(() => {
    // Fallback messages for any validation rule without an explicit, translated message.
    z.config(locale === 'tr' ? z.locales.tr() : z.locales.en());
  }, [locale]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster
          position="bottom-right"
          visibleToasts={4}
          closeButton
          toastOptions={{
            classNames: {
              toast:
                'group !rounded-md !border !border-line !bg-surface !text-fg !shadow-md !font-sans !text-sm',
              description: '!text-fg-muted',
              success: '[&_[data-icon]]:!text-success',
              error: '[&_[data-icon]]:!text-danger',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
