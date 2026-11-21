import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from '../email/email.service';
import { User } from '../users/entities/user.entity';
import { Branch } from '../branches/entities/branch.entity';
import { SubscriptionPaymentClaim } from './entities/subscription-payment-claim.entity';
import { findSubscriptionPaymentDestination } from './payment-destinations';

const KIND_LABELS: Record<string, string> = {
  POS_BRANCH: 'Branch subscription',
  POS_BRANCH_CREATE: 'New branch',
  SUPPLIER: 'Supplier subscription',
  BNPL: 'Equity partner payment',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
}

function money(amount: number | string, currency: string): string {
  return `${currency || 'ETB'} ${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface MailBody {
  subject: string;
  heading: string;
  /** Plain sentences, shown above the table. */
  intro: string[];
  rows?: Array<[string, string | null | undefined]>;
  /** A link button under the table. */
  action?: { label: string; url: string } | null;
  /** Plain sentences, shown under everything. */
  footer?: string[];
}

/** One plain layout for every billing email — text and HTML from the same content. */
export function renderBillingEmail(body: MailBody): {
  subject: string;
  text: string;
  html: string;
} {
  const rows = (body.rows ?? []).filter(([, value]) => value);
  const text = [
    ...body.intro,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(body.action ? ['', `${body.action.label}: ${body.action.url}`] : []),
    ...(body.footer?.length ? ['', ...body.footer] : []),
    '',
    'Suuq S',
  ].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px;color:#111;line-height:1.5">
<h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(body.heading)}</h2>
${body.intro.map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`).join('')}
${
  rows.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">${rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 0;color:#666;width:180px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : ''
}
${
  body.action
    ? `<p style="margin:16px 0"><a href="${escapeHtml(body.action.url)}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(body.action.label)}</a></p>`
    : ''
}
${(body.footer ?? []).map((line) => `<p style="margin:0 0 8px;font-size:13px;color:#555">${escapeHtml(line)}</p>`).join('')}
<hr style="margin:16px 0;border:none;border-top:1px solid #eee"/>
<p style="font-size:12px;color:#999;margin:0">Suuq S</p>
</div>`;
  return { subject: body.subject, text, html };
}

/**
 * Email for subscription billing: the admins hear about a payment the moment
 * it is submitted (nothing is granted until they verify it, so a payment that
 * nobody sees keeps a shop closed); the customer hears that it was received,
 * then that it was verified or why it was not; and a paying owner is reminded
 * by email before a term ends and when it has.
 *
 * Every method swallows its own failures. Mail must never undo, delay or fail
 * the payment step it reports on.
 */
@Injectable()
export class SubscriptionPaymentMailerService {
  private readonly logger = new Logger(SubscriptionPaymentMailerService.name);

  constructor(
    private readonly emailService: EmailService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Branch)
    private readonly branchesRepo: Repository<Branch>,
  ) {}

  private async branchNameOf(branchId: number | null | undefined) {
    if (!branchId) return 'your branch';
    const branch = await this.branchesRepo.findOne({ where: { id: branchId } });
    return branch?.name || `branch #${branchId}`;
  }

  /**
   * Who is told about a payment waiting to be verified. BILLING_ADMIN_EMAILS
   * (comma separated) when set, else the super admins, else the platform's
   * admin address.
   */
  adminRecipients(): string[] {
    const raw =
      process.env.BILLING_ADMIN_EMAILS ||
      process.env.SUPER_ADMIN_EMAILS ||
      process.env.SUPER_ADMIN_EMAIL ||
      process.env.ADMIN_EMAIL ||
      'admin@suuqsapp.com';
    return Array.from(
      new Set(
        raw
          .split(/[,;\s]+/)
          .map((entry) => entry.trim().toLowerCase())
          .filter((entry) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry)),
      ),
    );
  }

  private adminUrl(): string {
    return `${(process.env.ADMIN_PORTAL_URL || 'https://admin.suuq-s.com').replace(/\/+$/, '')}/payments`;
  }

  private billingUrl(claim?: SubscriptionPaymentClaim): string {
    const base = (
      process.env.POS_PORTAL_URL || 'https://pos.suuq-s.com'
    ).replace(/\/+$/, '');
    return claim?.kind === 'SUPPLIER'
      ? `${base}/supplier/billing`
      : `${base}/seller/billing`;
  }

  private claimRows(
    claim: SubscriptionPaymentClaim,
  ): Array<[string, string | null]> {
    const destination = findSubscriptionPaymentDestination(claim.channel);
    return [
      ['For', claim.subjectName || KIND_LABELS[claim.kind] || claim.kind],
      ['Type', KIND_LABELS[claim.kind] || claim.kind],
      [
        'Term',
        claim.periodMonths === 12
          ? '1 year'
          : claim.periodMonths === 1
            ? '1 month'
            : claim.periodMonths
              ? `${claim.periodMonths} months`
              : null,
      ],
      ['Amount', money(claim.amount, claim.currency)],
      [
        'Paid to',
        destination
          ? `${destination.label} ${destination.account} (${destination.accountName})`
          : claim.channel,
      ],
      ['Transaction number', claim.payerReference],
      ['Paid from', claim.payerName || null],
    ];
  }

  private async emailOf(userId: number | null | undefined) {
    if (!userId) return null;
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    return user?.email?.trim() || null;
  }

  private async deliver(
    to: string | string[] | null,
    body: MailBody,
  ): Promise<void> {
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
    if (!recipients.length) return;
    const mail = renderBillingEmail(body);
    for (const recipient of recipients) {
      await this.emailService.send({ to: recipient, ...mail });
    }
  }

  private async safely(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err: any) {
      this.logger.warn(`Billing email (${what}) failed: ${err?.message}`);
    }
  }

  /** A payment was submitted: tell the admins to verify it, and the customer that we have it. */
  async paymentSubmitted(claim: SubscriptionPaymentClaim): Promise<void> {
    await this.safely('submitted/admin', async () => {
      await this.deliver(this.adminRecipients(), {
        subject: `Payment to verify — ${money(claim.amount, claim.currency)} — ${claim.subjectName || KIND_LABELS[claim.kind] || claim.kind}`,
        heading: 'A subscription payment is waiting to be verified',
        intro: [
          'A customer has reported a transfer. Check it against the account, then approve or reject it. Nothing is switched on until it is approved.',
        ],
        rows: [
          ...this.claimRows(claim),
          ['Receipt', claim.receiptUrl || 'Not attached'],
          ['Reference', claim.referenceId],
        ],
        action: { label: 'Open Payments', url: this.adminUrl() },
      });
    });
    await this.safely('submitted/customer', async () => {
      await this.deliver(await this.emailOf(claim.userId), {
        subject: `We received your payment details — ${money(claim.amount, claim.currency)}`,
        heading: 'Payment details received',
        intro: [
          'Thank you. We have your payment details and are checking the transfer against our account.',
          'You will get another email as soon as it is verified — usually within a working day. There is nothing more you need to do.',
        ],
        rows: this.claimRows(claim),
      });
    });
  }

  /**
   * The payment was verified. `receiptAlreadySent` is true for a branch term,
   * whose receipt email already says so — one email, not two.
   */
  async paymentApproved(
    claim: SubscriptionPaymentClaim,
    options: { receiptAlreadySent?: boolean } = {},
  ): Promise<void> {
    if (options.receiptAlreadySent) return;
    await this.safely('approved', async () => {
      await this.deliver(await this.emailOf(claim.userId), {
        subject: `Payment verified — ${money(claim.amount, claim.currency)}`,
        heading: 'Your payment has been verified',
        intro: [
          claim.kind === 'POS_BRANCH_CREATE'
            ? 'We found your transfer. Your new branch has been created and is ready to open.'
            : claim.kind === 'SUPPLIER'
              ? 'We found your transfer. Your supplier subscription is active.'
              : 'We found your transfer and it has been applied. Thank you.',
        ],
        rows: this.claimRows(claim),
        action: { label: 'Open Suuq POS', url: this.billingUrl(claim) },
      });
    });
  }

  /** The payment could not be verified: say why, and how to submit it again. */
  async paymentRejected(claim: SubscriptionPaymentClaim): Promise<void> {
    await this.safely('rejected', async () => {
      await this.deliver(await this.emailOf(claim.userId), {
        subject: `We could not verify your payment — ${money(claim.amount, claim.currency)}`,
        heading: 'Your payment could not be verified',
        intro: [
          `Reason: ${claim.reviewNote || 'The transfer could not be found on our account.'}`,
          'Nothing has been charged or changed on your account. Please check the details and submit the payment again from Billing.',
        ],
        rows: this.claimRows(claim),
        action: { label: 'Open Billing', url: this.billingUrl(claim) },
      });
    });
  }

  /** A paid branch term is about to end — the email twin of the in-app reminder. */
  async renewalDue(input: {
    ownerUserId: number;
    branchId?: number | null;
    endsAt: Date;
    daysLeft: number;
  }): Promise<void> {
    await this.safely('renewal-due', async () => {
      const when = input.endsAt.toDateString();
      const branchName = await this.branchNameOf(input.branchId);
      await this.deliver(await this.emailOf(input.ownerUserId), {
        subject: `Suuq POS subscription for ${branchName} ends ${input.daysLeft <= 1 ? 'tomorrow' : `in ${input.daysLeft} days`}`,
        heading: 'Your subscription is ending soon',
        intro: [
          `The Suuq POS subscription for ${branchName} ends on ${when}.`,
          'You can pay for the next term now from Billing. It is added after your current term, so no paid day is lost.',
        ],
        action: { label: 'Open Billing', url: this.billingUrl() },
      });
    });
  }

  /** A paid branch term has ended and the branch is on its grace days. */
  async termEnded(input: {
    ownerUserId: number;
    branchId?: number | null;
    endsAt: Date;
    graceEndsAt: Date;
  }): Promise<void> {
    await this.safely('term-ended', async () => {
      const branchName = await this.branchNameOf(input.branchId);
      await this.deliver(await this.emailOf(input.ownerUserId), {
        subject: `Suuq POS subscription for ${branchName} has ended — tills stay open until ${input.graceEndsAt.toDateString()}`,
        heading: 'Your subscription has ended',
        intro: [
          `The Suuq POS subscription for ${branchName} ended on ${input.endsAt.toDateString()}.`,
          `The tills stay open until ${input.graceEndsAt.toDateString()}. Pay from Billing before then to continue without interruption.`,
        ],
        action: { label: 'Open Billing', url: this.billingUrl() },
      });
    });
  }
}
