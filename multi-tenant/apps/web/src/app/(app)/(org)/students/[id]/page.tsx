import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { StudentProfile } from '@/features/students/student-profile';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('students');
  return { title: t('title') };
}

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { allowed } = await routeAccess('students');
  return allowed ? <StudentProfile studentId={id} /> : <ForbiddenPage />;
}
