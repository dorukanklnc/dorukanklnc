'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Session } from '@repo/contracts';
import { Button, Field, Input } from '@repo/ui';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, AuthCard, PasswordInput } from '@/components/form-bits';
import { accessFromSession } from '@/lib/access';
import { api } from '@/lib/api/client';
import { homePath } from '@/lib/navigation';
import { useErrorMessage } from '@/lib/use-error-message';
import { hardNavigate } from '@/lib/hard-navigate';

export function LoginForm({ next, showDemoHint }: { next: string | null; showDemoHint: boolean }) {
  const t = useTranslations('auth.login');
  const tv = useTranslations('validation');
  const errorMessage = useErrorMessage();

  const schema = z.object({
    email: z
      .string()
      .trim()
      .min(1, tv('required'))
      .pipe(z.email(tv('invalidEmail'))),
    password: z
      .string()
      .min(1, tv('required'))
      .max(128, tv('tooLong', { max: 128 })),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: (values: Values) => api.post<Session>('/auth/login', values),
    onSuccess: (session) => {
      const access = accessFromSession(session);
      const target = next && access.hasOrganization ? next : homePath(access);
      // A full navigation guarantees a clean client state for the new session.
      hardNavigate(target);
    },
    onError: () => form.resetField('password', { keepError: false }),
  });

  const { errors } = form.formState;
  const busy = login.isPending || login.isSuccess;

  return (
    <AuthCard
      title={t('title')}
      description={t('subtitle')}
      footer={showDemoHint ? t('demoHint') : undefined}
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
      >
        {login.isError ? <Alert>{errorMessage(login.error)}</Alert> : null}
        <Field label={t('email')} error={errors.email?.message}>
          {(field) => (
            <Input
              {...field}
              {...form.register('email')}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              disabled={busy}
            />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <Field label={t('password')} error={errors.password?.message}>
            {(field) => (
              <PasswordInput
                {...field}
                {...form.register('password')}
                autoComplete="current-password"
                disabled={busy}
              />
            )}
          </Field>
          <Link href="/forgot-password" className="self-end text-xs text-primary hover:underline">
            {t('forgot')}
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1 w-full">
          {t('submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
