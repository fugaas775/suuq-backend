import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private configOk = false;

  constructor(private readonly configService: ConfigService) {
    this.initTransport();
  }

  private initTransport() {
    const disableAll = this.configService.get<string>('EMAIL_DISABLE') === 'true';
    const skipVerify = this.configService.get<string>('EMAIL_SKIP_VERIFY') === 'true';
    if (disableAll) {
      this.logger.warn('Email disabled via EMAIL_DISABLE=true. All emails will be logged only.');
      this.configOk = false;
      this.transporter = null;
      return;
    }

    const host = this.configService.get<string>('EMAIL_HOST');
    const user = this.configService.get<string>('EMAIL_USER');
    const pass = this.configService.get<string>('EMAIL_PASS');
    const port = parseInt(
      this.configService.get<string>('EMAIL_PORT') || '587',
      10,
    );
    const secureEnv = this.configService.get<string>('EMAIL_SECURE');
    const secure = secureEnv
      ? secureEnv === 'true'
      : port === 465; // default heuristic

    if (!host || !user || !pass) {
      this.logger.warn(
        'Email not fully configured (EMAIL_HOST/EMAIL_USER/EMAIL_PASS missing). Password reset emails will be logged only.',
      );
      this.configOk = false;
      return;
    }

    const connectionTimeout = parseInt(
      this.configService.get<string>('EMAIL_CONNECTION_TIMEOUT_MS') || '10000',
      10,
    );
    const greetingTimeout = parseInt(
      this.configService.get<string>('EMAIL_GREETING_TIMEOUT_MS') || '10000',
      10,
    );
    const socketTimeout = parseInt(
      this.configService.get<string>('EMAIL_SOCKET_TIMEOUT_MS') || '20000',
      10,
    );

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
        tls: {
          // Allow turning off cert validation only if explicitly requested
          rejectUnauthorized:
            this.configService.get<string>('EMAIL_TLS_REJECT_UNAUTHORIZED') !==
            'false',
        },
      });

      // Optionally skip verify to avoid startup timeouts
      const verifyOnStartup = this.configService.get<string>('EMAIL_VERIFY_ON_STARTUP') === 'true';
      if (skipVerify || !verifyOnStartup) {
        this.configOk = true; // assume OK; failures will be logged at send time
        if (skipVerify) {
          this.logger.warn('EMAIL_SKIP_VERIFY=true: skipping SMTP verify on startup.');
        } else {
          this.logger.log('Skipping SMTP verify on startup (set EMAIL_VERIFY_ON_STARTUP=true to enable).');
        }
      } else {
        // Proactively verify to fail fast instead of timing out later
        this.transporter
          .verify()
          .then(() => {
            this.configOk = true;
            this.logger.log(
              `Email transport verified: host=${host} port=${port} secure=${secure}`,
            );
          })
          .catch((err) => {
            this.logger.error(
              `Email transport verification failed (will fallback to log mode): ${err?.message}`,
            );
            this.configOk = false;
          });
      }
    } catch (e: any) {
      this.logger.error(
        `Failed to initialize email transport: ${e?.message || e}`,
      );
      this.transporter = null;
      this.configOk = false;
    }
  }

  async send(mail: nodemailer.SendMailOptions) {
    const from =
      this.configService.get('EMAIL_FROM') ||
      '"Suuq Marketplace" <no-reply@suuq.com>';
    const mailToSend = { ...mail, from };

    if (!this.transporter || !this.configOk) {
      this.logger.warn(
        `Email disabled or transporter not verified. Mail subject: ${mailToSend.subject} to: ${mailToSend.to}`,
      );
      return;
    }

    try {
      const info = await this.transporter.sendMail(mailToSend);
      this.logger.debug(
        `Email queued id=${info.messageId} to=${mailToSend.to}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed sending email to ${mailToSend.to}: ${err?.message}`,
      );
    }
  }

  async sendPasswordResetEmail(to: string, token: string) {
    const adminUrl = this.configService.get('ADMIN_URL') || '';
    const resetLink = `${adminUrl.replace(
      /\$/,
      '',
    )}/reset-password?token=${token}`;

    const mail = {
      to,
      subject: 'Your Password Reset Request',
      text: `You requested a password reset. Open this link to reset: ${resetLink}`,
      html: `<p>You requested a password reset. Click this link to reset it:</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    };

    await this.send(mail);
  }
}
