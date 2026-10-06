import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { ClassesView } from '@/features/academics/classes-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('classes');
  return { title: t('title') };
}

export default async function ClassesPage() {
  const { allowed } = await routeAccess('classes');
  return allowed ? <ClassesView /> : <ForbiddenPage />;
}
