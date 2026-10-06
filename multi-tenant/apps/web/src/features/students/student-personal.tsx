'use client';

import type { StudentDetail } from '@repo/contracts';
import { Button, Panel, PanelBody, PanelHeader, Tooltip } from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import { Eye, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DescriptionList } from '@/components/description-list';
import { usePermissions } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';

export function StudentPersonal({ student }: { student: StudentDetail }) {
  const t = useTranslations('students');
  const format = useFormat();
  const { can } = usePermissions();
  const errorMessage = useErrorMessage();

  // Revealing the full national ID is an explicit, audited action (never fetched by default).
  const reveal = useMutation({
    mutationFn: () =>
      api.post<{ nationalId: string | null }>(`/students/${student.id}/national-id/reveal`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const nationalId = reveal.data?.nationalId ?? student.nationalIdMasked;
  const canReveal =
    can('students.sensitive.read') && student.nationalIdMasked !== null && !reveal.data;

  return (
    <Panel>
      <PanelHeader title={t('profile.tabs.personal')} />
      <PanelBody>
        <DescriptionList
          columns={3}
          items={[
            { label: t('form.firstName'), value: student.firstName },
            { label: t('form.lastName'), value: student.lastName },
            {
              label: t('profile.studentNumberLabel'),
              value: <span className="font-mono">{student.studentNumber}</span>,
            },
            {
              label: t('form.gender'),
              value: student.gender ? t(`gender.${student.gender}`) : null,
            },
            {
              label: t('form.birthDate'),
              value: student.birthDate ? format.date(student.birthDate, 'medium') : null,
            },
            {
              label: t('profile.nationalId'),
              value: nationalId ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono">{nationalId}</span>
                  {canReveal ? (
                    <Tooltip content={t('profile.revealHint')}>
                      <Button
                        variant="ghost"
                        size="xs"
                        leadingIcon={<Eye />}
                        loading={reveal.isPending}
                        onClick={() => reveal.mutate()}
                      >
                        {t('profile.reveal')}
                      </Button>
                    </Tooltip>
                  ) : null}
                  {reveal.data ? (
                    <ShieldCheck
                      className="size-3.5 text-fg-subtle"
                      aria-label={t('profile.revealHint')}
                    />
                  ) : null}
                </span>
              ) : null,
            },
            { label: t('form.phone'), value: student.phone },
            { label: t('form.email'), value: student.email },
            { label: t('form.address'), value: student.address, wide: true },
            { label: t('profile.createdAt'), value: format.dateTime(student.createdAt) },
            { label: t('profile.updatedAt'), value: format.dateTime(student.updatedAt) },
          ]}
        />
      </PanelBody>
    </Panel>
  );
}
