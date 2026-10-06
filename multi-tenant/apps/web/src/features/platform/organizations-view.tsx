'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { PlatformOrganization, createOrganizationRequestSchema } from '@repo/contracts';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  TBody,
  THead,
  Table,
  TableContainer,
  Td,
  Th,
  Tr,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/form-bits';
import { PageHeader } from '@/components/page-header';
import { PanelSkeleton, QueryError } from '@/components/states';
import { api } from '@/lib/api/client';
import { isApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query-keys';
import { useErrorMessage } from '@/lib/use-error-message';
import { useFormat } from '@/lib/use-format';
import { useListParams } from '@/lib/use-list-params';

const PARAM_KEYS = ['new'] as const;
const PLANS = ['starter', 'standard', 'enterprise'] as const;

/** Platform console: every tenant, without access to tenant data (support sessions are separate). */
export function OrganizationsView() {
  const t = useTranslations('platform.organizations');
  const format = useFormat();
  const { values, update } = useListParams(PARAM_KEYS);
  const organizations = useQuery({
    queryKey: queryKeys.platform.organizations,
    queryFn: ({ signal }) =>
      api.get<PlatformOrganization[]>('/platform/organizations', undefined, signal),
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button variant="primary" leadingIcon={<Plus />} onClick={() => update({ new: '1' })}>
            {t('create')}
          </Button>
        }
      />
      {organizations.isPending ? (
        <PanelSkeleton rows={4} />
      ) : organizations.isError ? (
        <Panel>
          <QueryError error={organizations.error} onRetry={() => void organizations.refetch()} />
        </Panel>
      ) : organizations.data.length === 0 ? (
        <Panel>
          <EmptyState icon={<Building2 />} title={t('title')} />
        </Panel>
      ) : (
        <Panel>
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th>{t('columns.name')}</Th>
                  <Th>{t('columns.plan')}</Th>
                  <Th className="text-right">{t('columns.branches')}</Th>
                  <Th className="text-right">{t('columns.members')}</Th>
                  <Th className="text-right">{t('columns.students')}</Th>
                  <Th>{t('columns.status')}</Th>
                  <Th>{t('columns.createdAt')}</Th>
                </Tr>
              </THead>
              <TBody>
                {organizations.data.map((organization) => (
                  <Tr key={organization.id}>
                    <Td>
                      <span className="flex flex-col leading-tight">
                        <span className="font-medium">{organization.name}</span>
                        <span className="font-mono text-2xs text-fg-subtle">
                          {organization.slug}
                        </span>
                      </span>
                    </Td>
                    <Td>{t(`plans.${organization.planKey as (typeof PLANS)[number]}`)}</Td>
                    <Td className="tabular text-right">
                      {format.number(organization.branchCount)}
                    </Td>
                    <Td className="tabular text-right">
                      {format.number(organization.memberCount)}
                    </Td>
                    <Td className="tabular text-right">
                      {format.number(organization.studentCount)}
                    </Td>
                    <Td>
                      <Badge tone={organization.status === 'active' ? 'success' : 'neutral'} dot>
                        {t(`status.${organization.status}`)}
                      </Badge>
                    </Td>
                    <Td className="tabular text-fg-muted">
                      {format.dateTime(organization.createdAt)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </Panel>
      )}
      <CreateOrganizationSheet
        open={values.new === '1'}
        onOpenChange={(open) => !open && update({ new: undefined })}
      />
    </>
  );
}

function CreateOrganizationSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('platform.organizations');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
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
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, tv('invalid')),
        legalName: z
          .string()
          .trim()
          .max(200, tv('tooLong', { max: 200 })),
        planKey: z.enum(PLANS),
        branchCode: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, tv('invalid')),
        branchName: z
          .string()
          .trim()
          .min(2, tv('tooShort', { min: 2 }))
          .max(120, tv('tooLong', { max: 120 })),
        adminName: z
          .string()
          .trim()
          .min(2, tv('tooShort', { min: 2 }))
          .max(120, tv('tooLong', { max: 120 })),
        adminEmail: z
          .string()
          .trim()
          .pipe(z.email(tv('invalidEmail'))),
      }),
    [tv],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      slug: '',
      legalName: '',
      planKey: 'standard',
      branchCode: '',
      branchName: '',
      adminName: '',
      adminEmail: '',
    },
  });

  const create = useMutation({
    mutationFn: (values: Values) => {
      const body: z.input<typeof createOrganizationRequestSchema> = {
        name: values.name,
        slug: values.slug,
        legalName: values.legalName || undefined,
        planKey: values.planKey,
        firstBranch: { code: values.branchCode, name: values.branchName },
        administrator: { fullName: values.adminName, email: values.adminEmail },
      };
      return api.post<{ organizationId: string }>('/platform/organizations', body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.platform.organizations });
      toast.success(t('created'));
      form.reset();
      onOpenChange(false);
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'ORGANIZATION_SLUG_TAKEN') {
        form.setError('slug', { type: 'server', message: errorMessage(error) });
      }
    },
  });

  const { errors } = form.formState;
  const slugTaken = isApiError(create.error) && create.error.code === 'ORGANIZATION_SLUG_TAKEN';

  return (
    <Sheet open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <SheetContent size="lg" closeLabel={tc('close')}>
        <SheetHeader title={t('createTitle')} description={t('createDescription')} />
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetBody className="flex flex-col gap-5">
            {create.isError && !slugTaken ? <Alert>{errorMessage(create.error)}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('name')} required error={errors.name?.message}>
                {(field) => <Input {...field} {...form.register('name')} autoFocus />}
              </Field>
              <Field label={t('slug')} required hint={t('slugHint')} error={errors.slug?.message}>
                {(field) => <Input {...field} {...form.register('slug')} className="font-mono" />}
              </Field>
              <Field
                label={t('legalName')}
                optionalLabel={tc('optional')}
                error={errors.legalName?.message}
              >
                {(field) => <Input {...field} {...form.register('legalName')} />}
              </Field>
              <Field label={t('plan')} required>
                {(field) => (
                  <Select {...field} {...form.register('planKey')}>
                    {PLANS.map((plan) => (
                      <option key={plan} value={plan}>
                        {t(`plans.${plan}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-fg">{t('firstBranch')}</h3>
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <Field label={t('branchCode')} required error={errors.branchCode?.message}>
                  {(field) => (
                    <Input
                      {...field}
                      {...form.register('branchCode')}
                      className="font-mono uppercase"
                      maxLength={20}
                    />
                  )}
                </Field>
                <Field label={t('branchName')} required error={errors.branchName?.message}>
                  {(field) => <Input {...field} {...form.register('branchName')} />}
                </Field>
              </div>
            </section>
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-fg">{t('administrator')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('adminName')} required error={errors.adminName?.message}>
                  {(field) => <Input {...field} {...form.register('adminName')} />}
                </Field>
                <Field label={t('adminEmail')} required error={errors.adminEmail?.message}>
                  {(field) => <Input {...field} {...form.register('adminEmail')} type="email" />}
                </Field>
              </div>
            </section>
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
              {t('submit')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
