import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/config/env.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { invitationEmail } from '../../platform/mail/templates.js';
import { INVITATION_TTL_DAYS } from './provisioning.js';

@Injectable()
export class InvitationMailer {
  constructor(
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async send(input: {
    email: string;
    inviteeName: string;
    organizationName: string;
    inviterName: string | null;
    token: string;
    locale?: string | null;
  }): Promise<void> {
    const message = invitationEmail({
      locale: input.locale ?? null,
      inviteeName: input.inviteeName,
      organizationName: input.organizationName,
      inviterName: input.inviterName,
      link: `${this.config.APP_URL}/invitations/${encodeURIComponent(input.token)}`,
      expiresInDays: INVITATION_TTL_DAYS,
    });
    await this.mail.send({ to: input.email, ...message, template: 'invitation' });
  }
}
