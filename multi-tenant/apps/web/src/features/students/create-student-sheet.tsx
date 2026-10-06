'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type GuardianRelationship,
  type StudentDetail,
  type createStudentRequestSchema,
  isValidTurkishNationalId,
} from '@repo/contracts';
import {
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  Textarea,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo } from 'react';
import { type Path, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/form-bits';
import { usePermissions, useSession } from '@/components/session/session-context';
import { useClasses } from '@/features/academics/queries';
import { api } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import { parseIsoDate } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';
import { useApplyFieldErrors, useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { GENDERS, GUARDIAN_RELATIONSHIPS } from './constants';

const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;
const MAX_GUARDIANS = 2;

function useStudentFormSchema() {
  const tv = useTranslations('validation');
  return useMemo(() => {
    const name = z
      .string()
      .trim()
      .min(1, tv('required'))
      .max(80, tv('tooLong', { max: 80 }));
    const phone = z
      .string()
      .trim()
      .refine((value) => value === '' || PHONE_PATTERN.test(value), tv('invalidPhone'));
    const email = z
      .string()
      .trim()
      .max(254, tv('tooLong', { max: 254 }))
      .refine((value) => value === '' || z.email().safeParse(value).success, tv('invalidEmail'));
    const optionalDate = z
      .string()
      .refine((value) => value === '' || parseIsoDate(value) !== null, tv('invalidDate'));
    const nationalId = z
      .string()
      .trim()
      .refine((value) => value === '' || isValidTurkishNationalId(value), tv('invalidNationalId'));

    return z.object({
      firstName: name,
      lastName: name,
      gender: z.enum([...GENDERS, '']),
      birthDate: optionalDate,
      nationalId,
      phone,
      email,
      address: z
        .string()
        .trim()
        .max(300, tv('tooLong', { max: 300 })),
      branchId: z.string().min(1, tv('required')),
      classId: z.string(),
      enrolledOn: optionalDate,
      guardians: z
        .array(
          z.object({
            firstName: name,
            lastName: name,
            // No default: a pre-selected relationship is easily left wrong by mistake. (A length
            // check rather than `!== ''`, which TypeScript would infer as a narrowing predicate and
            // split the form's input and output types.)
            relationship: z
              .enum([...GUARDIAN_RELATIONSHIPS, ''])
              .refine((value) => value.length > 0, tv('required')),
            phone,
            email,
            isPrimaryContact: z.boolean(),
            isFinanciallyResponsible: z.boolean(),
          }),
        )
        .max(MAX_GUARDIANS),
    });
  }, [tv]);
}

type FormValues = z.infer<ReturnType<typeof useStudentFormSchema>>;
type GuardianValues = FormValues['guardians'][number];

const emptyGuardian = (primary: boolean): GuardianValues => ({
  firstName: '',
  lastName: '',
  relationship: '',
  phone: '',
  email: '',
  isPrimaryContact: primary,
  isFinanciallyResponsible: primary,
});

const blank = (value: string) => (value.trim() === '' ? undefined : value.trim());

/** The schema rejects an empty relationship; this only narrows the type for the request. */
function chosenRelationship(value: GuardianRelationship | ''): GuardianRelationship {
  if (value === '') throw new Error('Guardian relationship must be validated before submit');
  return value;
}

export function CreateStudentSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('students');
  const tc = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const format = useFormat();
  const { can } = usePermissions();
  const errorMessage = useErrorMessage();
  const applyFieldErrors = useApplyFieldErrors();
  const schema = useStudentFormSchema();
  const canWriteGuardians = can('guardians.write');
  const branches = session.branches;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: '',
      birthDate: '',
      nationalId: '',
      phone: '',
      email: '',
      address: '',
      branchId: branches.length === 1 ? (branches[0]?.id ?? '') : '',
      classId: '',
      enrolledOn: format.today(),
      guardians: canWriteGuardians ? [emptyGuardian(true)] : [],
    },
  });
  const guardians = useFieldArray({ control: form.control, name: 'guardians' });
  const branchId = useWatch({ control: form.control, name: 'branchId' });
  const watchedGuardians = useWatch({ control: form.control, name: 'guardians' });
  const classes = useClasses({ branchId }, open && branchId !== '');

  const create = useMutation({
    mutationFn: (values: FormValues) => {
      const body: z.input<typeof createStudentRequestSchema> = {
        branchId: values.branchId,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        gender: values.gender === '' ? undefined : values.gender,
        birthDate: blank(values.birthDate),
        nationalId: blank(values.nationalId),
        phone: blank(values.phone),
        email: blank(values.email),
        address: blank(values.address),
        enrolledOn: blank(values.enrolledOn),
        classId: blank(values.classId),
        guardians: values.guardians.map((guardian) => ({
          firstName: guardian.firstName.trim(),
          lastName: guardian.lastName.trim(),
          relationship: chosenRelationship(guardian.relationship),
          phone: blank(guardian.phone),
          email: blank(guardian.email),
          isPrimaryContact: guardian.isPrimaryContact,
          isFinanciallyResponsible: guardian.isFinanciallyResponsible,
        })),
      };
      return api.post<StudentDetail>('/students', body);
    },
    onSuccess: (student) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success(t('form.created', { name: student.fullName }));
      form.reset();
      router.push(`/students/${student.id}`);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'NATIONAL_ID_TAKEN') {
        form.setError('nationalId', { type: 'server', message: errorMessage(error) });
        return;
      }
      const fields = new Set(Object.keys(form.getValues()));
      applyFieldErrors(error, form.setError, (path) =>
        fields.has(path.split('.')[0] ?? '') ? (path as Path<FormValues>) : null,
      );
    },
  });

  const { errors } = form.formState;
  const showGenericError =
    create.isError && !(isApiError(create.error) && create.error.code === 'NATIONAL_ID_TAKEN');

  const setPrimary = (index: number, checked: boolean) => {
    guardians.fields.forEach((_, other) => {
      form.setValue(`guardians.${other}.isPrimaryContact`, other === index ? checked : false, {
        shouldDirty: true,
      });
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) onOpenChange(next);
      }}
    >
      <SheetContent size="lg" closeLabel={tc('close')}>
        <SheetHeader title={t('form.createTitle')} description={t('form.createDescription')} />
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
        >
          <SheetBody className="flex flex-col gap-6">
            {showGenericError ? <Alert>{errorMessage(create.error)}</Alert> : null}

            <FormSection title={t('form.studentSection')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('form.firstName')} required error={errors.firstName?.message}>
                  {(field) => (
                    <Input
                      {...field}
                      {...form.register('firstName')}
                      autoComplete="off"
                      autoFocus
                    />
                  )}
                </Field>
                <Field label={t('form.lastName')} required error={errors.lastName?.message}>
                  {(field) => (
                    <Input {...field} {...form.register('lastName')} autoComplete="off" />
                  )}
                </Field>
                <Field
                  label={t('form.gender')}
                  optionalLabel={tc('optional')}
                  error={errors.gender?.message}
                >
                  {(field) => (
                    <Select {...field} {...form.register('gender')}>
                      <option value="">{tc('notSet')}</option>
                      {GENDERS.filter((gender) => gender !== 'unspecified').map((gender) => (
                        <option key={gender} value={gender}>
                          {t(`gender.${gender}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  label={t('form.birthDate')}
                  optionalLabel={tc('optional')}
                  error={errors.birthDate?.message}
                >
                  {(field) => (
                    <Input
                      {...field}
                      {...form.register('birthDate')}
                      type="date"
                      max={format.today()}
                    />
                  )}
                </Field>
                <Field
                  label={t('form.nationalId')}
                  optionalLabel={tc('optional')}
                  hint={t('form.nationalIdHint')}
                  error={errors.nationalId?.message}
                  className="sm:col-span-2"
                >
                  {(field) => (
                    <Input
                      {...field}
                      {...form.register('nationalId')}
                      inputMode="numeric"
                      maxLength={11}
                      autoComplete="off"
                      className="font-mono sm:max-w-[220px]"
                    />
                  )}
                </Field>
                <Field
                  label={t('form.phone')}
                  optionalLabel={tc('optional')}
                  error={errors.phone?.message}
                >
                  {(field) => (
                    <Input {...field} {...form.register('phone')} type="tel" autoComplete="off" />
                  )}
                </Field>
                <Field
                  label={t('form.email')}
                  optionalLabel={tc('optional')}
                  error={errors.email?.message}
                >
                  {(field) => (
                    <Input {...field} {...form.register('email')} type="email" autoComplete="off" />
                  )}
                </Field>
                <Field
                  label={t('form.address')}
                  optionalLabel={tc('optional')}
                  error={errors.address?.message}
                  className="sm:col-span-2"
                >
                  {(field) => <Textarea {...field} {...form.register('address')} rows={2} />}
                </Field>
              </div>
            </FormSection>

            <FormSection title={t('form.placementSection')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('form.branch')} required error={errors.branchId?.message}>
                  {(field) => (
                    <Select
                      {...field}
                      {...form.register('branchId', {
                        onChange: () => form.setValue('classId', ''),
                      })}
                    >
                      <option value="" disabled>
                        {t('form.selectBranch')}
                      </option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {can('academics.read') ? (
                  <Field
                    label={t('form.class')}
                    optionalLabel={tc('optional')}
                    error={errors.classId?.message}
                  >
                    {(field) => (
                      <Select
                        {...field}
                        {...form.register('classId')}
                        disabled={branchId === '' || classes.isPending}
                      >
                        <option value="">{t('form.noClass')}</option>
                        {(classes.data ?? []).map((klass) => (
                          <option key={klass.id} value={klass.id}>
                            {klass.capacity
                              ? `${klass.name} (${klass.studentCount}/${klass.capacity})`
                              : klass.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                ) : null}
                <Field label={t('profile.enrolledOn')} error={errors.enrolledOn?.message}>
                  {(field) => <Input {...field} {...form.register('enrolledOn')} type="date" />}
                </Field>
              </div>
            </FormSection>

            {canWriteGuardians ? (
              <FormSection title={t('form.guardianSection')} description={t('form.guardianHint')}>
                <div className="flex flex-col gap-4">
                  {guardians.fields.map((guardianField, index) => {
                    const guardianErrors = errors.guardians?.[index];
                    return (
                      <div key={guardianField.id} className="rounded-md border border-line p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs font-medium text-fg-muted">
                            {t('form.guardianSection')} {index + 1}
                          </p>
                          {index > 0 ? (
                            <Button
                              variant="danger-ghost"
                              size="xs"
                              leadingIcon={<Trash2 />}
                              onClick={() => guardians.remove(index)}
                            >
                              {t('form.removeGuardian')}
                            </Button>
                          ) : null}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field
                            label={t('form.firstName')}
                            required
                            error={guardianErrors?.firstName?.message}
                          >
                            {(field) => (
                              <Input
                                {...field}
                                {...form.register(`guardians.${index}.firstName`)}
                                autoComplete="off"
                              />
                            )}
                          </Field>
                          <Field
                            label={t('form.lastName')}
                            required
                            error={guardianErrors?.lastName?.message}
                          >
                            {(field) => (
                              <Input
                                {...field}
                                {...form.register(`guardians.${index}.lastName`)}
                                autoComplete="off"
                              />
                            )}
                          </Field>
                          <Field
                            label={t('form.relationship')}
                            required
                            error={guardianErrors?.relationship?.message}
                          >
                            {(field) => (
                              <Select
                                {...field}
                                {...form.register(`guardians.${index}.relationship`)}
                              >
                                <option value="" disabled>
                                  {t('form.selectRelationship')}
                                </option>
                                {GUARDIAN_RELATIONSHIPS.map((relationship) => (
                                  <option key={relationship} value={relationship}>
                                    {t(`relationship.${relationship}`)}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                          <Field
                            label={t('form.phone')}
                            optionalLabel={tc('optional')}
                            error={guardianErrors?.phone?.message}
                          >
                            {(field) => (
                              <Input
                                {...field}
                                {...form.register(`guardians.${index}.phone`)}
                                type="tel"
                                autoComplete="off"
                              />
                            )}
                          </Field>
                          <Field
                            label={t('form.email')}
                            optionalLabel={tc('optional')}
                            error={guardianErrors?.email?.message}
                            className="sm:col-span-2"
                          >
                            {(field) => (
                              <Input
                                {...field}
                                {...form.register(`guardians.${index}.email`)}
                                type="email"
                                autoComplete="off"
                              />
                            )}
                          </Field>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                          <label className="flex items-center gap-2 text-sm text-fg">
                            <Checkbox
                              checked={watchedGuardians[index]?.isPrimaryContact ?? false}
                              onCheckedChange={(checked) => setPrimary(index, checked === true)}
                            />
                            {t('form.primaryContact')}
                          </label>
                          <label className="flex items-center gap-2 text-sm text-fg">
                            <Checkbox
                              checked={watchedGuardians[index]?.isFinanciallyResponsible ?? false}
                              onCheckedChange={(checked) =>
                                form.setValue(
                                  `guardians.${index}.isFinanciallyResponsible`,
                                  checked === true,
                                  {
                                    shouldDirty: true,
                                  },
                                )
                              }
                            />
                            {t('form.financiallyResponsible')}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                  {guardians.fields.length < MAX_GUARDIANS ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      leadingIcon={<Plus />}
                      className="self-start"
                      onClick={() => guardians.append(emptyGuardian(guardians.fields.length === 0))}
                    >
                      {t('form.addGuardian')}
                    </Button>
                  ) : null}
                </div>
              </FormSection>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t('form.submit')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
