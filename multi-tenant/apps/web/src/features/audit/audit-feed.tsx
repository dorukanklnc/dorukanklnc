'use client';

import type { AuditLogItem } from '@repo/contracts';
import { Tooltip, cn } from '@repo/ui';
import { Bot, ChevronDown, CreditCard, LifeBuoy, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuditActionLabel } from '@/lib/messages';
import { useFormat } from '@/lib/use-format';

const ACTOR_ICONS = {
  user: UserRound,
  system: Bot,
  support: LifeBuoy,
  webhook: CreditCard,
} as const;

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Chronological activity list (who did what, when) with expandable field changes. */
export function AuditFeed({
  items,
  showResource = false,
}: {
  items: AuditLogItem[];
  showResource?: boolean;
}) {
  return (
    <ol className="flex flex-col">
      {items.map((item) => (
        <AuditEntry key={item.id} item={item} showResource={showResource} />
      ))}
    </ol>
  );
}

function AuditEntry({ item, showResource }: { item: AuditLogItem; showResource: boolean }) {
  const t = useTranslations('admin.audit');
  const format = useFormat();
  const actionLabel = useAuditActionLabel();
  const [open, setOpen] = useState(false);
  const Icon = ACTOR_ICONS[item.actor.type];
  const changes = Object.entries(item.changes ?? {});
  const actor = item.actor.name ?? t(`actor.${item.actor.type}`);

  return (
    <li className="flex gap-3 border-b border-line-subtle px-4 py-3 last:border-b-0">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-subtle">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm text-fg">
            <span className="font-medium">{actionLabel(item.action)}</span>
            {showResource && item.resourceType ? (
              <span className="text-fg-muted"> · {item.resourceType}</span>
            ) : null}
          </p>
          <Tooltip content={format.dateTime(item.occurredAt)}>
            <time dateTime={item.occurredAt} className="shrink-0 text-xs text-fg-subtle">
              {format.relative(item.occurredAt)}
            </time>
          </Tooltip>
        </div>
        <p className="mt-0.5 text-xs text-fg-muted">
          {actor}
          {item.branch ? ` · ${item.branch.name}` : ''}
        </p>
        {changes.length > 0 ? (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {t('changes')} ({changes.length})
              <ChevronDown
                className={cn('size-3 transition-transform', open && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            {open ? (
              <table className="mt-2 w-full max-w-xl text-xs">
                <thead>
                  <tr className="text-left text-fg-subtle">
                    <th className="py-1 pr-3 font-medium" />
                    <th className="py-1 pr-3 font-medium">{t('before')}</th>
                    <th className="py-1 font-medium">{t('after')}</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map(([field, change]) => (
                    <tr key={field} className="border-t border-line-subtle align-top">
                      <td className="py-1 pr-3 font-mono text-fg-muted">{field}</td>
                      <td className="break-all py-1 pr-3 text-fg-muted line-through decoration-fg-subtle/50">
                        {formatAuditValue(change.before)}
                      </td>
                      <td className="break-all py-1 text-fg">{formatAuditValue(change.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
