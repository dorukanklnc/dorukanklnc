'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type {
  Agreement,
  AgreementPreview,
  AgreementPreviewRequest,
  CreateAgreementRequest,
  StudentDetail,
} from '@repo/contracts';
import { discountCategorySchema } from '@repo/contracts';
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  cn,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/form-bits';
import { Money } from '@/components/money';
import { useOrganization } from '@/components/session/session-context';
import { useAcademicYears } from '@/features/academics/queries';
import { api } from '@/lib/api/client';
import { firstOfNextMonth, parseIsoDate } from '@/lib/dates';
import { parseMoneyInput, parsePercentInput } from '@/lib/money';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { MoneyInput, useMoneySchema } from './money-input';
import { invalidateFinance } from './record-payment-dialog';

type Step = 'amount' | 'plan' | 'review';
const STEPS: Step[] = ['amount', 'plan', 'review'];
const DISCOUNT_CATEGORIES = discountCategorySchema.options;

export function AgreementWizard({
  student,
  open,
  onOpenChange,
}: {
  student: Pick<StudentDetail, 'id' | 'fullName' | 'guardians'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.agreement');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const td = useTranslations('finance.discountCategory');
  const trc = useTranslations('finance.receivables.columns');
  const organization = useOrganization();
  const currency = organization.defaultCurrency;
  const format = useFormat();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const money = useMoneySchema(currency);
  const years = useAcademicYears(open);
  const currentYear = years.data?.find((year) => year.isCurrent);
  const [step, setStep] = useState<Step>('amount');

  const schema = useMemo(() => {
    const date = z.string().refine((value) => parseIsoDate(value) !== null, tv('invalidDate'));
    return z
      .object({
        title: z
          .string()
          .trim()
          .min(2, tv('tooShort', { min: 2 }))
          .max(120, tv('tooLong', { max: 120 })),
        grossAmount: money.required(),
        responsibleGuardianId: z.string(),
        discounts: z.array(
          z.object({
            category: z.enum(DISCOUNT_CATEGORIES),
            label: z
              .string()
              .trim()
              .min(1, tv('required'))
              .max(80, tv('tooLong', { max: 80 })),
            kind: z.enum(['percentage', 'fixed']),
            value: z.string().trim().min(1, tv('required')),
          }),
        ),
        downPayment: money.optional(),
        downPaymentDueDate: z.string(),
        installmentCount: z.coerce
          .number<string>({ error: tv('invalid') })
          .int(tv('invalid'))
          .min(1, tv('invalid'))
          .max(36, tv('invalid')),
        firstDueDate: date,
        roundingUnitMinor: z.enum(['100', '1']),
        remainderPlacement: z.enum(['last', 'first']),
      })
      .superRefine((values, ctx) => {
        values.discounts.forEach((discount, index) => {
          const parsed =
            discount.kind === 'percentage'
              ? parsePercentInput(discount.value, format.locale)
              : parseMoneyInput(discount.value, currency, format.locale);
          if (parsed === null || parsed === 0) {
            ctx.addIssue({
              code: 'custom',
              path: ['discounts', index, 'value'],
              message: discount.kind === 'percentage' ? tv('invalidPercent') : tv('invalidAmount'),
            });
          }
        });
        if (values.downPayment > 0 && parseIsoDate(values.downPaymentDueDate) === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['downPaymentDueDate'],
            message: tv('invalidDate'),
          });
        }
      });
  }, [money, tv, format.locale, currency]);
  type FormInput = z.input<typeof schema>;
  type FormOutput = z.output<typeof schema>;

  const guardians = student.guardians ?? [];
  const responsible =
    guardians.find((guardian) => guardian.isFinanciallyResponsible) ?? guardians[0];
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      grossAmount: '',
      responsibleGuardianId: responsible?.id ?? '',
      discounts: [],
      downPayment: '',
      downPaymentDueDate: format.today(),
      installmentCount: '8',
      firstDueDate: firstOfNextMonth(format.today()),
      roundingUnitMinor: '100',
      remainderPlacement: 'last',
    },
  });
  const discounts = useFieldArray({ control: form.control, name: 'discounts' });

  // Default title once the academic year is known (e.g. "2026-2027 Eğitim Ücreti").
  const defaultTitle = t('defaultTitle', { year: currentYear?.name ?? format.today().slice(0, 4) });
  const titleValue = useWatch({ control: form.control, name: 'title' });

  const [request, setRequest] = useState<AgreementPreviewRequest | null>(null);
  const preview = useQuery({
    queryKey: ['finance', 'agreement-preview', request],
    queryFn: ({ signal }) =>
      api.post<AgreementPreview>('/finance/agreements/preview', request, { signal }),
    enabled: open && step === 'review' && request !== null,
    staleTime: Infinity,
    retry: false,
  });

  const buildRequest = (values: FormOutput): AgreementPreviewRequest => ({
    currency,
    grossAmountMinor: values.grossAmount,
    discounts: values.discounts.map((discount) =>
      discount.kind === 'percentage'
        ? {
            category: discount.category,
            label: discount.label,
            kind: 'percentage' as const,
            percentageBps: parsePercentInput(discount.value, format.locale) ?? 0,
          }
        : {
            category: discount.category,
            label: discount.label,
            kind: 'fixed' as const,
            amountMinor: parseMoneyInput(discount.value, currency, format.locale) ?? 0,
          },
    ),
    plan: {
      installmentCount: values.installmentCount,
      firstDueDate: values.firstDueDate,
      downPaymentMinor: values.downPayment,
      downPaymentDueDate: values.downPayment > 0 ? values.downPaymentDueDate : undefined,
      roundingUnitMinor: values.roundingUnitMinor === '1' ? 1 : 100,
      remainderPlacement: values.remainderPlacement,
    },
  });

  const create = useMutation({
    mutationFn: (values: FormOutput) => {
      const body: CreateAgreementRequest = {
        ...buildRequest(values),
        studentId: student.id,
        title: values.title.trim() || defaultTitle,
        academicYearId: currentYear?.id,
        responsibleGuardianId: values.responsibleGuardianId || undefined,
        signedOn: format.today(),
      };
      return api.post<Agreement>('/finance/agreements', body);
    },
    onSuccess: (agreement) => {
      invalidateFinance(queryClient);
      toast.success(t('success', { count: agreement.plan?.installmentCount ?? 0 }));
      close();
    },
  });

  const close = () => {
    onOpenChange(false);
    form.reset();
    setStep('amount');
    setRequest(null);
    create.reset();
  };

  const next = async () => {
    if (step === 'amount') {
      if (titleValue.trim() === '') form.setValue('title', defaultTitle);
      const valid = await form.trigger([
        'title',
        'grossAmount',
        'discounts',
        'responsibleGuardianId',
      ]);
      if (valid) setStep('plan');
      return;
    }
    if (step === 'plan') {
      await form.handleSubmit((values) => {
        setRequest(buildRequest(values));
        setStep('review');
      })();
    }
  };

  const { errors } = form.formState;
  const watchedDiscounts = useWatch({ control: form.control, name: 'discounts' });
  const downPaymentText = useWatch({ control: form.control, name: 'downPayment' });
  const hasDownPayment = (parseMoneyInput(downPaymentText, currency, format.locale) ?? 0) > 0;
  const stepIndex = STEPS.indexOf(step);

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => (value ? onOpenChange(true) : !create.isPending && close())}
    >
      <SheetContent size="xl" closeLabel={tc('close')}>
        <SheetHeader
          title={t('title')}
          description={t('description', { student: student.fullName })}
        />
        <ol className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm">
          {STEPS.map((key, index) => (
            <li key={key} className="flex items-center gap-2">
              {index > 0 ? <span className="h-px w-6 bg-line-strong" aria-hidden="true" /> : null}
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-2xs font-semibold',
                  index < stepIndex && 'bg-primary text-primary-fg',
                  index === stepIndex &&
                    'bg-primary-subtle text-primary-subtle-fg ring-1 ring-primary',
                  index > stepIndex && 'bg-surface-muted text-fg-subtle',
                )}
                aria-hidden="true"
              >
                {index < stepIndex ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              <span className={cn(index === stepIndex ? 'font-medium text-fg' : 'text-fg-muted')}>
                {t(`steps.${key}`)}
              </span>
            </li>
          ))}
        </ol>

        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 'review') void form.handleSubmit((values) => create.mutate(values))();
            else void next();
          }}
        >
          <SheetBody className="flex flex-col gap-5">
            {step === 'amount' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t('agreementTitle')}
                    error={errors.title?.message}
                    className="sm:col-span-2"
                  >
                    {(field) => (
                      <Input {...field} {...form.register('title')} placeholder={defaultTitle} />
                    )}
                  </Field>
                  <Field label={t('grossAmount')} required error={errors.grossAmount?.message}>
                    {(field) => (
                      <MoneyInput
                        {...field}
                        {...form.register('grossAmount')}
                        currency={currency}
                        autoFocus
                      />
                    )}
                  </Field>
                  <Field label={t('responsibleGuardian')} optionalLabel={tc('optional')}>
                    {(field) => (
                      <Select {...field} {...form.register('responsibleGuardianId')}>
                        <option value="">{tc('notSet')}</option>
                        {guardians.map((guardian) => (
                          <option key={guardian.id} value={guardian.id}>
                            {guardian.fullName}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-fg">{t('discounts')}</h3>
                    <p className="mt-0.5 text-xs text-fg-muted">{t('discountsHint')}</p>
                  </div>
                  {discounts.fields.map((discountField, index) => {
                    const discountErrors = errors.discounts?.[index];
                    const kind = watchedDiscounts[index]?.kind ?? 'percentage';
                    return (
                      <div
                        key={discountField.id}
                        className="grid items-start gap-3 rounded-md border border-line p-3 sm:grid-cols-[1.1fr_1.4fr_0.9fr_1fr_auto]"
                      >
                        <Field label={t('discountCategory')}>
                          {(field) => (
                            <Select
                              {...field}
                              {...form.register(`discounts.${index}.category`, {
                                onChange: (event: { target: { value: string } }) => {
                                  const label = form.getValues(`discounts.${index}.label`);
                                  if (
                                    !label ||
                                    DISCOUNT_CATEGORIES.some((category) => td(category) === label)
                                  ) {
                                    form.setValue(
                                      `discounts.${index}.label`,
                                      td(
                                        event.target.value as (typeof DISCOUNT_CATEGORIES)[number],
                                      ),
                                    );
                                  }
                                },
                              })}
                            >
                              {DISCOUNT_CATEGORIES.map((category) => (
                                <option key={category} value={category}>
                                  {td(category)}
                                </option>
                              ))}
                            </Select>
                          )}
                        </Field>
                        <Field label={t('discountLabel')} error={discountErrors?.label?.message}>
                          {(field) => (
                            <Input {...field} {...form.register(`discounts.${index}.label`)} />
                          )}
                        </Field>
                        <Field label={t('discountKind')}>
                          {(field) => (
                            <Select {...field} {...form.register(`discounts.${index}.kind`)}>
                              <option value="percentage">{t('percentage')}</option>
                              <option value="fixed">{t('fixed')}</option>
                            </Select>
                          )}
                        </Field>
                        <Field label={t('discountValue')} error={discountErrors?.value?.message}>
                          {(field) =>
                            kind === 'percentage' ? (
                              <Input
                                {...field}
                                {...form.register(`discounts.${index}.value`)}
                                inputMode="decimal"
                                className="tabular"
                                trailing={<span className="text-xs text-fg-muted">%</span>}
                              />
                            ) : (
                              <MoneyInput
                                {...field}
                                {...form.register(`discounts.${index}.value`)}
                                currency={currency}
                              />
                            )
                          }
                        </Field>
                        <Button
                          variant="danger-ghost"
                          size="icon-sm"
                          className="sm:mt-6"
                          onClick={() => discounts.remove(index)}
                          aria-label={tc('close')}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    );
                  })}
                  {discounts.fields.length < 10 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<Plus />}
                      className="self-start"
                      onClick={() =>
                        discounts.append({
                          category: 'sibling',
                          label: td('sibling'),
                          kind: 'percentage',
                          value: '',
                        })
                      }
                    >
                      {t('addDiscount')}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}

            {step === 'plan' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t('downPayment')}
                  optionalLabel={tc('optional')}
                  error={errors.downPayment?.message}
                >
                  {(field) => (
                    <MoneyInput
                      {...field}
                      {...form.register('downPayment')}
                      currency={currency}
                      autoFocus
                    />
                  )}
                </Field>
                <Field label={t('downPaymentDueDate')} error={errors.downPaymentDueDate?.message}>
                  {(field) => (
                    <Input
                      {...field}
                      {...form.register('downPaymentDueDate')}
                      type="date"
                      disabled={!hasDownPayment}
                    />
                  )}
                </Field>
                <Field
                  label={t('installmentCount')}
                  required
                  error={errors.installmentCount?.message}
                >
                  {(field) => (
                    <Input
                      {...field}
                      {...form.register('installmentCount')}
                      type="number"
                      min={1}
                      max={36}
                      className="tabular"
                    />
                  )}
                </Field>
                <Field label={t('firstDueDate')} required error={errors.firstDueDate?.message}>
                  {(field) => <Input {...field} {...form.register('firstDueDate')} type="date" />}
                </Field>
                <Field label={t('rounding')}>
                  {(field) => (
                    <Select {...field} {...form.register('roundingUnitMinor')}>
                      <option value="100">{t('roundingWhole')}</option>
                      <option value="1">{t('roundingKurus')}</option>
                    </Select>
                  )}
                </Field>
                <Field label={t('remainder')}>
                  {(field) => (
                    <Select {...field} {...form.register('remainderPlacement')}>
                      <option value="last">{t('remainderLast')}</option>
                      <option value="first">{t('remainderFirst')}</option>
                    </Select>
                  )}
                </Field>
              </div>
            ) : null}

            {step === 'review' ? (
              preview.isPending ? (
                <div className="space-y-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-48" />
                </div>
              ) : preview.isError ? (
                <Alert>{errorMessage(preview.error)}</Alert>
              ) : (
                <>
                  {create.isError ? <Alert>{errorMessage(create.error)}</Alert> : null}
                  <dl className="grid grid-cols-3 divide-x divide-line rounded-md border border-line">
                    <div className="p-3">
                      <dt className="text-xs text-fg-muted">{t('gross')}</dt>
                      <dd className="mt-1 text-md font-semibold">
                        <Money
                          amountMinor={preview.data.grossAmountMinor}
                          currency={preview.data.currency}
                        />
                      </dd>
                    </div>
                    <div className="p-3">
                      <dt className="text-xs text-fg-muted">{t('discountTotal')}</dt>
                      <dd className="mt-1 text-md font-semibold text-success-fg">
                        <Money
                          amountMinor={-preview.data.discountTotalMinor}
                          currency={preview.data.currency}
                        />
                      </dd>
                    </div>
                    <div className="p-3">
                      <dt className="text-xs text-fg-muted">{t('net')}</dt>
                      <dd className="mt-1 text-md font-semibold">
                        <Money
                          amountMinor={preview.data.netAmountMinor}
                          currency={preview.data.currency}
                        />
                      </dd>
                    </div>
                  </dl>
                  {preview.data.discounts.length > 0 ? (
                    <ul className="flex flex-col gap-1 text-sm">
                      {preview.data.discounts.map((line, index) => (
                        <li key={index} className="flex justify-between gap-3">
                          <span className="text-fg-muted">
                            {line.label}
                            {line.percentageBps !== null
                              ? ` (${format.basisPoints(line.percentageBps)})`
                              : ''}
                          </span>
                          <Money
                            amountMinor={-line.amountMinor}
                            currency={preview.data.currency}
                            className="text-success-fg"
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-fg">{t('schedule')}</h3>
                    {/* No inner scroll area: every installment stays visible; the sheet body scrolls. */}
                    <div className="overflow-hidden rounded-md border border-line">
                      <Table>
                        <THead>
                          <Tr>
                            <Th className="w-16">#</Th>
                            <Th>{trc('dueDate')}</Th>
                            <Th className="text-right">{tc('amount')}</Th>
                          </Tr>
                        </THead>
                        <TBody>
                          {preview.data.schedule.map((line) => (
                            <Tr key={line.sequenceNo}>
                              <Td className="text-fg-muted">
                                {line.isDownPayment ? (
                                  <Badge tone="info">{t('downPaymentLine')}</Badge>
                                ) : (
                                  t('installmentLine', { number: line.sequenceNo })
                                )}
                              </Td>
                              <Td className="tabular">{format.date(line.dueDate, 'medium')}</Td>
                              <Td className="tabular text-right">
                                <Money
                                  amountMinor={line.amountMinor}
                                  currency={preview.data.currency}
                                />
                              </Td>
                            </Tr>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  </div>
                </>
              )
            ) : null}
          </SheetBody>
          <SheetFooter className="justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)] ?? 'amount')}
              disabled={step === 'amount' || create.isPending}
            >
              {tc('back')}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={close} disabled={create.isPending}>
                {tc('cancel')}
              </Button>
              {step === 'review' ? (
                <Button
                  type="submit"
                  variant="primary"
                  loading={create.isPending}
                  disabled={!preview.isSuccess}
                >
                  {t('submit')}
                </Button>
              ) : (
                <Button type="submit" variant="primary">
                  {tc('next')}
                </Button>
              )}
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
