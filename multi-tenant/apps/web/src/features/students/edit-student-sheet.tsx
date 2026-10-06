'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type StudentDetail,
  type UpdateStudentRequest,
  isValidTurkishNationalId,
} from '@repo/contracts';
import {
  Button,
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
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { type Path, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/form-bits';
import { api } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import { parseIsoDate } from '@/lib/dates';
import { queryKeys } from '@/lib/query-keys';
import { useApplyFieldErrors, useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { GENDERS, STUDENT_STATUSES } from './constants';

const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

export function EditStudentSheet({
  student,
  open,
  onOpenChange,
}: {
  student: StudentDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('students');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const queryClient = useQueryClient();
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const applyFieldErrors = useApplyFieldErrors();

  const schema = useMemo(() => {
    const name = z
      .string()
      .trim()
      .min(1, tv('required'))
      .max(80, tv('tooLong', { max: 80 }));
    return z.object({
      firstName: name,
      lastName: name,
      gender: z.enum([...GENDERS, '']),
      birthDate: z.string().refine((v) => v === '' || parseIsoDate(v) !== null, tv('invalidDate')),
      nationalId: z
        .string()
        .trim()
        .refine((v) => v === '' || isValidTurkishNationalId(v), tv('invalidNationalId')),
      phone: z
        .string()
        .trim()
        .refine((v) => v === '' || PHONE_PATTERN.test(v), tv('invalidPhone')),
      email: z
        .string()
        .trim()
        .refine((v) => v === '' || z.email().safeParse(v).success, tv('invalidEmail')),
      address: z
        .string()
        .trim()
        .max(300, tv('tooLong', { max: 300 })),
      status: z.enum(STUDENT_STATUSES),
    });
  }, [tv]);
  type Values = z.infer<typeof schema>;

  const defaults = useMemo<Values>(
    () => ({
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender ?? '',
      birthDate: student.birthDate ?? '',
      nationalId: '',
      phone: student.phone ?? '',
      email: student.email ?? '',
      address: student.address ?? '',
      status: student.status,
    }),
    [student],
  );
  const form = useForm<Values>({ resolver: zodResolver(schema), values: defaults });

  const update = useMutation({
    mutationFn: (values: Values) => {
      // Send only what changed: smaller requests and a precise audit trail.
      const dirty = form.formState.dirtyFields;
      const body: UpdateStudentRequest = {};
      if (dirty.firstName) body.firstName = values.firstName.trim();
      if (dirty.lastName) body.lastName = values.lastName.trim();
      if (dirty.gender) body.gender = values.gender === '' ? null : values.gender;
      if (dirty.birthDate) body.birthDate = values.birthDate === '' ? null : values.birthDate;
      if (dirty.nationalId && values.nationalId !== '') body.nationalId = values.nationalId.trim();
      if (dirty.phone) body.phone = values.phone.trim() === '' ? null : values.phone.trim();
      if (dirty.email) body.email = values.email.trim() === '' ? null : values.email.trim();
      if (dirty.address) body.address = values.address.trim() === '' ? null : values.address.trim();
      if (dirty.status) body.status = values.status;
      return api.patch<StudentDetail>(`/students/${student.id}`, body);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.students.detail(student.id), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
      toast.success(t('form.updated'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'NATIONAL_ID_TAKEN') {
        form.setError('nationalId', { type: 'server', message: errorMessage(error) });
        return;
      }
      applyFieldErrors(error, form.setError, (path) =>
        path in defaults ? (path as Path<Values>) : null,
      );
    },
  });

  const { errors, isDirty } = form.formState;
  const nationalIdTaken = isApiError(update.error) && update.error.code === 'NATIONAL_ID_TAKEN';

  return (
    <Sheet open={open} onOpenChange={(next) => !update.isPending && onOpenChange(next)}>
      <SheetContent size="lg" closeLabel={tc('close')}>
        <SheetHeader title={t('form.editTitle')} description={student.fullName} />
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={form.handleSubmit((values) => update.mutate(values))}
        >
          <SheetBody>
            {update.isError && !nationalIdTaken ? (
              <Alert className="mb-4">{errorMessage(update.error)}</Alert>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('form.firstName')} required error={errors.firstName?.message}>
                {(field) => <Input {...field} {...form.register('firstName')} />}
              </Field>
              <Field label={t('form.lastName')} required error={errors.lastName?.message}>
                {(field) => <Input {...field} {...form.register('lastName')} />}
              </Field>
              <Field label={t('form.gender')} error={errors.gender?.message}>
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
              <Field label={t('form.birthDate')} error={errors.birthDate?.message}>
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
                hint={
                  student.nationalIdMasked
                    ? t('form.nationalIdReplaceHint', { masked: student.nationalIdMasked })
                    : t('form.nationalIdHint')
                }
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
              <Field label={t('form.phone')} error={errors.phone?.message}>
                {(field) => <Input {...field} {...form.register('phone')} type="tel" />}
              </Field>
              <Field label={t('form.email')} error={errors.email?.message}>
                {(field) => <Input {...field} {...form.register('email')} type="email" />}
              </Field>
              <Field
                label={t('form.address')}
                error={errors.address?.message}
                className="sm:col-span-2"
              >
                {(field) => <Textarea {...field} {...form.register('address')} rows={2} />}
              </Field>
              <Field label={tc('status')} error={errors.status?.message}>
                {(field) => (
                  <Select {...field} {...form.register('status')}>
                    {STUDENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`status.${status}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending} disabled={!isDirty}>
              {tc('saveChanges')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
