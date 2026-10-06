import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { AuditView } from '@/features/admin/audit-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.audit');
  return { title: t('title') };
}

export default async function AuditPage() {
  const { allowed } = await routeAccess('audit');
  return allowed ? <AuditView /> : <ForbiddenPage />;
}
