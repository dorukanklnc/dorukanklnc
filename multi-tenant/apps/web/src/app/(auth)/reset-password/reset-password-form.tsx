'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field } from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AuthCard, PasswordInput } from '@/components/form-bits';
import { api } from '@/lib/api/client';
import { useErrorMessage } from '@/lib/use-error-message';

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations('auth.reset');
  const tf = useTranslations('auth.forgot');
  const tv = useTranslations('validation');
  const errorMessage = useErrorMessage();

  useEffect(() => {
    // Keep the single-use token out of the address bar and browser history.
    if (token) window.history.replaceState(null, '', '/reset-password');
  }, [token]);

  const schema = z
    .object({
      password: z
        .string()
        .min(10, tv('passwordTooShort', { min: 10 }))
        .max(128, tv('tooLong', { max: 128 })),
      confirm: z.string(),
    })
    .refine((values) => values.password === values.confirm, {
      message: t('mismatch'),
      path: ['confirm'],
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  const reset = useMutation({
    mutationFn: (values: Values) =>
      api.post('/auth/password/reset', { token: token ?? '', password: values.password }),
  });

  const loginLink = (
    <Link href="/login" className="text-primary hover:underline">
      {tf('backToLogin')}
    </Link>
  );

  if (!token) {
    return (
      <AuthCard title={t('title')} footer={loginLink}>
        <Alert>{t('missingToken')}</Alert>
      </AuthCard>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthCard title={t('title')} footer={loginLink}>
        <Alert tone="success">{t('success')}</Alert>
      </AuthCard>
    );
  }

  const { errors } = form.formState;
  return (
    <AuthCard title={t('title')} footer={loginLink}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => reset.mutate(values))}
      >
        {reset.isError ? <Alert>{errorMessage(reset.error)}</Alert> : null}
        <Field label={t('password')} hint={t('hint')} error={errors.password?.message}>
          {(field) => (
            <PasswordInput
              {...field}
              {...form.register('password')}
              autoComplete="new-password"
              autoFocus
            />
          )}
        </Field>
        <Field label={t('confirm')} error={errors.confirm?.message}>
          {(field) => (
            <PasswordInput {...field} {...form.register('confirm')} autoComplete="new-password" />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={reset.isPending}
          className="w-full"
        >
          {t('submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
