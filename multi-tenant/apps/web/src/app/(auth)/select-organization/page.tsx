import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from '@/lib/api/server';
import { OrganizationPicker } from './organization-picker';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.selectOrganization');
  return { title: t('title') };
}

export default async function SelectOrganizationPage() {
  const session = await getServerSession();
  if (!session) redirect('/login?next=/select-organization');
  return (
    <OrganizationPicker
      memberships={session.memberships}
      activeOrganizationId={session.activeOrganization?.id ?? null}
      hasPlatformAccess={session.platformPermissions.includes('platform.organizations.manage')}
    />
  );
}
