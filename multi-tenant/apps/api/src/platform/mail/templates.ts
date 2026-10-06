import { PRODUCT_NAME } from '../brand.js';

/**
 * Transactional e-mail templates. Turkish is the default; English exists so the structure is
 * proven multilingual. Keep wording short, plain and free of personal data beyond the name.
 */
type Locale = 'tr' | 'en';

function localeOf(value: string | null | undefined): Locale {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'tr';
}

export function invitationEmail(input: {
  locale?: string | null;
  inviteeName: string;
  organizationName: string;
  inviterName: string | null;
  link: string;
  expiresInDays: number;
}) {
  const locale = localeOf(input.locale);
  if (locale === 'en') {
    return {
      subject: `You're invited to ${input.organizationName}`,
      text: [
        `Hello ${input.inviteeName},`,
        '',
        `${input.inviterName ?? 'An administrator'} invited you to join ${input.organizationName} on ${PRODUCT_NAME}.`,
        `Accept the invitation: ${input.link}`,
        '',
        `This link expires in ${input.expiresInDays} days. If you were not expecting it, ignore this e-mail.`,
      ].join('\n'),
    };
  }
  return {
    subject: `${input.organizationName} sizi davet etti`,
    text: [
      `Merhaba ${input.inviteeName},`,
      '',
      `${input.inviterName ?? 'Bir yönetici'}, sizi ${PRODUCT_NAME} üzerindeki ${input.organizationName} kurumuna davet etti.`,
      `Daveti kabul etmek için: ${input.link}`,
      '',
      `Bu bağlantı ${input.expiresInDays} gün geçerlidir. Bu daveti beklemiyorsanız e-postayı yok sayabilirsiniz.`,
    ].join('\n'),
  };
}

export function passwordResetEmail(input: {
  locale?: string | null;
  name: string;
  link: string;
  expiresInMinutes: number;
}) {
  const locale = localeOf(input.locale);
  if (locale === 'en') {
    return {
      subject: `Reset your ${PRODUCT_NAME} password`,
      text: [
        `Hello ${input.name},`,
        '',
        `Reset your password: ${input.link}`,
        `The link expires in ${input.expiresInMinutes} minutes and can be used once.`,
        'If you did not request this, you can ignore this e-mail; your password stays unchanged.',
      ].join('\n'),
    };
  }
  return {
    subject: `${PRODUCT_NAME} şifre sıfırlama`,
    text: [
      `Merhaba ${input.name},`,
      '',
      `Şifrenizi sıfırlamak için: ${input.link}`,
      `Bağlantı ${input.expiresInMinutes} dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
      'Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz; şifreniz değişmez.',
    ].join('\n'),
  };
}
