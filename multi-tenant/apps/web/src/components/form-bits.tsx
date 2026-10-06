'use client';

import { Input, type InputProps, cn } from '@repo/ui';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

/** Password field with a show/hide toggle. */
export function PasswordInput(props: Omit<InputProps, 'type' | 'trailing'>) {
  const t = useTranslations('auth');
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="flex rounded-sm p-0.5 text-fg-subtle hover:text-fg [&_svg]:size-4"
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          aria-pressed={visible}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      }
    />
  );
}

const alertTones = {
  danger: { className: 'border-danger-border bg-danger-bg text-danger-fg', icon: AlertCircle },
  success: { className: 'border-success-border bg-success-bg text-success-fg', icon: CheckCircle2 },
  info: { className: 'border-info-border bg-info-bg text-info-fg', icon: Info },
} as const;

/** Inline message above or inside a form (errors are announced to screen readers). */
export function Alert({
  tone = 'danger',
  title,
  children,
  className,
}: {
  tone?: keyof typeof alertTones;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { className: toneClass, icon: Icon } = alertTones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-2.5 rounded-md border px-3 py-2.5 text-sm', toneClass, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? (
          <div className={cn(title ? 'mt-0.5 opacity-90' : undefined)}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}

/** The card that frames every authentication step. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="px-7 pb-2 pt-7">
        <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      <div className="px-7 pb-7 pt-4">{children}</div>
      {footer ? (
        <div className="border-t border-line-subtle bg-surface-muted px-7 py-3.5 text-center text-sm text-fg-muted">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
