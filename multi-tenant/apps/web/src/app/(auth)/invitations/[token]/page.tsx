import type { InvitationPreview } from '@repo/contracts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Alert, AuthCard } from '@/components/form-bits';
import { fetchPublic } from '@/lib/api/server';
import { AcceptInvitationForm } from './accept-invitation-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.invitation');
  return { title: t('accept') };
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('auth');
  const te = await getTranslations('errors');
  const preview = await fetchPublic<InvitationPreview>(
    `/auth/invitations/${encodeURIComponent(token)}`,
  );

  if (!preview.ok) {
    return (
      <AuthCard
        title={t('invitation.accept')}
        footer={
          <Link href="/login" className="text-primary hover:underline">
            {t('forgot.backToLogin')}
          </Link>
        }
      >
        <Alert>{preview.status === 429 ? te('RATE_LIMITED') : t('invitation.invalid')}</Alert>
      </AuthCard>
    );
  }

  return <AcceptInvitationForm token={token} preview={preview.data} />;
}
