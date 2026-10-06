'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PermissionSet,
  type RoleGrant,
  findEscalations,
  isPermissionKey,
} from '@repo/authorization';
import type { InviteMemberRequest, Member, Role, UpdateMemberRequest } from '@repo/contracts';
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  Skeleton,
  cn,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/form-bits';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { useErrorMessage } from '@/lib/use-error-message';
import { useRoles } from './queries';

type Mode = { kind: 'invite' } | { kind: 'edit'; member: Member };

/**
 * Invite a member or change an existing member's roles and branch access. Roles that would grant
 * more than the current user holds are shown but disabled (the API rejects them as well).
 */
export function MemberAccessSheet({
  mode,
  open,
  onOpenChange,
}: {
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('admin.users');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const session = useSession();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const roles = useRoles(open);
  const editing = mode.kind === 'edit' ? mode.member : null;

  const actorPermissions = useMemo(
    () => PermissionSet.fromRecord(session.permissions),
    [session.permissions],
  );
  const assignable = (role: Role) =>
    findEscalations(
      actorPermissions,
      role.grants.filter((grant): grant is RoleGrant => isPermissionKey(grant.permission)),
    ).length === 0;

  const schema = useMemo(
    () =>
      z
        .object({
          email: z.string().trim(),
          fullName: z.string().trim(),
          title: z
            .string()
            .trim()
            .max(80, tv('tooLong', { max: 80 })),
          roleIds: z.array(z.string()).min(1, tv('required')),
          allBranches: z.boolean(),
          branchIds: z.array(z.string()),
        })
        .superRefine((values, ctx) => {
          if (!editing) {
            if (!z.email().safeParse(values.email).success) {
              ctx.addIssue({ code: 'custom', path: ['email'], message: tv('invalidEmail') });
            }
            if (values.fullName.length < 2) {
              ctx.addIssue({
                code: 'custom',
                path: ['fullName'],
                message: tv('tooShort', { min: 2 }),
              });
            }
          }
          if (!values.allBranches && values.branchIds.length === 0) {
            ctx.addIssue({ code: 'custom', path: ['branchIds'], message: t('selectBranches') });
          }
        }),
    [editing, t, tv],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      email: editing?.email ?? '',
      fullName: editing?.fullName ?? '',
      title: editing?.title ?? '',
      roleIds: editing?.roles.map((role) => role.id) ?? [],
      allBranches: editing?.allBranches ?? false,
      branchIds:
        editing?.branches.map((branch) => branch.id) ??
        (session.branches.length === 1 ? [session.branches[0]?.id ?? ''] : []),
    },
  });
  const allBranches = useWatch({ control: form.control, name: 'allBranches' });
  const canGrantAllBranches = session.activeMembership?.allBranches ?? false;

  const save = useMutation({
    mutationFn: (values: Values) => {
      const access = {
        roleIds: values.roleIds,
        allBranches: values.allBranches,
        branchIds: values.allBranches ? [] : values.branchIds,
      };
      if (editing) {
        const body: UpdateMemberRequest = { ...access, title: values.title || null };
        return api.patch<Member>(`/members/${editing.id}`, body);
      }
      const body: InviteMemberRequest = {
        ...access,
        email: values.email,
        fullName: values.fullName,
        title: values.title || undefined,
      };
      return api.post<Member>('/members/invitations', body);
    },
    onSuccess: (member) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
      toast.success(editing ? t('updated') : t('invited', { email: member.email }));
      onOpenChange(false);
      form.reset();
    },
  });

  const { errors } = form.formState;
  return (
    <Sheet open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <SheetContent size="lg" closeLabel={tc('close')}>
        <SheetHeader
          title={editing ? t('editTitle') : t('inviteTitle')}
          description={editing ? `${editing.fullName} · ${editing.email}` : t('inviteDescription')}
        />
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
          className="flex min-h-0 flex-1 flex-col"
        >
          <SheetBody className="flex flex-col gap-5">
            {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
            {editing ? null : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('email')} required error={errors.email?.message}>
                  {(field) => (
                    <Input
                      {...field}
                      {...form.register('email')}
                      type="email"
                      autoComplete="off"
                      autoFocus
                    />
                  )}
                </Field>
                <Field label={t('fullName')} required error={errors.fullName?.message}>
                  {(field) => (
                    <Input {...field} {...form.register('fullName')} autoComplete="off" />
                  )}
                </Field>
              </div>
            )}
            <Field
              label={t('jobTitle')}
              optionalLabel={tc('optional')}
              error={errors.title?.message}
            >
              {(field) => <Input {...field} {...form.register('title')} className="sm:max-w-sm" />}
            </Field>

            <fieldset>
              <legend className="text-sm font-medium text-fg">{t('roles')}</legend>
              <p className="mt-0.5 text-xs text-fg-muted">{t('rolesHint')}</p>
              {errors.roleIds?.message ? (
                <p className="mt-1 text-xs text-danger-fg" role="alert">
                  {errors.roleIds.message}
                </p>
              ) : null}
              <div className="mt-2 flex flex-col gap-1.5">
                {roles.isPending ? (
                  <>
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </>
                ) : (
                  <Controller
                    control={form.control}
                    name="roleIds"
                    render={({ field }) => (
                      <>
                        {(roles.data ?? []).map((role) => {
                          const allowed = assignable(role);
                          const checked = field.value.includes(role.id);
                          return (
                            <label
                              key={role.id}
                              className={cn(
                                'flex items-start gap-3 rounded-md border border-line px-3 py-2.5',
                                allowed
                                  ? 'cursor-pointer hover:bg-surface-hover'
                                  : 'cursor-not-allowed opacity-60',
                                checked && 'border-primary bg-surface-selected',
                              )}
                            >
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                disabled={!allowed && !checked}
                                onCheckedChange={(value) =>
                                  field.onChange(
                                    value === true
                                      ? [...field.value, role.id]
                                      : field.value.filter((id) => id !== role.id),
                                  )
                                }
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2 text-sm font-medium text-fg">
                                  {role.name}
                                  {role.isSystem ? (
                                    <Badge tone="neutral">{t('systemRole')}</Badge>
                                  ) : null}
                                </span>
                                {role.description ? (
                                  <span className="mt-0.5 block text-xs text-fg-muted">
                                    {role.description}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          );
                        })}
                      </>
                    )}
                  />
                )}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-fg">{t('branchAccess')}</legend>
              <div className="mt-2 flex flex-col gap-2">
                {canGrantAllBranches ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={allBranches}
                      onChange={() => form.setValue('allBranches', true, { shouldDirty: true })}
                      className="accent-primary"
                    />
                    {t('branchAccessAll')}
                  </label>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={!allBranches}
                    onChange={() => form.setValue('allBranches', false, { shouldDirty: true })}
                    className="accent-primary"
                  />
                  {t('branchAccessSelected')}
                </label>
                {!allBranches ? (
                  <Controller
                    control={form.control}
                    name="branchIds"
                    render={({ field }) => (
                      <div className="ml-6 flex flex-col gap-1.5">
                        {session.branches.map((branch) => (
                          <label key={branch.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={field.value.includes(branch.id)}
                              onCheckedChange={(value) =>
                                field.onChange(
                                  value === true
                                    ? [...field.value, branch.id]
                                    : field.value.filter((id) => id !== branch.id),
                                )
                              }
                            />
                            {branch.name}
                            <span className="font-mono text-2xs text-fg-subtle">{branch.code}</span>
                          </label>
                        ))}
                        {errors.branchIds?.message ? (
                          <p className="text-xs text-danger-fg" role="alert">
                            {errors.branchIds.message}
                          </p>
                        ) : null}
                      </div>
                    )}
                  />
                ) : null}
              </div>
            </fieldset>
          </SheetBody>
          <SheetFooter>
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {editing ? tc('saveChanges') : t('submitInvite')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
