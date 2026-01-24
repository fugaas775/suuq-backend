import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const postmarkTransport = require('nodemailer-postmark-transport');

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private configOk = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('emails') private readonly emailQueue: Queue,
  ) {
    this.initTransport();
  }

  private initTransport() {
    const disableAll =
      this.configService.get<string>('EMAIL_DISABLE') === 'true';
    if (disableAll) {
      this.logger.warn(
        'Email disabled via EMAIL_DISABLE=true. All emails will be logged only.',
      );
      this.configOk = false;
      this.transporter = null;
      return;
    }

    const provider =
      this.configService.get<string>('EMAIL_PROVIDER') || 'smtp';

    if (provider === 'postmark') {
      this.initPostmarkTransport();
    } else {
      this.initSmtpTransport();
    }
  }

  private initPostmarkTransport() {
    const apiKey = this.configService.get<string>('POSTMARK_API_TOKEN');

    if (!apiKey) {
      this.logger.warn(
        'Postmark not configured (POSTMARK_API_TOKEN missing).',
      );
      this.configOk = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport(
        postmarkTransport({
          auth: {
            apiKey: apiKey,
          },
        }),
      );

      this.configOk = true;
      this.logger.log(`Email transport configured with Postmark API`);
    } catch (e: any) {
      this.logger.error(`Failed to initialize Postmark transport: ${e.message}`);
      this.configOk = false;
    }
  }

  private initSmtpTransport() {
    const skipVerify =
      this.configService.get<string>('EMAIL_SKIP_VERIFY') === 'true';

    const host = this.configService.get<string>('EMAIL_HOST');
    const user = this.configService.get<string>('EMAIL_USER');
    const pass = this.configService.get<string>('EMAIL_PASS');
    const port = parseInt(
      this.configService.get<string>('EMAIL_PORT') || '587',
      10,
    );
    const secureEnv = this.configService.get<string>('EMAIL_SECURE');
    const secure = secureEnv ? secureEnv === 'true' : port === 465; // default heuristic

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
      const verifyOnStartup =
        this.configService.get<string>('EMAIL_VERIFY_ON_STARTUP') === 'true';
      if (skipVerify || !verifyOnStartup) {
        this.configOk = true; // assume OK; failures will be logged at send time
        if (skipVerify) {
          this.logger.warn(
            'EMAIL_SKIP_VERIFY=true: skipping SMTP verify on startup.',
          );
        } else {
          this.logger.log(
            'Skipping SMTP verify on startup (set EMAIL_VERIFY_ON_STARTUP=true to enable).',
          );
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

  /**
   * Add email to the queue.
   */
  async send(mail: nodemailer.SendMailOptions) {
    try {
      await this.emailQueue.add('send-email', mail, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      });
      this.logger.debug(`Email job added to queue for ${mail.to}`);
    } catch (e: any) {
      this.logger.error(`Failed to add email to queue: ${e.message}`);
    }
  }

  /**
   * Actually send the email (called by processor).
   */
  async sendInternal(mail: nodemailer.SendMailOptions) {
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
        `Email sent id=${info.messageId} to=${mailToSend.to}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed sending email to ${mailToSend.to}: ${err?.message}`,
      );
      throw err; // Re-throw to trigger BullMQ retry
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

  async sendWelcomeEmail(user: { email: string; displayName?: string }) {
    const firstName = user.displayName?.split(' ')[0] || 'User';
    const mail = {
      to: user.email,
      subject: 'Welcome to Suuq!',
      text: `Hi ${firstName},\n\nWelcome to Suuq! We are excited to have you on board. You can now browse products, make orders, and enjoy our services across East Africa.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Welcome to Suuq!</h2>
        <p>Hi ${firstName},</p>
        <p>We are excited to have you on board. You can now browse products, make orders, and enjoy our services across East Africa.</p>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendOrderConfirmation(order: any) {
    if (!order || !order.user || !order.user.email) {
      this.logger.warn('Cannot send order confirmation: Missing user email');
      return;
    }

    const firstName = order.user.displayName?.split(' ')[0] || 'Customer';
    const total = order.total_display?.amount || order.total || 0;
    const currency = order.total_display?.currency || order.currency || 'ETB';
    const date = new Date().toLocaleDateString();

    const itemsHtml = (order.items || [])
      .map(
        (item: any) =>
          `<li>${item.quantity}x ${item.product?.name || 'Item'} - ${
            item.price_display?.amount || item.price
          } ${item.price_display?.currency || currency}</li>`,
      )
      .join('');

    const mail = {
      to: order.user.email,
      subject: `Order Confirmation #${order.id}`,
      text: `Hi ${firstName},\n\nThank you for your order! Your order #${order.id} has been received.\n\nTotal: ${total} ${currency}\n\nItems:\n${(
        order.items || []
      )
        .map(
          (i: any) =>
            `- ${i.quantity}x ${i.product?.name} (${i.price_display?.amount || i.price} ${i.price_display?.currency || currency})`,
        )
        .join('\n')}\n\nWe will notify you when it is shipped.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Thank you for your order!</h2>
        <p>Hi ${firstName},</p>
        <p>Your order <strong>#${order.id}</strong> has been received on ${date}.</p>
        <h3>Order Summary</h3>
        <ul>${itemsHtml}</ul>
        <p><strong>Total: ${total} ${currency}</strong></p>
        <p>We will notify you when your order is shipped.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };

    await this.send(mail);
  }

  async sendOrderShipped(order: any) {
    if (!order || !order.user || !order.user.email) return;

    const firstName = order.user.displayName?.split(' ')[0] || 'Customer';
    const mail = {
      to: order.user.email,
      subject: `Your Order #${order.id} is on the way!`,
      text: `Hi ${firstName},\n\nGood news! Your order #${order.id} has been shipped and is on its way to you.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Order Shipped!</h2>
        <p>Hi ${firstName},</p>
        <p>Good news! Your order <strong>#${order.id}</strong> has been shipped and is on its way to you.</p>
        <p>We will notify you once it arrives.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendOrderDelivered(order: any) {
    if (!order || !order.user || !order.user.email) return;

    const firstName = order.user.displayName?.split(' ')[0] || 'Customer';
    const mail = {
      to: order.user.email,
      subject: `Order #${order.id} Delivered`,
      text: `Hi ${firstName},\n\nYour order #${order.id} has been delivered successfully. Thank you for shopping with Suuq!\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Order Delivered!</h2>
        <p>Hi ${firstName},</p>
        <p>Your order <strong>#${order.id}</strong> has been delivered successfully.</p>
        <p>Thank you for shopping with Suuq!</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendOrderCancelled(order: any) {
    if (!order || !order.user || !order.user.email) return;

    const firstName = order.user.displayName?.split(' ')[0] || 'Customer';
    const mail = {
      to: order.user.email,
      subject: `Order #${order.id} Cancelled`,
      text: `Hi ${firstName},\n\nYour order #${order.id} has been cancelled. If you have any questions, please contact support.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Order Cancelled</h2>
        <p>Hi ${firstName},</p>
        <p>Your order <strong>#${order.id}</strong> has been cancelled.</p>
        <p>If you have any questions, please contact support.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendVendorNewOrderEmail(
    vendorEmail: string,
    vendorName: string,
    orderId: number,
    items: any[],
    currency: string,
  ) {
    const itemsHtml = items
      .map(
        (item) =>
          `<li>${item.quantity}x ${item.productName} - ${item.price} ${currency}</li>`,
      )
      .join('');

    const mail = {
      to: vendorEmail,
      subject: `New Order #${orderId} Received`,
      text: `Hi ${vendorName},\n\nYou have received a new order #${orderId} containing the following items:\n\n${items
        .map(
          (i) =>
            `- ${i.quantity}x ${i.productName} (${i.price} ${currency})`,
        )
        .join(
          '\n',
        )}\n\nPlease prepare these items for shipping.\n\nIf you cannot fulfill this order, please contact us immediately at admin@suuqsapp.com.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>New Order Received!</h2>
        <p>Hi ${vendorName},</p>
        <p>You have received a new order <strong>#${orderId}</strong>.</p>
        <h3>Items to Fulfill:</h3>
        <ul>${itemsHtml}</ul>
        <p>Please prepare these items for shipping.</p>
        <p style="color: #666; font-size: 0.9em;">If you cannot fulfill this order, please <a href="mailto:admin@suuqsapp.com">contact us immediately</a>.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendDelivererAssignmentEmail(
    deliverer: { email: string; displayName?: string },
    orderId: number,
    pickupLocations: string[],
  ) {
    const firstName = deliverer.displayName?.split(' ')[0] || 'Partner';
    const locationsList = pickupLocations
      .map((loc) => `<li>${loc}</li>`)
      .join('');

    const mail = {
      to: deliverer.email,
      subject: `New Assignment: Order #${orderId}`,
      text: `Hi ${firstName},\n\nYou have been assigned to deliver Order #${orderId}.\n\nPickup Locations:\n${pickupLocations
        .map((l) => `- ${l}`)
        .join(
          '\n',
        )}\n\nPlease open the Deliverer App for full details and navigation.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>New Delivery Assignment</h2>
        <p>Hi ${firstName},</p>
        <p>You have been assigned to deliver <strong>Order #${orderId}</strong>.</p>
        <h3>Pickup Locations:</h3>
        <ul>${locationsList}</ul>
        <p>Please open the Deliverer App for full details and navigation.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendProductRequestCreated(
    buyer: { email: string; displayName?: string },
    request: any,
  ) {
    const firstName = buyer.displayName?.split(' ')[0] || 'User';
    const mail = {
      to: buyer.email,
      subject: `Product Request Received: ${request.title}`,
      text: `Hi ${firstName},\n\nWe have received your product request for "${request.title}".\n\nWe will notify relevant vendors, and you will receive an email when an offer is made.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Request Received</h2>
        <p>Hi ${firstName},</p>
        <p>We have received your product request for <strong>${request.title}</strong>.</p>
        <p>We will notify relevant vendors, and you will receive an email when an offer is made.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendProductRequestOfferReceived(
    buyer: { email: string; displayName?: string },
    offer: any,
  ) {
    const firstName = buyer.displayName?.split(' ')[0] || 'User';
    const price = offer.price || 'N/A';
    const currency = offer.currency || '';
    const vendorName =
      offer.seller?.storeName || offer.seller?.displayName || 'A Vendor';

    const mail = {
      to: buyer.email,
      subject: `New Offer for "${offer.request?.title}"`,
      text: `Hi ${firstName},\n\nGood news! ${vendorName} has made an offer for your request "${offer.request?.title}".\n\nPrice: ${price} ${currency}\n\nCheck the app to accept or reject this offer.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>New Offer!</h2>
        <p>Hi ${firstName},</p>
        <p>Good news! <strong>${vendorName}</strong> has made an offer for your request <strong>"${offer.request?.title}"</strong>.</p>
        <p><strong>Price: ${price} ${currency}</strong></p>
        <p>Check the app to accept or reject this offer.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendOfferStatusChange(
    seller: { email: string; displayName?: string },
    offer: any,
    status: 'ACCEPTED' | 'REJECTED',
  ) {
    const firstName = seller.displayName?.split(' ')[0] || 'Vendor';
    const subject =
      status === 'ACCEPTED' ? 'Offer Accepted!' : 'Offer Rejected';
    const bodyText =
      status === 'ACCEPTED'
        ? `Congratulations! Your offer for "${offer.request?.title}" has been accepted. The buyer should proceed to order shortly.`
        : `Your offer for "${offer.request?.title}" has been declined by the buyer.`;

    const mail = {
      to: seller.email,
      subject: subject,
      text: `Hi ${firstName},\n\n${bodyText}\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>${subject}</h2>
        <p>Hi ${firstName},</p>
        <p>${bodyText}</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendWithdrawalRequested(
    user: { email: string; displayName?: string },
    amount: number,
    method: string,
    withdrawalId: number,
  ) {
    if (!user || !user.email) return;

    const firstName = user.displayName?.split(' ')[0] || 'User';
    const mail = {
      to: user.email,
      subject: `Withdrawal Request #${withdrawalId} Received`,
      text: `Hi ${firstName},\n\nWe sort-of received your withdrawal request of ${amount} via ${method}. It is currently Pending approval.\n\nWe will notify you once it is processed.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Withdrawal Request Pending</h2>
        <p>Hi ${firstName},</p>
        <p>We received your withdrawal request of <strong>${amount}</strong> via <strong>${method}</strong>.</p>
        <p>It is currently <strong>Pending</strong> execution.</p>
        <p>We will notify you once it's processed.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);

    // Ideally, also notify Admins here! 
    // But we don't have a single admin email config handy in this method.
  }

  async sendWithdrawalApproved(
    user: { email: string; displayName?: string },
    amount: number,
    method: string,
    withdrawalId: number,
  ) {
    if (!user || !user.email) return;
    const firstName = user.displayName?.split(' ')[0] || 'User';
    const mail = {
      to: user.email,
      subject: `Withdrawal #${withdrawalId} Approved`,
      text: `Hi ${firstName},\n\nGood news! Your withdrawal of ${amount} via ${method} has been approved and the funds have been sent.\n\nPlease allow standard processing time for the funds to appear in your account.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Withdrawal Approved!</h2>
        <p>Hi ${firstName},</p>
        <p>Good news! Your withdrawal of <strong>${amount}</strong> via <strong>${method}</strong> has been approved.</p>
        <p>The funds have been sent to your chosen account. Please allow standard processing time for them to appear.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendWithdrawalRejected(
    user: { email: string; displayName?: string | null },
    amount: number,
    method: string,
    withdrawalId: number,
    reason?: string,
  ) {
    if (!user || !user.email) return;
    const firstName = user.displayName?.split(' ')[0] || 'User';
    const reasonText = reason ? `Reason: ${reason}` : '';
    
    const mail = {
      to: user.email,
      subject: `Withdrawal #${withdrawalId} Rejected`,
      text: `Hi ${firstName},\n\nYour withdrawal request of ${amount} via ${method} has been rejected.\n\n${reasonText}\n\nThe funds have been returned to your Suuq wallet.\n\nBest regards,\nThe Suuq Team`,
      html: `
        <h2>Withdrawal Rejected</h2>
        <p>Hi ${firstName},</p>
        <p>Your withdrawal request of <strong>${amount}</strong> via <strong>${method}</strong> has been rejected.</p>
        <p><strong>${reasonText}</strong></p>
        <p>The funds have been returned to your Suuq wallet.</p>
        <br/>
        <p>Best regards,<br/>The Suuq Team</p>
      `,
    };
    await this.send(mail);
  }

  async sendEmailChangeCode(to: string, code: string) {
    if (!to) return;
    const mail = {
      to,
      subject: 'Verification Code for Email Change',
      text: `Your verification code to change your email is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please change your password immediately.`,
      html: `
        <h2>Email Change Verification</h2>
        <p>Your verification code is: <strong>${code}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you did not request this, please change your password immediately.</p>
      `,
    };
    await this.send(mail);
  }

  async sendIdentityVerificationCode(to: string, code: string) {
    if (!to) return;
    const mail = {
      to,
      subject: 'Verification Code for Identity',
      text: `Your identity verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please change your password immediately.`,
      html: `
        <h2>Identity Verification</h2>
        <p>Your verification code is: <strong>${code}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you did not request this, please change your password immediately.</p>
      `,
    };
    await this.send(mail);
  }
}
