'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Organization, UpdateOrganizationRequest } from '@repo/contracts';
import {
  Badge,
  Button,
  Field,
  Input,
  Panel,
  PanelBody,
  PanelHeader,
  Select,
  Skeleton,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DescriptionList } from '@/components/description-list';
import { Alert } from '@/components/form-bits';
import { PageHeader } from '@/components/page-header';
import { QueryError } from '@/components/states';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useErrorMessage } from '@/lib/use-error-message';

const TIME_ZONES = [
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Baku',
  'UTC',
];

export function OrganizationView() {
  const t = useTranslations('admin.organization');
  const organization = useQuery({
    queryKey: queryKeys.organization,
    queryFn: ({ signal }) => api.get<Organization>('/organization', undefined, signal),
  });

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {organization.isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      ) : organization.isError ? (
        <Panel>
          <QueryError error={organization.error} onRetry={() => void organization.refetch()} />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <ProfileForm organization={organization.data} />
          <ModulesPanel organization={organization.data} />
        </div>
      )}
    </>
  );
}

function ProfileForm({ organization }: { organization: Organization }) {
  const t = useTranslations('admin.organization');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const tp = useTranslations('platform.organizations.plans');
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(2, tv('tooShort', { min: 2 }))
          .max(120, tv('tooLong', { max: 120 })),
        legalName: z
          .string()
          .trim()
          .max(200, tv('tooLong', { max: 200 })),
        timezone: z.string().min(1, tv('required')),
      }),
    [tv],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: organization.name,
      legalName: organization.legalName ?? '',
      timezone: organization.timezone,
    },
  });

  const save = useMutation({
    mutationFn: (values: Values) => {
      const body: UpdateOrganizationRequest = {
        name: values.name,
        legalName: values.legalName,
        timezone: values.timezone,
      };
      return api.patch<Organization>('/organization', body);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.organization, updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      toast.success(t('saved'));
    },
  });

  const zones = TIME_ZONES.includes(organization.timezone)
    ? TIME_ZONES
    : [organization.timezone, ...TIME_ZONES];
  const { errors, isDirty } = form.formState;

  return (
    <Panel className="lg:col-span-2">
      <PanelHeader title={t('profile')} />
      <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        <PanelBody className="flex flex-col gap-4">
          {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('name')} required error={errors.name?.message}>
              {(field) => <Input {...field} {...form.register('name')} />}
            </Field>
            <Field
              label={t('legalName')}
              optionalLabel={tc('optional')}
              error={errors.legalName?.message}
            >
              {(field) => <Input {...field} {...form.register('legalName')} />}
            </Field>
            <Field label={t('timezone')} required error={errors.timezone?.message}>
              {(field) => (
                <Select {...field} {...form.register('timezone')}>
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <DescriptionList
            columns={3}
            className="border-t border-line-subtle pt-4"
            items={[
              { label: t('slug'), value: <span className="font-mono">{organization.slug}</span> },
              { label: t('currency'), value: organization.defaultCurrency },
              { label: t('plan'), value: tp(organization.planKey as Parameters<typeof tp>[0]) },
            ]}
          />
        </PanelBody>
        <div className="flex justify-end gap-2 border-t border-line-subtle bg-surface-muted px-4 py-3">
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!isDirty}>
            {tc('saveChanges')}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function ModulesPanel({ organization }: { organization: Organization }) {
  const t = useTranslations('admin.organization');
  const tm = useTranslations('modules');
  return (
    <Panel>
      <PanelHeader title={t('modules')} description={t('modulesHint')} />
      <ul className="divide-y divide-line-subtle">
        {organization.modules.map((module) => (
          <li key={module.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="text-fg">{tm(module.key)}</span>
            <Badge tone={module.enabled ? 'success' : 'neutral'} dot={module.enabled}>
              {module.enabled ? t('enabled') : t('disabled')}
            </Badge>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
