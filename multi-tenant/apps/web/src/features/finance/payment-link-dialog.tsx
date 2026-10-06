'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CreatePaymentLinkRequest, PaymentLink, StudentDetail } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/form-bits';
import { Money } from '@/components/money';
import { useOrganization } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { formatMoneyInput } from '@/lib/money';
import { queryKeys } from '@/lib/query-keys';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { PaymentLinkStatusBadge } from './finance-badges';
import { MoneyInput, useMoneySchema } from './money-input';
import { invalidateFinance } from './record-payment-dialog';

/**
 * Creates a hosted-checkout link through the payment provider abstraction. In development the
 * mock provider can complete the checkout with a signed webhook, exercising the real code path.
 */
export function PaymentLinkDialog({
  student,
  suggestedAmountMinor,
  open,
  onOpenChange,
}: {
  student: Pick<StudentDetail, 'id' | 'fullName'>;
  suggestedAmountMinor?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.link');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const organization = useOrganization();
  const currency = organization.defaultCurrency;
  const format = useFormat();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const money = useMoneySchema(currency);
  const [linkId, setLinkId] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        amount: money.required(),
        description: z
          .string()
          .trim()
          .min(2, tv('tooShort', { min: 2 }))
          .max(160, tv('tooLong', { max: 160 })),
      }),
    [money, tv],
  );
  type FormInput = z.input<typeof schema>;
  type FormOutput = z.output<typeof schema>;
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    values: {
      amount: suggestedAmountMinor
        ? formatMoneyInput(suggestedAmountMinor, currency, format.locale)
        : '',
      description: t('defaultDescription', { student: student.fullName }),
    },
  });

  const link = useQuery({
    queryKey: queryKeys.finance.paymentLink(linkId ?? ''),
    queryFn: ({ signal }) =>
      api.get<PaymentLink>(`/finance/payment-links/${linkId}`, undefined, signal),
    enabled: open && linkId !== null,
  });

  const create = useMutation({
    mutationFn: (values: FormOutput) => {
      const body: CreatePaymentLinkRequest = {
        studentId: student.id,
        currency,
        amountMinor: values.amount,
        description: values.description,
      };
      return api.post<PaymentLink>('/finance/payment-links', body);
    },
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.finance.paymentLink(created.id), created);
      setLinkId(created.id);
      toast.success(t('created'));
    },
  });

  const simulate = useMutation({
    mutationFn: () => api.post<{ status: string }>(`/finance/payment-links/${linkId}/simulate`),
    onSuccess: () => {
      invalidateFinance(queryClient);
      void link.refetch();
      toast.success(t('simulated'));
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const close = () => {
    onOpenChange(false);
    setLinkId(null);
    form.reset();
    create.reset();
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(tc('copied'));
    } catch {
      toast.error(tc('unexpectedError'));
    }
  };

  const current = link.data ?? create.data;
  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent size="md" closeLabel={tc('close')}>
        <DialogHeader title={t('title')} description={t('description')} />
        {current ? (
          <>
            <DialogBody className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Money
                  amountMinor={current.amountMinor}
                  currency={current.currency}
                  className="text-lg font-semibold"
                />
                <PaymentLinkStatusBadge status={current.status} />
              </div>
              <Field label={t('url')}>
                {(field) => (
                  <div className="flex gap-2">
                    <Input
                      {...field}
                      readOnly
                      value={current.checkoutUrl}
                      className="font-mono text-xs"
                      onFocus={(event) => event.target.select()}
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => void copy(current.checkoutUrl)}
                      aria-label={tc('copy')}
                    >
                      <Copy />
                    </Button>
                  </div>
                )}
              </Field>
              <p className="text-xs text-fg-muted">
                {t('expires', { date: format.dateTime(current.expiresAt) })}
              </p>
              {current.provider === 'mock' && current.status === 'created' ? (
                <Alert tone="info" title={t('simulateTitle')}>
                  <p>{t('simulateHint')}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    leadingIcon={<FlaskConical />}
                    loading={simulate.isPending}
                    onClick={() => simulate.mutate()}
                  >
                    {t('simulate')}
                  </Button>
                </Alert>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={close}>
                {tc('close')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            onSubmit={form.handleSubmit((values) => create.mutate(values))}
            className="flex min-h-0 flex-1 flex-col"
          >
            <DialogBody className="flex flex-col gap-4">
              {create.isError ? <Alert>{errorMessage(create.error)}</Alert> : null}
              <Field label={t('amount')} required error={errors.amount?.message}>
                {(field) => (
                  <MoneyInput
                    {...field}
                    {...form.register('amount')}
                    currency={currency}
                    autoFocus
                  />
                )}
              </Field>
              <Field label={t('label')} required error={errors.description?.message}>
                {(field) => <Input {...field} {...form.register('description')} />}
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={close} disabled={create.isPending}>
                {tc('cancel')}
              </Button>
              <Button type="submit" variant="primary" loading={create.isPending}>
                {t('submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
