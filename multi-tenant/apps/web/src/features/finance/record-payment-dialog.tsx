'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type {
  Paginated,
  Payment,
  PaymentMethod,
  Receivable,
  RecordPaymentRequest,
  StudentDetail,
} from '@repo/contracts';
import { paymentMethodSchema } from '@repo/contracts';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  Select,
  Skeleton,
  cn,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/form-bits';
import { Money } from '@/components/money';
import { useOrganization } from '@/components/session/session-context';
import { useStudentFinance } from '@/features/students/student-overview';
import { api } from '@/lib/api/client';
import { parseIsoDate } from '@/lib/dates';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money';
import { queryKeys } from '@/lib/query-keys';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { MoneyInput, useMoneySchema } from './money-input';

const MANUAL_METHODS = paymentMethodSchema.options.filter(
  (method): method is Exclude<PaymentMethod, 'online'> => method !== 'online',
);

/** Invalidates everything a payment changes: balances, receivables, lists and dashboards. */
export function invalidateFinance(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
}

export function RecordPaymentDialog({
  student,
  open,
  onOpenChange,
}: {
  student: Pick<StudentDetail, 'id' | 'fullName' | 'branch' | 'guardians'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.recordPayment');
  const tm = useTranslations('finance.payments.method');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const organization = useOrganization();
  const format = useFormat();
  const queryClient = useQueryClient();
  const router = useRouter();
  const errorMessage = useErrorMessage();

  const finance = useStudentFinance(student.id, open);
  const account = finance.data?.accounts.find(
    (candidate) => candidate.branch.id === student.branch.id,
  );
  const currency = account?.currency ?? organization.defaultCurrency;
  const money = useMoneySchema(currency);

  const openItemsParams = {
    studentId: student.id,
    status: 'open',
    pageSize: 100,
    sort: 'dueDate',
    direction: 'asc',
  };
  const openItems = useQuery({
    queryKey: queryKeys.finance.receivables(openItemsParams),
    queryFn: ({ signal }) =>
      api.get<Paginated<Receivable>>('/finance/receivables', openItemsParams, signal),
    enabled: open,
  });

  // One key per submission attempt: a retried request (timeout, double click) is recorded once.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [manual, setManual] = useState<Record<string, string>>({});
  const [manualError, setManualError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        amount: money.required(),
        method: z.enum(MANUAL_METHODS),
        receivedOn: z
          .string()
          .refine(
            (value) => parseIsoDate(value) !== null && value <= format.today(),
            tv('invalidDate'),
          ),
        payerGuardianId: z.string(),
        payerName: z
          .string()
          .trim()
          .max(120, tv('tooLong', { max: 120 })),
        reference: z
          .string()
          .trim()
          .max(120, tv('tooLong', { max: 120 })),
        notes: z
          .string()
          .trim()
          .max(500, tv('tooLong', { max: 500 })),
        allocationMode: z.enum(['auto', 'manual']),
      }),
    [money, tv, format],
  );
  type FormInput = z.input<typeof schema>;
  type FormOutput = z.output<typeof schema>;

  const guardians = student.guardians ?? [];
  const defaultPayer =
    guardians.find((guardian) => guardian.isFinanciallyResponsible) ?? guardians[0];
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: '',
      method: 'cash',
      receivedOn: format.today(),
      payerGuardianId: defaultPayer?.id ?? '',
      payerName: '',
      reference: '',
      notes: '',
      allocationMode: 'auto',
    },
  });

  const amountText = useWatch({ control: form.control, name: 'amount' });
  const allocationMode = useWatch({ control: form.control, name: 'allocationMode' });
  const payerGuardianId = useWatch({ control: form.control, name: 'payerGuardianId' });
  const amountMinor = parseMoneyInput(amountText, currency, format.locale) ?? 0;
  const manualTotal = Object.values(manual).reduce(
    (sum, text) => sum + (parseMoneyInput(text, currency, format.locale) ?? 0),
    0,
  );

  const close = () => {
    onOpenChange(false);
    form.reset();
    setManual({});
    setManualError(null);
  };

  const record = useMutation({
    mutationFn: (values: FormOutput) => {
      const items = Object.entries(manual)
        .map(([receivableId, text]) => ({
          receivableId,
          amountMinor: parseMoneyInput(text, currency, format.locale) ?? 0,
        }))
        .filter((item) => item.amountMinor > 0);
      const body: RecordPaymentRequest = {
        studentId: student.id,
        currency,
        amountMinor: values.amount,
        method: values.method,
        // Past dates are stored at midday UTC, which keeps the calendar date in every zone.
        receivedAt:
          values.receivedOn === format.today() ? undefined : `${values.receivedOn}T12:00:00.000Z`,
        payerGuardianId: values.payerGuardianId || undefined,
        payerName: values.payerGuardianId ? undefined : values.payerName || undefined,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
        allocation:
          values.allocationMode === 'manual' ? { mode: 'manual', items } : { mode: 'auto' },
      };
      return api.post<Payment>('/finance/payments', body, { idempotencyKey });
    },
    onSuccess: (payment) => {
      invalidateFinance(queryClient);
      setIdempotencyKey(crypto.randomUUID());
      toast.success(t('success', { receipt: payment.receiptNumber }), {
        action: {
          label: tc('open'),
          onClick: () => router.push(`/finance/payments/${payment.id}`),
        },
      });
      close();
    },
  });

  const submit = form.handleSubmit((values) => {
    if (values.allocationMode === 'manual') {
      if (manualTotal > values.amount) {
        setManualError(t('overAllocated'));
        return;
      }
      const invalid = (openItems.data?.items ?? []).some((item) => {
        const text = manual[item.id];
        if (text === undefined || text.trim() === '') return false;
        const parsed = parseMoneyInput(text, currency, format.locale);
        return parsed === null || parsed > item.outstandingMinor;
      });
      if (invalid) {
        setManualError(tv('invalidAmount'));
        return;
      }
    }
    setManualError(null);
    record.mutate(values);
  });

  const setAmount = (value: number) =>
    form.setValue('amount', formatMoneyInput(value, currency, format.locale), {
      shouldDirty: true,
      shouldValidate: true,
    });

  const toggleItem = (item: Receivable, checked: boolean) => {
    setManual((current) => {
      const next = { ...current };
      if (!checked) {
        delete next[item.id];
        return next;
      }
      const used = Object.entries(current).reduce(
        (sum, [, text]) => sum + (parseMoneyInput(text, currency, format.locale) ?? 0),
        0,
      );
      const remaining = Math.max(0, amountMinor - used);
      const suggested = Math.min(item.outstandingMinor, remaining || item.outstandingMinor);
      next[item.id] = formatMoneyInput(suggested, currency, format.locale);
      return next;
    });
  };

  const { errors } = form.formState;
  const remainingCredit = allocationMode === 'manual' ? amountMinor - manualTotal : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : !record.isPending && close())}
    >
      <DialogContent size="lg" closeLabel={tc('close')}>
        <DialogHeader
          title={t('title')}
          description={t('description', { student: student.fullName })}
        />
        <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">
            {record.isError ? <Alert>{errorMessage(record.error)}</Alert> : null}
            {manualError ? <Alert>{manualError}</Alert> : null}

            <div className="grid gap-4 sm:grid-cols-2">
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
              <Field label={t('method')} required error={errors.method?.message}>
                {(field) => (
                  <Select {...field} {...form.register('method')}>
                    {MANUAL_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {tm(method)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            {account ? (
              <div className="-mt-2 flex flex-wrap gap-2">
                {account.overdueMinor > 0 ? (
                  <QuickAmount
                    label={t('fillOverdue')}
                    amountMinor={account.overdueMinor}
                    currency={currency}
                    onSelect={setAmount}
                  />
                ) : null}
                {account.nextDue ? (
                  <QuickAmount
                    label={t('fillNextDue')}
                    amountMinor={account.nextDue.amountMinor}
                    currency={currency}
                    onSelect={setAmount}
                  />
                ) : null}
                {account.outstandingMinor > 0 ? (
                  <QuickAmount
                    label={t('fillOutstanding')}
                    amountMinor={account.outstandingMinor}
                    currency={currency}
                    onSelect={setAmount}
                  />
                ) : null}
              </div>
            ) : finance.isPending ? (
              <Skeleton className="-mt-2 h-6 w-64" />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('receivedAt')} required error={errors.receivedOn?.message}>
                {(field) => (
                  <Input
                    {...field}
                    {...form.register('receivedOn')}
                    type="date"
                    max={format.today()}
                  />
                )}
              </Field>
              <Field label={t('payer')} optionalLabel={tc('optional')}>
                {(field) => (
                  <Select {...field} {...form.register('payerGuardianId')}>
                    {guardians.map((guardian) => (
                      <option key={guardian.id} value={guardian.id}>
                        {guardian.fullName}
                      </option>
                    ))}
                    <option value="">{t('payerOther')}</option>
                  </Select>
                )}
              </Field>
              {payerGuardianId === '' ? (
                <Field
                  label={t('payerName')}
                  optionalLabel={tc('optional')}
                  error={errors.payerName?.message}
                >
                  {(field) => <Input {...field} {...form.register('payerName')} />}
                </Field>
              ) : null}
              <Field
                label={t('reference')}
                optionalLabel={tc('optional')}
                error={errors.reference?.message}
              >
                {(field) => <Input {...field} {...form.register('reference')} />}
              </Field>
            </div>
            <Field label={t('notes')} optionalLabel={tc('optional')} error={errors.notes?.message}>
              {(field) => <Input {...field} {...form.register('notes')} />}
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium text-fg">{t('allocation')}</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    value="auto"
                    {...form.register('allocationMode')}
                    className="accent-primary"
                  />
                  {t('allocationAuto')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    value="manual"
                    {...form.register('allocationMode')}
                    className="accent-primary"
                  />
                  {t('allocationManual')}
                </label>
              </div>
              {allocationMode === 'manual' ? (
                <div className="mt-1 rounded-md border border-line">
                  {openItems.isPending ? (
                    <div className="space-y-2 p-3">
                      <Skeleton className="h-4" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                  ) : (openItems.data?.items.length ?? 0) === 0 ? (
                    <p className="p-3 text-sm text-fg-muted">{t('noOpenItems')}</p>
                  ) : (
                    <ul className="max-h-56 divide-y divide-line-subtle overflow-y-auto">
                      {openItems.data?.items.map((item) => {
                        const selected = manual[item.id] !== undefined;
                        return (
                          <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked) => toggleItem(item, checked === true)}
                              aria-label={item.description}
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'truncate text-sm',
                                  item.isOverdue && 'text-danger-fg',
                                )}
                              >
                                {item.description}
                              </p>
                              <p className="text-xs text-fg-muted">
                                {format.date(item.dueDate)} ·{' '}
                                {t('outstanding', {
                                  amount: format.money(item.outstandingMinor, item.currency),
                                })}
                              </p>
                            </div>
                            {selected ? (
                              <MoneyInput
                                currency={currency}
                                value={manual[item.id]}
                                onChange={(event) =>
                                  setManual((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                                className="w-36"
                                aria-label={t('amount')}
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="flex flex-wrap justify-between gap-2 border-t border-line-subtle bg-surface-muted px-3 py-2 text-xs">
                    <span
                      className={cn(
                        'tabular',
                        manualTotal > amountMinor ? 'text-danger-fg' : 'text-fg-muted',
                      )}
                    >
                      {t('allocated', { amount: format.money(manualTotal, currency) })}
                    </span>
                    {remainingCredit > 0 ? (
                      <span className="tabular text-fg-muted">
                        {t('remainingCredit', { amount: format.money(remainingCredit, currency) })}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </fieldset>
          </DialogBody>
          <DialogFooter className="justify-between">
            <span className="text-sm text-fg-muted">
              {amountMinor > 0 ? (
                <Money
                  amountMinor={amountMinor}
                  currency={currency}
                  className="font-semibold text-fg"
                />
              ) : null}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={close} disabled={record.isPending}>
                {tc('cancel')}
              </Button>
              <Button type="submit" variant="primary" loading={record.isPending}>
                {t('submit')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAmount({
  label,
  amountMinor,
  currency,
  onSelect,
}: {
  label: string;
  amountMinor: number;
  currency: string;
  onSelect: (amountMinor: number) => void;
}) {
  const format = useFormat();
  return (
    <button
      type="button"
      onClick={() => onSelect(amountMinor)}
      className="inline-flex h-6 items-center gap-1 rounded-sm border border-line bg-surface-muted px-2 text-xs text-fg-muted hover:border-line-strong hover:text-fg"
    >
      {label}:{' '}
      <span className="tabular font-medium text-fg">{format.money(amountMinor, currency)}</span>
    </button>
  );
}

export function ReceiptLink({ payment }: { payment: Pick<Payment, 'id' | 'receiptNumber'> }) {
  return (
    <Link
      href={`/finance/payments/${payment.id}`}
      className="font-mono text-xs hover:text-primary hover:underline"
    >
      {payment.receiptNumber}
    </Link>
  );
}
