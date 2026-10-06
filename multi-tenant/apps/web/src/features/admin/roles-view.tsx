'use client';

import type { PermissionCatalogItem, Role } from '@repo/contracts';
import { Badge, Button, EmptyState, Panel, PanelHeader, Skeleton, cn } from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Copy, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { usePermissions } from '@/components/session/session-context';
import { QueryError } from '@/components/states';
import { api } from '@/lib/api/client';
import { usePermissionLabel } from '@/lib/messages';
import { queryKeys } from '@/lib/query-keys';
import { useErrorMessage } from '@/lib/use-error-message';
import { usePermissionCatalog, useRoles } from './queries';
import { RoleEditorSheet, type RoleEditorMode } from './role-editor-sheet';

export function RolesView() {
  const t = useTranslations('admin.roles');
  const { can } = usePermissions();
  const canManage = can('settings.roles.manage');
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<RoleEditorMode | null>(null);
  const [archiving, setArchiving] = useState<Role | null>(null);

  const selected = roles.data?.find((role) => role.id === selectedId) ?? roles.data?.[0] ?? null;

  const archive = useMutation({
    mutationFn: (role: Role) => api.delete(`/roles/${role.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.roles.all });
      toast.success(t('archived'));
      setArchiving(null);
      setSelectedId(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button
              variant="primary"
              leadingIcon={<Plus />}
              onClick={() => setEditor({ kind: 'create' })}
            >
              {t('create')}
            </Button>
          ) : null
        }
      />
      {roles.isPending ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : roles.isError ? (
        <Panel>
          <QueryError error={roles.error} onRetry={() => void roles.refetch()} />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
          <Panel>
            <ul className="divide-y divide-line-subtle" role="listbox" aria-label={t('title')}>
              {roles.data.map((role) => (
                <li key={role.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={role.id === selected?.id}
                    onClick={() => setSelectedId(role.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-hover',
                      role.id === selected?.id && 'bg-surface-selected',
                    )}
                  >
                    <ShieldCheck
                      className={cn(
                        'mt-0.5 size-4',
                        role.isSystem ? 'text-fg-subtle' : 'text-primary',
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium text-fg">
                        {role.name}
                        <Badge tone={role.isSystem ? 'neutral' : 'info'}>
                          {role.isSystem ? t('system') : t('custom')}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-muted">
                        {t('members', { count: role.memberCount })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {selected ? (
            <RoleDetail
              role={selected}
              catalog={catalog.data ?? []}
              canManage={canManage}
              onClone={() => setEditor({ kind: 'create', from: selected })}
              onEdit={() => setEditor({ kind: 'edit', role: selected })}
              onArchive={() => setArchiving(selected)}
            />
          ) : (
            <Panel>
              <EmptyState icon={<ShieldCheck />} title={t('title')} />
            </Panel>
          )}
        </div>
      )}
      {editor ? (
        <RoleEditorSheet
          key={editor.kind === 'edit' ? editor.role.id : (editor.from?.id ?? 'new')}
          mode={editor}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onSaved={(role) => setSelectedId(role.id)}
        />
      ) : null}
      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
        title={t('archive')}
        description={archiving?.name}
        confirmLabel={t('archive')}
        tone="danger"
        loading={archive.isPending}
        onConfirm={() => {
          if (archiving) archive.mutate(archiving);
        }}
      />
    </>
  );
}

function RoleDetail({
  role,
  catalog,
  canManage,
  onClone,
  onEdit,
  onArchive,
}: {
  role: Role;
  catalog: PermissionCatalogItem[];
  canManage: boolean;
  onClone: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const t = useTranslations('admin.roles');
  const tm = useTranslations('modules');
  const ts = useTranslations('scopes');
  const permissionLabel = usePermissionLabel();

  const groups = useMemo(() => {
    const moduleOf = new Map(catalog.map((item) => [item.key, item.module]));
    const result = new Map<string, Role['grants']>();
    for (const grant of role.grants) {
      const moduleKey = moduleOf.get(grant.permission) ?? grant.permission.split('.')[0] ?? 'other';
      result.set(moduleKey, [...(result.get(moduleKey) ?? []), grant]);
    }
    return [...result.entries()];
  }, [catalog, role.grants]);

  return (
    <Panel>
      <PanelHeader
        title={role.name}
        description={role.description ?? undefined}
        actions={
          canManage ? (
            <>
              <Button variant="secondary" size="sm" leadingIcon={<Copy />} onClick={onClone}>
                {t('clone')}
              </Button>
              {role.isSystem ? null : (
                <>
                  <Button variant="secondary" size="sm" leadingIcon={<Pencil />} onClick={onEdit}>
                    {t('editTitle')}
                  </Button>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    leadingIcon={<Archive />}
                    onClick={onArchive}
                  >
                    {t('archive')}
                  </Button>
                </>
              )}
            </>
          ) : null
        }
      />
      {role.isSystem ? (
        <p className="border-b border-line-subtle px-4 py-2.5 text-xs text-fg-muted">
          {t('systemHint')}
        </p>
      ) : null}
      <div className="flex flex-col divide-y divide-line-subtle">
        {groups.map(([moduleKey, grants]) => (
          <section key={moduleKey} className="px-4 py-3">
            <h3 className="mb-2 text-xs font-semibold text-fg-muted">
              {tm(moduleKey as Parameters<typeof tm>[0])}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {grants.map((grant) => (
                <li
                  key={grant.permission}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-fg">{permissionLabel(grant.permission)}</span>
                  <Badge tone={grant.scope === 'organization' ? 'info' : 'neutral'}>
                    {ts(grant.scope)}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}
