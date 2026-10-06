'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, Input } from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AuthCard } from '@/components/form-bits';
import { api } from '@/lib/api/client';
import { useErrorMessage } from '@/lib/use-error-message';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const tl = useTranslations('auth.login');
  const tv = useTranslations('validation');
  const errorMessage = useErrorMessage();

  const schema = z.object({
    email: z
      .string()
      .trim()
      .min(1, tv('required'))
      .pipe(z.email(tv('invalidEmail'))),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  // The API answers the same way whether or not the address exists (no account enumeration).
  const request = useMutation({
    mutationFn: (values: Values) => api.post('/auth/password/forgot', values),
  });

  if (request.isSuccess) {
    return (
      <AuthCard
        title={t('sentTitle')}
        footer={
          <Link href="/login" className="text-primary hover:underline">
            {t('backToLogin')}
          </Link>
        }
      >
        <div className="flex gap-3">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <p className="text-sm text-fg-muted">{t('sent')}</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('title')}
      description={t('description')}
      footer={
        <Link href="/login" className="text-primary hover:underline">
          {t('backToLogin')}
        </Link>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => request.mutate(values))}
      >
        {request.isError ? <Alert>{errorMessage(request.error)}</Alert> : null}
        <Field label={tl('email')} error={form.formState.errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              {...form.register('email')}
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={request.isPending}
          className="w-full"
        >
          {t('submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
