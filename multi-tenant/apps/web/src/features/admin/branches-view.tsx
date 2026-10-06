'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Branch, CreateBranchRequest, UpdateBranchRequest } from '@repo/contracts';
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
  Textarea,
  Th,
  Tr,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
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
import { useBranches } from './queries';

export function BranchesView() {
  const t = useTranslations('admin.branches');
  const format = useFormat();
  const branches = useBranches();
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button variant="primary" leadingIcon={<Plus />} onClick={() => setEditing('new')}>
            {t('add')}
          </Button>
        }
      />
      {branches.isPending ? (
        <PanelSkeleton rows={4} />
      ) : branches.isError ? (
        <Panel>
          <QueryError error={branches.error} onRetry={() => void branches.refetch()} />
        </Panel>
      ) : branches.data.length === 0 ? (
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
                  <Th>{t('columns.code')}</Th>
                  <Th>{t('columns.location')}</Th>
                  <Th className="text-right">{t('columns.students')}</Th>
                  <Th className="text-right">{t('columns.members')}</Th>
                  <Th>{t('columns.status')}</Th>
                  <Th className="w-12" />
                </Tr>
              </THead>
              <TBody>
                {branches.data.map((branch) => (
                  <Tr key={branch.id}>
                    <Td>
                      <span className="flex items-center gap-2 font-medium">
                        {branch.name}
                        {branch.isHeadquarters ? (
                          <Badge tone="info">{t('headquarters')}</Badge>
                        ) : null}
                      </span>
                    </Td>
                    <Td className="font-mono text-xs">{branch.code}</Td>
                    <Td className="text-fg-muted">
                      {[branch.district, branch.city].filter(Boolean).join(', ') || '—'}
                    </Td>
                    <Td className="tabular text-right">{format.number(branch.studentCount)}</Td>
                    <Td className="tabular text-right">{format.number(branch.memberCount)}</Td>
                    <Td>
                      <Badge tone={branch.status === 'active' ? 'success' : 'neutral'} dot>
                        {t(`status.${branch.status}`)}
                      </Badge>
                    </Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(branch)}
                        aria-label={t('editTitle')}
                      >
                        <Pencil />
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </Panel>
      )}
      {editing ? (
        <BranchSheet
          key={editing === 'new' ? 'new' : editing.id}
          branch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

function BranchSheet({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const t = useTranslations('admin.branches');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();

  const schema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, tv('invalid')),
        name: z
          .string()
          .trim()
          .min(2, tv('tooShort', { min: 2 }))
          .max(120, tv('tooLong', { max: 120 })),
        city: z
          .string()
          .trim()
          .max(80, tv('tooLong', { max: 80 })),
        district: z
          .string()
          .trim()
          .max(80, tv('tooLong', { max: 80 })),
        address: z
          .string()
          .trim()
          .max(300, tv('tooLong', { max: 300 })),
        phone: z
          .string()
          .trim()
          .refine((v) => v === '' || PHONE_PATTERN.test(v), tv('invalidPhone')),
        email: z
          .string()
          .trim()
          .refine((v) => v === '' || z.email().safeParse(v).success, tv('invalidEmail')),
        status: z.enum(['active', 'inactive']),
      }),
    [tv],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: branch?.code ?? '',
      name: branch?.name ?? '',
      city: branch?.city ?? '',
      district: branch?.district ?? '',
      address: branch?.address ?? '',
      phone: branch?.phone ?? '',
      email: branch?.email ?? '',
      status: branch?.status ?? 'active',
    },
  });

  const save = useMutation({
    mutationFn: (values: Values) => {
      const optional = (value: string) => (value === '' ? undefined : value);
      if (branch) {
        const body: UpdateBranchRequest = {
          name: values.name,
          city: optional(values.city),
          district: optional(values.district),
          address: optional(values.address),
          phone: optional(values.phone),
          email: optional(values.email),
          status: values.status,
        };
        return api.patch<Branch>(`/branches/${branch.id}`, body);
      }
      const body: CreateBranchRequest = {
        code: values.code,
        name: values.name,
        city: optional(values.city),
        district: optional(values.district),
        address: optional(values.address),
        phone: optional(values.phone),
        email: optional(values.email),
      };
      return api.post<Branch>('/branches', body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      toast.success(branch ? t('updated') : t('created'));
      onClose();
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'BRANCH_CODE_TAKEN') {
        form.setError('code', { type: 'server', message: errorMessage(error) });
      }
    },
  });

  const { errors } = form.formState;
  const codeTaken = isApiError(save.error) && save.error.code === 'BRANCH_CODE_TAKEN';

  return (
    <Sheet open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <SheetContent size="md" closeLabel={tc('close')}>
        <SheetHeader
          title={branch ? t('editTitle') : t('createTitle')}
          description={branch?.name}
        />
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetBody className="flex flex-col gap-4">
            {save.isError && !codeTaken ? <Alert>{errorMessage(save.error)}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <Field
                label={t('code')}
                required
                hint={branch ? undefined : t('codeHint')}
                error={errors.code?.message}
              >
                {(field) => (
                  <Input
                    {...field}
                    {...form.register('code')}
                    disabled={branch !== null}
                    className="font-mono uppercase"
                    maxLength={20}
                  />
                )}
              </Field>
              <Field label={t('name')} required error={errors.name?.message}>
                {(field) => (
                  <Input {...field} {...form.register('name')} autoFocus={branch === null} />
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('city')} optionalLabel={tc('optional')} error={errors.city?.message}>
                {(field) => <Input {...field} {...form.register('city')} />}
              </Field>
              <Field
                label={t('district')}
                optionalLabel={tc('optional')}
                error={errors.district?.message}
              >
                {(field) => <Input {...field} {...form.register('district')} />}
              </Field>
            </div>
            <Field
              label={t('address')}
              optionalLabel={tc('optional')}
              error={errors.address?.message}
            >
              {(field) => <Textarea {...field} {...form.register('address')} rows={2} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t('phone')}
                optionalLabel={tc('optional')}
                error={errors.phone?.message}
              >
                {(field) => <Input {...field} {...form.register('phone')} type="tel" />}
              </Field>
              <Field
                label={t('email')}
                optionalLabel={tc('optional')}
                error={errors.email?.message}
              >
                {(field) => <Input {...field} {...form.register('email')} type="email" />}
              </Field>
            </div>
            {branch ? (
              <Field label={tc('status')}>
                {(field) => (
                  <Select {...field} {...form.register('status')} className="sm:max-w-[200px]">
                    <option value="active">{t('status.active')}</option>
                    <option value="inactive">{t('status.inactive')}</option>
                  </Select>
                )}
              </Field>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {tc('save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
