import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { accessFromSession } from '@/lib/access';
import { getServerSession } from '@/lib/api/server';
import { homePath } from '@/lib/navigation';
import { safeNextPath } from '@/lib/paths';
import { LoginForm } from './login-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('submit') };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null);
  // Already signed in: skip the form. An unreachable API must not hide the form, so errors
  // fall through to it (the sign-in request will surface the problem).
  const session = await getServerSession().catch(() => null);
  if (session) redirect(next ?? homePath(accessFromSession(session)));

  return <LoginForm next={next} showDemoHint={process.env.NODE_ENV !== 'production'} />;
}
