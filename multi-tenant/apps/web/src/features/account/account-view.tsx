'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ActiveSession } from '@repo/contracts';
import { Badge, Button, Field, Panel, PanelBody, PanelHeader, Skeleton } from '@repo/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DescriptionList } from '@/components/description-list';
import { Alert, PasswordInput } from '@/components/form-bits';
import { PageHeader } from '@/components/page-header';
import { useSession } from '@/components/session/session-context';
import { QueryError } from '@/components/states';
import { api } from '@/lib/api/client';
import { hardNavigate } from '@/lib/hard-navigate';
import { queryKeys } from '@/lib/query-keys';
import { clearRecentItems } from '@/lib/recent-items';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';

export function AccountView() {
  const t = useTranslations('account');
  const session = useSession();

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ChangePassword />
          <Sessions />
        </div>
        <Panel>
          <PanelHeader title={t('profile')} />
          <PanelBody>
            <DescriptionList
              columns={1}
              items={[
                { label: t('name'), value: session.user.fullName },
                { label: t('email'), value: session.user.email },
                { label: t('organization'), value: session.activeOrganization?.name },
                {
                  label: t('roles'),
                  value: session.activeMembership?.roles.map((role) => role.name).join(', '),
                },
              ]}
            />
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}

function ChangePassword() {
  const t = useTranslations('account');
  const tr = useTranslations('auth.reset');
  const tv = useTranslations('validation');
  const errorMessage = useErrorMessage();

  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, tv('required')),
          newPassword: z
            .string()
            .min(10, tv('passwordTooShort', { min: 10 }))
            .max(128, tv('tooLong', { max: 128 })),
          confirm: z.string(),
        })
        .refine((values) => values.newPassword === values.confirm, {
          message: tr('mismatch'),
          path: ['confirm'],
        }),
    [tr, tv],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const change = useMutation({
    mutationFn: (values: Values) =>
      api.post('/auth/password/change', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      toast.success(t('passwordChanged'));
      form.reset();
    },
  });

  const { errors } = form.formState;
  return (
    <Panel>
      <PanelHeader title={t('password')} description={t('passwordHint')} />
      <form noValidate onSubmit={form.handleSubmit((values) => change.mutate(values))}>
        <PanelBody className="flex flex-col gap-4">
          {change.isError ? <Alert>{errorMessage(change.error)}</Alert> : null}
          <Field
            label={t('currentPassword')}
            required
            error={errors.currentPassword?.message}
            className="sm:max-w-sm"
          >
            {(field) => (
              <PasswordInput
                {...field}
                {...form.register('currentPassword')}
                autoComplete="current-password"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={tr('password')}
              required
              hint={tr('hint')}
              error={errors.newPassword?.message}
            >
              {(field) => (
                <PasswordInput
                  {...field}
                  {...form.register('newPassword')}
                  autoComplete="new-password"
                />
              )}
            </Field>
            <Field label={tr('confirm')} required error={errors.confirm?.message}>
              {(field) => (
                <PasswordInput
                  {...field}
                  {...form.register('confirm')}
                  autoComplete="new-password"
                />
              )}
            </Field>
          </div>
        </PanelBody>
        <div className="flex justify-end border-t border-line-subtle bg-surface-muted px-4 py-3">
          <Button type="submit" variant="primary" loading={change.isPending}>
            {tr('submit')}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/** Rough, privacy-friendly device label from a user agent ("Chrome · Windows"). */
function describeDevice(userAgent: string | null): { label: string | null; mobile: boolean } {
  if (!userAgent) return { label: null, mobile: false };
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  return {
    label: [browser, os].filter(Boolean).join(' · ') || null,
    mobile: /Mobile|Android|iPhone/.test(userAgent),
  };
}

function Sessions() {
  const t = useTranslations('account');
  const ts = useTranslations('shell');
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const [confirm, setConfirm] = useState(false);
  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: ({ signal }) => api.get<ActiveSession[]>('/auth/sessions', undefined, signal),
  });
  const logoutAll = useMutation({
    mutationFn: () => api.post('/auth/logout-all'),
    onSuccess: () => {
      clearRecentItems();
      hardNavigate('/login');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Panel>
      <PanelHeader
        title={t('sessions')}
        description={t('sessionsHint')}
        actions={
          <Button
            variant="danger-ghost"
            size="sm"
            leadingIcon={<LogOut />}
            onClick={() => setConfirm(true)}
          >
            {ts('logoutAll')}
          </Button>
        }
      />
      {sessions.isPending ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : sessions.isError ? (
        <QueryError error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : (
        <ul className="divide-y divide-line-subtle">
          {sessions.data.map((item) => {
            const device = describeDevice(item.userAgent);
            const Icon = device.mobile ? Smartphone : Laptop;
            return (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <Icon className="size-4 text-fg-subtle" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm text-fg">
                    {device.label ?? t('unknownDevice')}
                    {item.current ? <Badge tone="success">{t('currentSession')}</Badge> : null}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {[
                      item.ip,
                      t('lastSeen', { time: format.relative(item.lastSeenAt) }),
                      t('signedInAt', { date: format.dateTime(item.createdAt) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={ts('logoutAll')}
        description={ts('logoutAllConfirm')}
        confirmLabel={ts('logoutAll')}
        tone="danger"
        loading={logoutAll.isPending || logoutAll.isSuccess}
        onConfirm={() => logoutAll.mutate()}
      />
    </Panel>
  );
}
