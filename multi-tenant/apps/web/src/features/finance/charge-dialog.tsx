'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateChargeRequest, Receivable, StudentDetail } from '@repo/contracts';
import { receivableCategorySchema } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  Select,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/form-bits';
import { useOrganization } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { parseIsoDate } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { MoneyInput, useMoneySchema } from './money-input';
import { invalidateFinance } from './record-payment-dialog';

const CHARGE_CATEGORIES = receivableCategorySchema.options.filter(
  (category): category is CreateChargeRequest['category'] =>
    category !== 'tuition' && category !== 'down_payment',
);

/** Adds a one-off charge (books, uniform, trip…) to the student's account. */
export function ChargeDialog({
  student,
  open,
  onOpenChange,
}: {
  student: Pick<StudentDetail, 'id' | 'fullName'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.charge');
  const tcat = useTranslations('finance.category');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const organization = useOrganization();
  const currency = organization.defaultCurrency;
  const format = useFormat();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const money = useMoneySchema(currency);

  const schema = useMemo(
    () =>
      z.object({
        category: z.enum(CHARGE_CATEGORIES),
        description: z
          .string()
          .trim()
          .min(2, tv('tooShort', { min: 2 }))
          .max(160, tv('tooLong', { max: 160 })),
        amount: money.required(),
        dueDate: z.string().refine((value) => parseIsoDate(value) !== null, tv('invalidDate')),
      }),
    [money, tv],
  );
  type FormInput = z.input<typeof schema>;
  type FormOutput = z.output<typeof schema>;
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'books', description: '', amount: '', dueDate: format.today() },
  });

  const close = () => {
    onOpenChange(false);
    form.reset();
  };

  const create = useMutation({
    mutationFn: (values: FormOutput) => {
      const body: CreateChargeRequest = {
        studentId: student.id,
        currency,
        category: values.category,
        description: values.description,
        amountMinor: values.amount,
        dueDate: values.dueDate,
      };
      return api.post<Receivable>('/finance/receivables/charges', body);
    },
    onSuccess: () => {
      invalidateFinance(queryClient);
      toast.success(t('success'));
      close();
    },
  });

  const { errors } = form.formState;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : !create.isPending && close())}
    >
      <DialogContent size="sm" closeLabel={tc('close')}>
        <DialogHeader
          title={t('title')}
          description={`${student.fullName} · ${t('description')}`}
        />
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="flex flex-col gap-4">
            {create.isError ? <Alert>{errorMessage(create.error)}</Alert> : null}
            <Field label={t('category')} required error={errors.category?.message}>
              {(field) => (
                <Select
                  {...field}
                  {...form.register('category', {
                    onChange: (event: { target: { value: string } }) => {
                      const current = form.getValues('description');
                      if (
                        !current ||
                        CHARGE_CATEGORIES.some((category) => tcat(category) === current)
                      ) {
                        form.setValue(
                          'description',
                          tcat(event.target.value as CreateChargeRequest['category']),
                        );
                      }
                    },
                  })}
                >
                  {CHARGE_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {tcat(category)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('label')} required error={errors.description?.message}>
              {(field) => (
                <Input {...field} {...form.register('description')} placeholder={tcat('books')} />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('amount')} required error={errors.amount?.message}>
                {(field) => (
                  <MoneyInput {...field} {...form.register('amount')} currency={currency} />
                )}
              </Field>
              <Field label={t('dueDate')} required error={errors.dueDate?.message}>
                {(field) => <Input {...field} {...form.register('dueDate')} type="date" />}
              </Field>
            </div>
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
      </DialogContent>
    </Dialog>
  );
}
