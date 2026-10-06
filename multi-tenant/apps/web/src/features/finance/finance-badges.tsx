'use client';

import type { Payment, PaymentLink, Receivable } from '@repo/contracts';
import { Badge } from '@repo/ui';
import { useTranslations } from 'next-intl';

/** Receivable state as the business sees it: paid, overdue (with days), partially paid or open. */
export function ReceivableStatusBadge({
  receivable,
}: {
  receivable: Pick<
    Receivable,
    'status' | 'isOverdue' | 'daysOverdue' | 'allocatedMinor' | 'amountMinor'
  >;
}) {
  const t = useTranslations('finance.receivables.status');
  if (receivable.status === 'paid') return <Badge tone="success">{t('paid')}</Badge>;
  if (receivable.status === 'cancelled') return <Badge tone="neutral">{t('cancelled')}</Badge>;
  if (receivable.isOverdue) {
    return (
      <Badge tone="danger" dot>
        {t('overdue', { days: receivable.daysOverdue })}
      </Badge>
    );
  }
  if (receivable.allocatedMinor > 0) return <Badge tone="warning">{t('partial')}</Badge>;
  return <Badge tone="neutral">{t('open')}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: Payment['status'] }) {
  const t = useTranslations('finance.payments.status');
  return status === 'completed' ? (
    <Badge tone="success">{t('completed')}</Badge>
  ) : (
    <Badge tone="danger">{t('reversed')}</Badge>
  );
}

export function PaymentLinkStatusBadge({ status }: { status: PaymentLink['status'] }) {
  const t = useTranslations('finance.link.status');
  const tone = status === 'succeeded' ? 'success' : status === 'created' ? 'info' : 'neutral';
  return (
    <Badge tone={tone} dot={status === 'created'}>
      {t(status)}
    </Badge>
  );
}
