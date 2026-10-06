import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { GuardiansView } from '@/features/students/guardians-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guardians');
  return { title: t('title') };
}

export default async function GuardiansPage() {
  const { allowed } = await routeAccess('guardians');
  return allowed ? <GuardiansView /> : <ForbiddenPage />;
}
