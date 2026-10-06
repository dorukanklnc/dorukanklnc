'use client';

import {
  type PermissionKey,
  PermissionSet,
  type Scope,
  findMissingDependencies,
  isPermissionKey,
  scopeCovers,
} from '@repo/authorization';
import type { CreateRoleRequest, Grant, PermissionCatalogItem, Role } from '@repo/contracts';
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  Skeleton,
  Textarea,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/form-bits';
import { useSession } from '@/components/session/session-context';
import { api } from '@/lib/api/client';
import { usePermissionLabel } from '@/lib/messages';
import { queryKeys } from '@/lib/query-keys';
import { useErrorMessage } from '@/lib/use-error-message';
import { usePermissionCatalog } from './queries';

export type RoleEditorMode = { kind: 'create'; from?: Role } | { kind: 'edit'; role: Role };

const SENSITIVITY_TONES = {
  standard: 'neutral',
  personal: 'info',
  financial: 'warning',
  restricted: 'danger',
} as const;

/**
 * Custom role editor: one scope selector per permission, grouped by module. Scopes the current
 * user does not hold are disabled (no privilege escalation); the API enforces the same rule.
 */
export function RoleEditorSheet({
  mode,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: RoleEditorMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (role: Role) => void;
}) {
  const t = useTranslations('admin.roles');
  const tc = useTranslations('common');
  const tm = useTranslations('modules');
  const ts = useTranslations('scopes');
  const tv = useTranslations('validation');
  const session = useSession();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const permissionLabel = usePermissionLabel();
  const catalog = usePermissionCatalog(open);

  const source = mode.kind === 'edit' ? mode.role : mode.from;
  const [name, setName] = useState(
    mode.kind === 'edit'
      ? mode.role.name
      : mode.from
        ? t('copyName', { name: mode.from.name })
        : '',
  );
  const [description, setDescription] = useState(source?.description ?? '');
  const [grants, setGrants] = useState<Record<string, Scope>>(() =>
    Object.fromEntries((source?.grants ?? []).map((grant) => [grant.permission, grant.scope])),
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const actor = useMemo(() => PermissionSet.fromRecord(session.permissions), [session.permissions]);
  const grantList = useMemo<Grant[]>(
    () => Object.entries(grants).map(([permission, scope]) => ({ permission, scope })),
    [grants],
  );
  const missing = useMemo(
    () =>
      findMissingDependencies(
        grantList.filter((grant): grant is { permission: PermissionKey; scope: Scope } =>
          isPermissionKey(grant.permission),
        ),
      ),
    [grantList],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, PermissionCatalogItem[]>();
    for (const item of catalog.data ?? []) {
      const list = groups.get(item.module) ?? [];
      list.push(item);
      groups.set(item.module, list);
    }
    return [...groups.entries()];
  }, [catalog.data]);

  const save = useMutation({
    mutationFn: () => {
      const body: CreateRoleRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        grants: grantList,
      };
      return mode.kind === 'edit'
        ? api.patch<Role>(`/roles/${mode.role.id}`, body)
        : api.post<Role>('/roles', body);
    },
    onSuccess: (role) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      toast.success(mode.kind === 'edit' ? t('updated') : t('created'));
      onSaved?.(role);
      onOpenChange(false);
    },
  });

  const submit = () => {
    if (name.trim().length < 2) {
      setNameError(tv('tooShort', { min: 2 }));
      return;
    }
    setNameError(null);
    save.mutate();
  };

  const allowedScope = (permission: string, scope: Scope) => {
    if (!isPermissionKey(permission)) return false;
    const held = actor.scopeOf(permission);
    return held !== null && scopeCovers(held, scope);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <SheetContent size="xl" closeLabel={tc('close')}>
        <SheetHeader
          title={mode.kind === 'edit' ? t('editTitle') : t('createTitle')}
          description={t('editorHint')}
        />
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <SheetBody className="flex flex-col gap-5">
            {save.isError ? <Alert>{errorMessage(save.error)}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('name')} required error={nameError ?? undefined}>
                {(field) => (
                  <Input
                    {...field}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={80}
                  />
                )}
              </Field>
              <Field
                label={t('roleDescription')}
                optionalLabel={tc('optional')}
                className="sm:col-span-2"
              >
                {(field) => (
                  <Textarea
                    {...field}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={300}
                    rows={2}
                  />
                )}
              </Field>
            </div>

            {missing.length > 0 ? (
              <Alert tone="info" title={t('dependenciesTitle')}>
                <ul className="list-disc pl-4">
                  {missing.map((item) => (
                    <li key={`${item.permission}-${item.missing}`}>
                      {t('dependency', {
                        permission: permissionLabel(item.permission),
                        missing: permissionLabel(item.missing),
                      })}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}

            {catalog.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : catalog.isError ? (
              <Alert>{errorMessage(catalog.error)}</Alert>
            ) : (
              <div className="flex flex-col gap-4">
                {grouped.map(([moduleKey, items]) => (
                  <section key={moduleKey} className="rounded-md border border-line">
                    <h3 className="border-b border-line-subtle bg-surface-muted px-3 py-2 text-xs font-semibold text-fg">
                      {tm(moduleKey as Parameters<typeof tm>[0])}
                    </h3>
                    <ul className="divide-y divide-line-subtle">
                      {items.map((item) => {
                        const value = grants[item.key] ?? '';
                        return (
                          <li
                            key={item.key}
                            className="flex flex-wrap items-center gap-3 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-fg">{permissionLabel(item.key)}</p>
                              <p className="font-mono text-2xs text-fg-subtle">{item.key}</p>
                            </div>
                            {item.sensitivity !== 'standard' ? (
                              <Badge tone={SENSITIVITY_TONES[item.sensitivity]}>
                                {t(`sensitivity.${item.sensitivity}`)}
                              </Badge>
                            ) : null}
                            <Select
                              value={value}
                              onChange={(event) => {
                                const next = event.target.value as Scope | '';
                                setGrants((current) => {
                                  const copy = { ...current };
                                  if (next === '') delete copy[item.key];
                                  else copy[item.key] = next;
                                  return copy;
                                });
                              }}
                              aria-label={permissionLabel(item.key)}
                              className="w-44"
                            >
                              <option value="">{t('notGranted')}</option>
                              {item.scopes.map((scope) => (
                                <option
                                  key={scope}
                                  value={scope}
                                  disabled={!allowedScope(item.key, scope) && value !== scope}
                                >
                                  {ts(scope)}
                                </option>
                              ))}
                            </Select>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </SheetBody>
          <SheetFooter className="justify-between">
            <span className="text-xs text-fg-muted">
              {t('grantCount', { count: grantList.length })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={save.isPending}
              >
                {tc('cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={save.isPending}
                disabled={grantList.length === 0}
              >
                {t('save')}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
