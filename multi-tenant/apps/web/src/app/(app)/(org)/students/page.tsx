import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { StudentsView } from '@/features/students/students-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('students');
  return { title: t('title') };
}

export default async function StudentsPage() {
  const { allowed } = await routeAccess('students');
  return allowed ? <StudentsView /> : <ForbiddenPage />;
}
