'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { AcceptInvitationResponse, InvitationPreview } from '@repo/contracts';
import { Button, Field, Input } from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AuthCard, PasswordInput } from '@/components/form-bits';
import { api } from '@/lib/api/client';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { hardNavigate } from '@/lib/hard-navigate';

export function AcceptInvitationForm({
  token,
  preview,
}: {
  token: string;
  preview: InvitationPreview;
}) {
  const t = useTranslations('auth.invitation');
  const tr = useTranslations('auth.reset');
  const tv = useTranslations('validation');
  const format = useFormat();
  const errorMessage = useErrorMessage();

  const schema = z
    .object({
      fullName: z
        .string()
        .trim()
        .min(2, tv('tooShort', { min: 2 }))
        .max(120, tv('tooLong', { max: 120 })),
      password: z
        .string()
        .min(10, tv('passwordTooShort', { min: 10 }))
        .max(128, tv('tooLong', { max: 128 })),
      confirm: z.string(),
    })
    .refine((values) => values.password === values.confirm, {
      message: tr('mismatch'),
      path: ['confirm'],
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: preview.fullName ?? '', password: '', confirm: '' },
  });

  const accept = useMutation({
    mutationFn: (body: { fullName?: string; password?: string }) =>
      api.post<AcceptInvitationResponse>(
        `/auth/invitations/${encodeURIComponent(token)}/accept`,
        body,
      ),
    onSuccess: (result) => {
      if (result.signedIn) hardNavigate('/dashboard');
    },
  });

  const title = t('title', { organization: preview.organizationName });
  const description = (
    <>
      {t('description', { email: preview.email })}
      <span className="mt-1 block text-xs text-fg-subtle">
        {t('expires', { date: format.dateTime(preview.expiresAt) })}
      </span>
    </>
  );

  if (accept.isSuccess && !accept.data.signedIn) {
    return (
      <AuthCard title={title}>
        <div className="flex flex-col gap-4">
          <Alert tone="success">{t('accepted')}</Alert>
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href="/login">{t('acceptExisting')}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (!preview.requiresAccountSetup) {
    return (
      <AuthCard title={title} description={description}>
        <div className="flex flex-col gap-4">
          {accept.isError ? <Alert>{errorMessage(accept.error)}</Alert> : null}
          <Alert tone="info">{t('existingAccount')}</Alert>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={accept.isPending}
            onClick={() => accept.mutate({})}
          >
            {t('accept')}
          </Button>
        </div>
      </AuthCard>
    );
  }

  const { errors } = form.formState;
  return (
    <AuthCard title={title} description={description}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          accept.mutate({ fullName: values.fullName, password: values.password }),
        )}
      >
        {accept.isError ? <Alert>{errorMessage(accept.error)}</Alert> : null}
        <Field label={t('fullName')} error={errors.fullName?.message}>
          {(field) => (
            <Input {...field} {...form.register('fullName')} autoComplete="name" autoFocus />
          )}
        </Field>
        <Field label={t('password')} hint={tr('hint')} error={errors.password?.message}>
          {(field) => (
            <PasswordInput {...field} {...form.register('password')} autoComplete="new-password" />
          )}
        </Field>
        <Field label={tr('confirm')} error={errors.confirm?.message}>
          {(field) => (
            <PasswordInput {...field} {...form.register('confirm')} autoComplete="new-password" />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={accept.isPending || accept.isSuccess}
          className="w-full"
        >
          {t('accept')}
        </Button>
      </form>
    </AuthCard>
  );
}
