'use client';

import type { StudentDetail } from '@repo/contracts';
import {
  Badge,
  EmptyState,
  Panel,
  PanelHeader,
  TBody,
  THead,
  Table,
  TableContainer,
  Td,
  Th,
  Tr,
} from '@repo/ui';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function StudentGuardians({ student }: { student: StudentDetail }) {
  const t = useTranslations('students');
  const tg = useTranslations('guardians.columns');
  const guardians = student.guardians ?? [];

  return (
    <Panel>
      <PanelHeader title={t('profile.tabs.guardians')} />
      {guardians.length === 0 ? (
        <EmptyState icon={<Users />} title={t('profile.noGuardians')} />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>{tg('name')}</Th>
                <Th>{t('form.relationship')}</Th>
                <Th>{tg('phone')}</Th>
                <Th>{tg('email')}</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {guardians.map((guardian) => (
                <Tr key={guardian.id}>
                  <Td className="font-medium">{guardian.fullName}</Td>
                  <Td className="text-fg-muted">{t(`relationship.${guardian.relationship}`)}</Td>
                  <Td>
                    {guardian.phone ? (
                      <a
                        href={`tel:${guardian.phone.replace(/[^0-9+]/g, '')}`}
                        className="hover:text-primary hover:underline"
                      >
                        {guardian.phone}
                      </a>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </Td>
                  <Td>
                    {guardian.email ? (
                      <a
                        href={`mailto:${guardian.email}`}
                        className="hover:text-primary hover:underline"
                      >
                        {guardian.email}
                      </a>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {guardian.isPrimaryContact ? (
                        <Badge tone="info">{t('form.primaryContact')}</Badge>
                      ) : null}
                      {guardian.isFinanciallyResponsible ? (
                        <Badge tone="neutral">{t('form.financiallyResponsible')}</Badge>
                      ) : null}
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </Panel>
  );
}
