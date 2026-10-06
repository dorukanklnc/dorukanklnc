'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Payment } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  Panel,
  PanelBody,
  PanelHeader,
  Skeleton,
  TBody,
  THead,
  Table,
  TableContainer,
  Td,
  Textarea,
  Th,
  Tr,
  cn,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DescriptionList } from '@/components/description-list';
import { Alert } from '@/components/form-bits';
import { Money } from '@/components/money';
import { PageHeader } from '@/components/page-header';
import { usePermissions, useSession } from '@/components/session/session-context';
import { QueryError } from '@/components/states';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { rememberRecentItem } from '@/lib/recent-items';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { PaymentStatusBadge } from './finance-badges';
import { invalidateFinance } from './record-payment-dialog';

export function PaymentDetail({ paymentId }: { paymentId: string }) {
  const t = useTranslations('finance.payments');
  const tn = useTranslations('nav.items');
  const format = useFormat();
  const session = useSession();
  const { can } = usePermissions();
  const [reverseOpen, setReverseOpen] = useState(false);

  const payment = useQuery({
    queryKey: queryKeys.finance.payment(paymentId),
    queryFn: ({ signal }) => api.get<Payment>(`/finance/payments/${paymentId}`, undefined, signal),
  });

  const data = payment.data;
  const organizationId = session.activeOrganization?.id;
  useEffect(() => {
    if (!data || !organizationId) return;
    rememberRecentItem(session.user.id, organizationId, {
      type: 'payment',
      id: data.id,
      title: data.receiptNumber,
      subtitle: data.student.fullName,
      href: `/finance/payments/${data.id}`,
    });
  }, [data, organizationId, session.user.id]);

  if (payment.isPending) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-2 h-3 w-32" />
        <Skeleton className="mb-6 h-7 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (payment.isError || !data) {
    return (
      <Panel>
        <QueryError error={payment.error} onRetry={() => void payment.refetch()} />
      </Panel>
    );
  }

  const reversed = data.status === 'reversed';
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: tn('payments'), href: '/finance/payments' },
          { label: data.receiptNumber },
        ]}
        title={t('detail.title', { receipt: data.receiptNumber })}
        meta={
          <>
            <PaymentStatusBadge status={data.status} />
            <span className="text-sm text-fg-muted">{format.dateTime(data.receivedAt)}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={<Printer />}
              onClick={() => window.print()}
              className="print:hidden"
            >
              {t('detail.print')}
            </Button>
            {can('finance.payments.reverse') && !reversed ? (
              <Button
                variant="danger-ghost"
                leadingIcon={<Undo2 />}
                onClick={() => setReverseOpen(true)}
                className="print:hidden"
              >
                {t('detail.reverse')}
              </Button>
            ) : null}
          </>
        }
      />

      {reversed ? (
        <Alert className="mb-4">
          {t('detail.reversedInfo', {
            date: format.dateTime(data.reversedAt),
            reason: data.reversalReason ?? '—',
          })}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title={t('detail.allocations')} description={t('detail.allocationsHint')} />
          {data.allocations.length === 0 ? (
            <EmptyState title={t('detail.noAllocations')} className="py-8" />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th>{t('detail.dueDate')}</Th>
                    <Th>{t('detail.item')}</Th>
                    <Th className="text-right">{t('columns.amount')}</Th>
                  </Tr>
                </THead>
                <TBody>
                  {data.allocations.map((allocation) => (
                    <Tr key={allocation.id} className={cn(allocation.reversedAt && 'opacity-60')}>
                      <Td className="tabular">{format.date(allocation.dueDate)}</Td>
                      <Td>{allocation.description}</Td>
                      <Td className="text-right">
                        <Money
                          amountMinor={allocation.amountMinor}
                          currency={data.currency}
                          className={cn(allocation.reversedAt && 'line-through')}
                        />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
          {data.unallocatedMinor > 0 && !reversed ? (
            <div className="flex justify-between border-t border-line-subtle px-4 py-3 text-sm">
              <span className="text-fg-muted">{t('detail.unallocated')}</span>
              <Money
                amountMinor={data.unallocatedMinor}
                currency={data.currency}
                className="font-medium"
              />
            </div>
          ) : null}
        </Panel>

        <Panel>
          <PanelBody className="flex flex-col gap-4">
            <div>
              <p className="text-xs text-fg-muted">{t('columns.amount')}</p>
              <p
                className={cn(
                  'mt-1 text-2xl font-semibold tracking-tight',
                  reversed && 'text-fg-subtle line-through',
                )}
              >
                <Money amountMinor={data.amountMinor} currency={data.currency} />
              </p>
            </div>
            <DescriptionList
              columns={1}
              items={[
                {
                  label: t('columns.student'),
                  value: (
                    <Link
                      href={`/students/${data.student.id}?tab=finance`}
                      className="text-primary hover:underline"
                    >
                      {data.student.fullName}
                    </Link>
                  ),
                },
                { label: t('columns.method'), value: t(`method.${data.method}`) },
                { label: t('detail.payer'), value: data.payerName },
                { label: t('detail.reference'), value: data.reference },
                { label: t('detail.notes'), value: data.notes },
                { label: t('detail.provider'), value: data.provider },
                { label: t('detail.recordedBy'), value: data.recordedBy },
                { label: t('detail.branch'), value: data.branch.name },
              ]}
            />
          </PanelBody>
        </Panel>
      </div>

      {can('finance.payments.reverse') ? (
        <ReverseDialog payment={data} open={reverseOpen} onOpenChange={setReverseOpen} />
      ) : null}
    </>
  );
}

function ReverseDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: Payment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.payments.detail');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();

  const schema = useMemo(
    () =>
      z.object({
        reason: z
          .string()
          .trim()
          .min(5, tv('tooShort', { min: 5 }))
          .max(500, tv('tooLong', { max: 500 })),
      }),
    [tv],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  const reverse = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api.post<Payment>(`/finance/payments/${payment.id}/reverse`, values),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.finance.payment(payment.id), updated);
      invalidateFinance(queryClient);
      toast.success(t('reversed'));
      onOpenChange(false);
      form.reset();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !reverse.isPending && onOpenChange(next)}>
      <DialogContent size="sm" closeLabel={tc('close')}>
        <DialogHeader title={t('reverseTitle')} description={t('reverseDescription')} />
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => reverse.mutate(values))}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="flex flex-col gap-4">
            {reverse.isError ? <Alert>{errorMessage(reverse.error)}</Alert> : null}
            <Field
              label={t('reverseReason')}
              required
              hint={t('reverseReasonHint')}
              error={form.formState.errors.reason?.message}
            >
              {(field) => <Textarea {...field} {...form.register('reason')} rows={3} autoFocus />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={reverse.isPending}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="danger" loading={reverse.isPending}>
              {t('reverse')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
