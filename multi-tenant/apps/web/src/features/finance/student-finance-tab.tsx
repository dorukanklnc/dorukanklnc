'use client';

import type {
  AccountBalance,
  Agreement,
  Paginated,
  PaymentListItem,
  Receivable,
  StudentDetail,
} from '@repo/contracts';
import {
  Badge,
  Button,
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
  cn,
} from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { FilePlus2, Link2, ReceiptText, Wallet, WalletCards } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Money } from '@/components/money';
import { usePermissions } from '@/components/session/session-context';
import { PanelSkeleton, QueryError } from '@/components/states';
import { useStudentFinance } from '@/features/students/student-overview';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useFormat } from '@/lib/use-format';
import { AgreementWizard } from './agreement-wizard';
import { ChargeDialog } from './charge-dialog';
import { PaymentStatusBadge, ReceivableStatusBadge } from './finance-badges';
import { PaymentLinkDialog } from './payment-link-dialog';
import { ReceiptLink } from './record-payment-dialog';

export function StudentFinanceTab({
  student,
  onRecordPayment,
}: {
  student: StudentDetail;
  onRecordPayment?: () => void;
}) {
  const t = useTranslations('finance');
  const { can } = usePermissions();
  const finance = useStudentFinance(student.id);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const canWrite = can('finance.collections.write');
  const canCreatePayment = can('finance.payments.create');
  const archived = student.archivedAt !== null;
  const account = finance.data?.accounts.find(
    (candidate) => candidate.branch.id === student.branch.id,
  );

  return (
    <div className="flex flex-col gap-4">
      {!archived && (onRecordPayment || canWrite || canCreatePayment) ? (
        <div className="flex flex-wrap gap-2">
          {onRecordPayment ? (
            <Button variant="primary" size="sm" leadingIcon={<Wallet />} onClick={onRecordPayment}>
              {t('recordPayment.title')}
            </Button>
          ) : null}
          {canWrite ? (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<FilePlus2 />}
              onClick={() => setWizardOpen(true)}
            >
              {t('agreement.create')}
            </Button>
          ) : null}
          {canWrite ? (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<ReceiptText />}
              onClick={() => setChargeOpen(true)}
            >
              {t('charge.create')}
            </Button>
          ) : null}
          {canCreatePayment ? (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Link2 />}
              onClick={() => setLinkOpen(true)}
            >
              {t('link.create')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {finance.isPending ? (
        <PanelSkeleton rows={3} />
      ) : finance.isError ? (
        <Panel>
          <QueryError error={finance.error} onRetry={() => void finance.refetch()} />
        </Panel>
      ) : finance.data.accounts.length === 0 && finance.data.agreements.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<WalletCards />}
            title={t('student.noAgreement')}
            description={t('student.noAgreementHint')}
            action={
              canWrite && !archived ? (
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<FilePlus2 />}
                  onClick={() => setWizardOpen(true)}
                >
                  {t('agreement.create')}
                </Button>
              ) : null
            }
          />
        </Panel>
      ) : (
        <>
          {finance.data.accounts.map((balance) => (
            <BalanceStrip key={balance.accountId} balance={balance} />
          ))}
          <AgreementsPanel agreements={finance.data.agreements} />
        </>
      )}

      <StudentReceivables studentId={student.id} />
      {can('finance.payments.read') ? <StudentPayments studentId={student.id} /> : null}

      {canWrite ? (
        <AgreementWizard student={student} open={wizardOpen} onOpenChange={setWizardOpen} />
      ) : null}
      {canWrite ? (
        <ChargeDialog student={student} open={chargeOpen} onOpenChange={setChargeOpen} />
      ) : null}
      {canCreatePayment ? (
        <PaymentLinkDialog
          student={student}
          suggestedAmountMinor={
            account ? account.overdueMinor || account.nextDue?.amountMinor : undefined
          }
          open={linkOpen}
          onOpenChange={setLinkOpen}
        />
      ) : null}
    </div>
  );
}

function BalanceStrip({ balance }: { balance: AccountBalance }) {
  const t = useTranslations('finance.student');
  const format = useFormat();
  const items = [
    {
      label: t('totalDue'),
      value: <Money amountMinor={balance.totalDueMinor} currency={balance.currency} />,
    },
    {
      label: t('paid'),
      value: <Money amountMinor={balance.paidMinor} currency={balance.currency} />,
    },
    {
      label: t('outstanding'),
      value: (
        <Money
          amountMinor={balance.outstandingMinor}
          currency={balance.currency}
          className="font-semibold"
        />
      ),
    },
    {
      label: t('overdue'),
      value: (
        <Money
          amountMinor={balance.overdueMinor}
          currency={balance.currency}
          muteZero
          className={balance.overdueMinor > 0 ? 'font-semibold text-danger-fg' : undefined}
        />
      ),
    },
    {
      label: t('nextDue'),
      value: balance.nextDue ? (
        <span className="flex flex-col">
          <Money amountMinor={balance.nextDue.amountMinor} currency={balance.currency} />
          <span className="tabular text-xs text-fg-muted">
            {format.date(balance.nextDue.dueDate, 'medium')}
          </span>
        </span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
    },
    ...(balance.creditMinor > 0
      ? [
          {
            label: t('credit'),
            value: (
              <Money
                amountMinor={balance.creditMinor}
                currency={balance.currency}
                className="text-success-fg"
              />
            ),
          },
        ]
      : []),
  ];
  return (
    <Panel>
      <dl className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        {items.map((item, index) => (
          <div key={index} className="px-4 py-3">
            <dt className="text-xs text-fg-muted">{item.label}</dt>
            <dd className="mt-1 text-md">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function AgreementsPanel({ agreements }: { agreements: Agreement[] }) {
  const t = useTranslations('finance');
  const format = useFormat();
  if (agreements.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title={t('student.agreements')} />
      <ul className="divide-y divide-line-subtle">
        {agreements.map((agreement) => {
          const progress =
            agreement.netAmountMinor > 0 ? agreement.paidMinor / agreement.netAmountMinor : 0;
          return (
            <li
              key={agreement.id}
              className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-fg">{agreement.title}</p>
                  <Badge
                    tone={
                      agreement.status === 'active'
                        ? 'info'
                        : agreement.status === 'completed'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {t(`agreement.status.${agreement.status}`)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {agreement.plan
                    ? t('student.planSummary', {
                        count: agreement.plan.installmentCount,
                        date: format.date(agreement.plan.firstDueDate),
                      })
                    : null}
                  {agreement.discountTotalMinor > 0 ? (
                    <>
                      {' · '}
                      {t('agreement.discountTotal')}:{' '}
                      {format.money(agreement.discountTotalMinor, agreement.currency)}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="w-full md:w-72">
                <div className="flex justify-between text-xs text-fg-muted">
                  <span>
                    {t('student.paid')}:{' '}
                    <Money
                      amountMinor={agreement.paidMinor}
                      currency={agreement.currency}
                      className="text-fg"
                    />
                  </span>
                  <span>
                    {t('agreement.net')}:{' '}
                    <Money
                      amountMinor={agreement.netAmountMinor}
                      currency={agreement.currency}
                      className="text-fg"
                    />
                  </span>
                </div>
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function StudentReceivables({ studentId }: { studentId: string }) {
  const t = useTranslations('finance');
  const format = useFormat();
  const params = { studentId, pageSize: 100, sort: 'dueDate', direction: 'asc' };
  const receivables = useQuery({
    queryKey: queryKeys.finance.receivables(params),
    queryFn: ({ signal }) => api.get<Paginated<Receivable>>('/finance/receivables', params, signal),
  });

  return (
    <Panel>
      <PanelHeader title={t('student.receivables')} />
      {receivables.isPending ? (
        <div className="p-4">
          <PanelSkeleton rows={4} />
        </div>
      ) : receivables.isError ? (
        <QueryError error={receivables.error} onRetry={() => void receivables.refetch()} />
      ) : receivables.data.items.length === 0 ? (
        <EmptyState icon={<ReceiptText />} title={t('receivables.emptyTitle')} />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>{t('receivables.columns.dueDate')}</Th>
                <Th>{t('receivables.columns.description')}</Th>
                <Th>{t('receivables.columns.kind')}</Th>
                <Th className="text-right">{t('receivables.columns.amount')}</Th>
                <Th className="text-right">{t('receivables.columns.paid')}</Th>
                <Th className="text-right">{t('receivables.columns.outstanding')}</Th>
                <Th>{t('receivables.columns.status')}</Th>
              </Tr>
            </THead>
            <TBody>
              {receivables.data.items.map((item) => (
                <Tr key={item.id} className={cn(item.status === 'cancelled' && 'opacity-60')}>
                  <Td className={cn('tabular', item.isOverdue && 'text-danger-fg')}>
                    {format.date(item.dueDate)}
                  </Td>
                  <Td>{item.description}</Td>
                  <Td className="text-fg-muted">{t(`receivables.kind.${item.kind}`)}</Td>
                  <Td className="text-right">
                    <Money amountMinor={item.amountMinor} currency={item.currency} />
                  </Td>
                  <Td className="text-right">
                    <Money amountMinor={item.allocatedMinor} currency={item.currency} muteZero />
                  </Td>
                  <Td className="text-right">
                    <Money
                      amountMinor={item.outstandingMinor}
                      currency={item.currency}
                      muteZero
                      className="font-medium"
                    />
                  </Td>
                  <Td>
                    <ReceivableStatusBadge receivable={item} />
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

function StudentPayments({ studentId }: { studentId: string }) {
  const t = useTranslations('finance');
  const format = useFormat();
  const params = { studentId, pageSize: 50, sort: 'receivedAt', direction: 'desc' };
  const payments = useQuery({
    queryKey: queryKeys.finance.payments(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<PaymentListItem>>('/finance/payments', params, signal),
  });

  return (
    <Panel>
      <PanelHeader title={t('student.payments')} />
      {payments.isPending ? (
        <div className="p-4">
          <PanelSkeleton rows={3} />
        </div>
      ) : payments.isError ? (
        <QueryError error={payments.error} onRetry={() => void payments.refetch()} />
      ) : payments.data.items.length === 0 ? (
        <EmptyState icon={<Wallet />} title={t('student.noPayments')} />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>{t('payments.columns.receipt')}</Th>
                <Th>{t('payments.columns.receivedAt')}</Th>
                <Th>{t('payments.columns.method')}</Th>
                <Th className="text-right">{t('payments.columns.amount')}</Th>
                <Th>{t('payments.columns.status')}</Th>
              </Tr>
            </THead>
            <TBody>
              {payments.data.items.map((payment) => (
                <Tr key={payment.id}>
                  <Td>
                    <ReceiptLink payment={payment} />
                  </Td>
                  <Td className="tabular text-fg-muted">{format.dateTime(payment.receivedAt)}</Td>
                  <Td>{t(`payments.method.${payment.method}`)}</Td>
                  <Td className="text-right">
                    <Money
                      amountMinor={payment.amountMinor}
                      currency={payment.currency}
                      className={cn(
                        'font-medium',
                        payment.status === 'reversed' && 'text-fg-subtle line-through',
                      )}
                    />
                  </Td>
                  <Td>
                    <PaymentStatusBadge status={payment.status} />
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
