import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from 'pino';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { LOGGER } from '../logging/logging.module.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Logical template name for logs/metrics; never log message bodies in production. */
  template: string;
}

/**
 * Outbound e-mail behind a driver switch: `smtp` (Mailpit locally, real SMTP in production),
 * `console` (development logs) and `memory` (tests read {@link MailService.sent}).
 */
@Injectable()
export class MailService implements OnApplicationShutdown {
  readonly sent: MailMessage[] = [];
  private transporter?: Transporter;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    if (config.MAIL_DRIVER === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        ...(config.SMTP_USER
          ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' } }
          : {}),
      });
    }
  }

  async send(message: MailMessage): Promise<void> {
    switch (this.config.MAIL_DRIVER) {
      case 'memory':
        this.sent.push(message);
        return;
      case 'console':
        this.logger.info(
          { template: message.template, subject: message.subject, body: message.text },
          'mail (console driver)',
        );
        return;
      case 'smtp':
        await this.transporter?.sendMail({
          from: this.config.MAIL_FROM,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        });
        this.logger.info({ template: message.template }, 'mail sent');
        return;
    }
  }

  onApplicationShutdown(): void {
    this.transporter?.close();
  }
}
