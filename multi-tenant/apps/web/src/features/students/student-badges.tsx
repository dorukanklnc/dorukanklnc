'use client';

import type { StudentStatus } from '@repo/contracts';
import { Badge, type BadgeTone } from '@repo/ui';
import { useTranslations } from 'next-intl';

const STATUS_TONES: Record<StudentStatus, BadgeTone> = {
  active: 'success',
  inactive: 'neutral',
  graduated: 'info',
  withdrawn: 'warning',
  transferred: 'neutral',
};

export function StudentStatusBadge({
  status,
  archived,
}: {
  status: StudentStatus;
  archived?: boolean;
}) {
  const t = useTranslations('students');
  if (archived) return <Badge tone="neutral">{t('archived')}</Badge>;
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {t(`status.${status}`)}
    </Badge>
  );
}
