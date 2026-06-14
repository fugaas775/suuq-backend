import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { Branch } from '../branches/entities/branch.entity';
import { EmailService } from '../email/email.service';
import {
  PosCheckout,
  PosCheckoutStatus,
  PosCheckoutTransactionType,
} from './entities/pos-checkout.entity';
import { PosRegisterSession } from './entities/pos-register-session.entity';

type PaymentMixRow = { method: string; label: string; amount: number };

export interface SessionReportData {
  currency: string;
  grossSales: number;
  returnsTotal: number;
  netSales: number;
  receiptCount: number;
  returnCount: number;
  itemCount: number;
  averageTicket: number;
  tipsTotal: number;
  paymentMix: PaymentMixRow[];
  cashNet: number;
  openingFloat: number | null;
  closingFloat: number | null;
  expectedCash: number | null;
  variance: number | null;
}

const EAT_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: 'Africa/Addis_Ababa',
  dateStyle: 'medium',
  timeStyle: 'short',
};

/**
 * Builds an end-of-shift sales report for a closed register session and emails
 * it (with a PDF attachment) to the branch owner. Aggregation is done
 * server-side from the session's checkouts so the figures are authoritative and
 * independent of whatever the closing device had loaded.
 */
@Injectable()
export class PosRegisterReportService {
  private readonly logger = new Logger(PosRegisterReportService.name);

  constructor(
    @InjectRepository(PosCheckout)
    private readonly checkoutsRepository: Repository<PosCheckout>,
    @InjectRepository(Branch)
    private readonly branchesRepository: Repository<Branch>,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Fire-and-forget entry point called right after a session is closed.
   * Never throws: any failure (missing owner email, PDF error, mail error) is
   * logged so it cannot break the session-close request.
   */
  async dispatchCloseReport(session: PosRegisterSession): Promise<void> {
    try {
      const branch = await this.branchesRepository.findOne({
        where: { id: session.branchId },
        relations: ['owner'],
      });
      const ownerEmail = branch?.owner?.email?.trim();
      if (!ownerEmail) {
        this.logger.warn(
          `Session ${session.id} closed but branch ${session.branchId} has no owner email; skipping report email.`,
        );
        return;
      }

      const report = await this.buildReport(session);
      const pdf = await this.renderPdf(session, branch, report);

      const sessionLabel = `#${session.branchSessionNumber ?? session.id}`;
      const branchName = branch?.name || `Branch ${session.branchId}`;

      await this.emailService.send({
        to: ownerEmail,
        subject: `Session ${sessionLabel} closed — ${branchName} — Net ${this.money(
          report.netSales,
          report.currency,
        )}`,
        text: this.renderText(session, branchName, report, sessionLabel),
        html: this.renderHtml(session, branchName, report, sessionLabel),
        attachments: [
          {
            filename: `session-${session.branchSessionNumber ?? session.id}-report.pdf`,
            content: pdf.toString('base64'),
            encoding: 'base64',
            contentType: 'application/pdf',
          },
        ],
      });
      this.logger.log(
        `Queued session ${session.id} close report to branch ${session.branchId} owner.`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to dispatch close report for session ${session?.id}: ${err?.message || err}`,
        err?.stack,
      );
    }
  }

  /** Aggregate the session's checkouts into a sales summary. */
  async buildReport(session: PosRegisterSession): Promise<SessionReportData> {
    const checkouts = await this.checkoutsRepository
      .createQueryBuilder('c')
      .where('c.branchId = :branchId', { branchId: session.branchId })
      .andWhere('c.registerSessionId = :sessionId', { sessionId: session.id })
      .andWhere('c.status IN (:...statuses)', {
        statuses: [PosCheckoutStatus.RECEIVED, PosCheckoutStatus.PROCESSED],
      })
      .getMany();

    let grossSales = 0;
    let returnsTotal = 0;
    let receiptCount = 0;
    let returnCount = 0;
    let itemCount = 0;
    let tipsTotal = 0;
    let cashNet = 0;
    let currency = '';
    const mix = new Map<string, number>();

    for (const c of checkouts) {
      const isSale = c.transactionType === PosCheckoutTransactionType.SALE;
      const sign = isSale ? 1 : -1;
      if (!currency && c.currency) currency = c.currency;
      const total = Number(c.total) || 0;
      const tip = Number(c.tipAmount) || 0;
      if (isSale) {
        grossSales += total;
        receiptCount += 1;
        itemCount += Number(c.itemCount) || 0;
        tipsTotal += tip;
      } else {
        returnsTotal += total;
        returnCount += 1;
      }
      for (const tender of c.tenders || []) {
        const method = (tender?.method || 'OTHER').toUpperCase();
        const amount = Number(tender?.amount) || 0;
        mix.set(method, (mix.get(method) || 0) + sign * amount);
        if (method === 'CASH') cashNet += sign * amount;
      }
    }

    const netSales = grossSales - returnsTotal;
    const averageTicket = receiptCount ? grossSales / receiptCount : 0;
    const openingFloat = session.openingFloat ?? null;
    const closingFloat = session.closingFloat ?? null;
    const expectedCash = openingFloat != null ? openingFloat + cashNet : null;
    const variance =
      closingFloat != null && expectedCash != null
        ? closingFloat - expectedCash
        : null;

    const paymentMix: PaymentMixRow[] = Array.from(mix.entries())
      .map(([method, amount]) => ({
        method,
        label: this.methodLabel(method),
        amount,
      }))
      .filter((row) => Math.abs(row.amount) > 0.005)
      .sort((a, b) => b.amount - a.amount);

    return {
      currency: currency || 'ETB',
      grossSales,
      returnsTotal,
      netSales,
      receiptCount,
      returnCount,
      itemCount,
      averageTicket,
      tipsTotal,
      paymentMix,
      cashNet,
      openingFloat,
      closingFloat,
      expectedCash,
      variance,
    };
  }

  // --- formatting helpers -------------------------------------------------

  private money(value: number | null | undefined, currency: string): string {
    if (value == null) return `— ${currency}`;
    return `${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency}`;
  }

  private when(value: Date | string | null | undefined): string {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('en-GB', EAT_OPTS);
    } catch {
      return '—';
    }
  }

  private methodLabel(method: string): string {
    const known: Record<string, string> = {
      CASH: 'Cash',
      CARD: 'Card',
      MOBILE_MONEY: 'Mobile money',
      TELEBIRR: 'Telebirr',
      MPESA: 'M-Pesa',
      EBIRR: 'E-Birr',
      BANK_TRANSFER: 'Bank transfer',
      CREDIT: 'Store credit',
      OTHER: 'Other',
    };
    if (known[method]) return known[method];
    return method
      .toLowerCase()
      .split(/[_\s]+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  }

  private operatorLine(session: PosRegisterSession): string {
    const closer = session.closedByName || '—';
    const opener = session.openedByName;
    if (opener && opener !== closer) {
      return `${closer} (closed) · ${opener} (opened)`;
    }
    return closer;
  }

  // --- text body ----------------------------------------------------------

  private renderText(
    session: PosRegisterSession,
    branchName: string,
    r: SessionReportData,
    sessionLabel: string,
  ): string {
    const lines = [
      `Register session ${sessionLabel} closed — ${branchName}`,
      '',
      `Register   : ${session.registerId}`,
      `Operator   : ${this.operatorLine(session)}`,
      `Opened     : ${this.when(session.openedAt)}`,
      `Closed     : ${this.when(session.closedAt)}`,
      '',
      `Gross sales   : ${this.money(r.grossSales, r.currency)}`,
      `Returns       : ${this.money(-r.returnsTotal, r.currency)}`,
      `Net sales     : ${this.money(r.netSales, r.currency)}`,
      `Receipts      : ${r.receiptCount}${
        r.returnCount ? ` (+${r.returnCount} returns)` : ''
      }`,
      `Items sold    : ${r.itemCount}`,
      `Avg ticket    : ${this.money(r.averageTicket, r.currency)}`,
      r.tipsTotal
        ? `Tips          : ${this.money(r.tipsTotal, r.currency)}`
        : '',
      '',
      'Payment mix',
      ...(r.paymentMix.length
        ? r.paymentMix.map(
            (m) =>
              `  ${m.label.padEnd(14)} ${this.money(m.amount, r.currency)}`,
          )
        : ['  (none)']),
      '',
      'Cash drawer',
      `  Opening float : ${this.money(r.openingFloat, r.currency)}`,
      `  Closing float : ${this.money(r.closingFloat, r.currency)}`,
      `  Expected cash : ${this.money(r.expectedCash, r.currency)}`,
      r.variance != null
        ? `  Variance      : ${r.variance >= 0 ? '+' : ''}${this.money(
            r.variance,
            r.currency,
          )}`
        : '',
      session.note ? `\nNote: ${session.note}` : '',
      '',
      'A printable PDF of this report is attached.',
    ];
    return lines.filter((l) => l !== '').join('\n');
  }

  // --- html body ----------------------------------------------------------

  private renderHtml(
    session: PosRegisterSession,
    branchName: string,
    r: SessionReportData,
    sessionLabel: string,
  ): string {
    const row = (label: string, value: string, strong = false) =>
      `<tr><td style="padding:6px 0;color:#555">${label}</td><td style="padding:6px 0;text-align:right;${
        strong ? 'font-weight:bold' : ''
      }">${value}</td></tr>`;

    const varianceColor =
      r.variance == null ? '#555' : r.variance < 0 ? '#c0392b' : '#27ae60';
    const varianceStr =
      r.variance == null
        ? '—'
        : `${r.variance >= 0 ? '+' : ''}${this.money(r.variance, r.currency)}`;

    const paymentRows = r.paymentMix.length
      ? r.paymentMix
          .map((m) => row(m.label, this.money(m.amount, r.currency)))
          .join('')
      : row('No payments recorded', '');

    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
        <h2 style="margin:0 0 4px">Session ${sessionLabel} closed</h2>
        <div style="color:#666;margin:0 0 20px">${branchName} · Register ${session.registerId}</div>

        <table style="width:100%;font-size:0.92em;border-collapse:collapse;margin-bottom:8px">
          ${row('Operator', this.operatorLine(session))}
          ${row('Opened', this.when(session.openedAt))}
          ${row('Closed', this.when(session.closedAt))}
        </table>

        <h3 style="margin:18px 0 4px;font-size:1em;border-bottom:2px solid #eee;padding-bottom:4px">Sales</h3>
        <table style="width:100%;font-size:0.92em;border-collapse:collapse">
          ${row('Gross sales', this.money(r.grossSales, r.currency))}
          ${row('Returns', this.money(-r.returnsTotal, r.currency))}
          ${row('Net sales', this.money(r.netSales, r.currency), true)}
          ${row('Receipts', `${r.receiptCount}${r.returnCount ? ` (+${r.returnCount} returns)` : ''}`)}
          ${row('Items sold', String(r.itemCount))}
          ${row('Average ticket', this.money(r.averageTicket, r.currency))}
          ${r.tipsTotal ? row('Tips', this.money(r.tipsTotal, r.currency)) : ''}
        </table>

        <h3 style="margin:18px 0 4px;font-size:1em;border-bottom:2px solid #eee;padding-bottom:4px">Payment mix</h3>
        <table style="width:100%;font-size:0.92em;border-collapse:collapse">
          ${paymentRows}
        </table>

        <h3 style="margin:18px 0 4px;font-size:1em;border-bottom:2px solid #eee;padding-bottom:4px">Cash drawer</h3>
        <table style="width:100%;font-size:0.92em;border-collapse:collapse">
          ${row('Opening float', this.money(r.openingFloat, r.currency))}
          ${row('Closing float', this.money(r.closingFloat, r.currency))}
          ${row('Expected cash', this.money(r.expectedCash, r.currency))}
          <tr><td style="padding:6px 0;color:#555">Variance</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:${varianceColor}">${varianceStr}</td></tr>
        </table>

        ${
          session.note
            ? `<p style="margin:18px 0 0;font-size:0.9em"><strong>Note:</strong> ${session.note}</p>`
            : ''
        }
        <p style="margin:18px 0 0;font-size:0.85em;color:#888">A printable PDF of this report is attached.</p>
        <hr style="margin:18px 0;border:none;border-top:1px solid #eee"/>
        <p style="font-size:0.8em;color:#aaa;text-align:center">Powered by Suuq S</p>
      </div>
    `;
  }

  // --- pdf -----------------------------------------------------------------

  private renderPdf(
    session: PosRegisterSession,
    branch: Branch | null,
    r: SessionReportData,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const branchName = branch?.name || `Branch ${session.branchId}`;
        const sessionLabel = `#${session.branchSessionNumber ?? session.id}`;

        doc.fontSize(18).text(`Register Session Report`, { align: 'left' });
        doc
          .fontSize(11)
          .fillColor('#666')
          .text(
            `${branchName} · Register ${session.registerId} · Session ${sessionLabel}`,
          );
        doc.fillColor('#000').moveDown(1);

        const kv = (label: string, value: string) => {
          const y = doc.y;
          doc.fontSize(10).fillColor('#555').text(label, 50, y, { width: 200 });
          doc
            .fillColor('#000')
            .text(value, 250, y, { width: 295, align: 'right' });
          doc.moveDown(0.4);
        };

        const heading = (title: string) => {
          doc.moveDown(0.6);
          doc.fontSize(12).fillColor('#000').text(title);
          const y = doc.y + 2;
          doc.moveTo(50, y).lineTo(545, y).strokeColor('#dddddd').stroke();
          doc.moveDown(0.5);
        };

        heading('Session');
        kv('Operator', this.operatorLine(session));
        kv('Opened', this.when(session.openedAt));
        kv('Closed', this.when(session.closedAt));

        heading('Sales');
        kv('Gross sales', this.money(r.grossSales, r.currency));
        kv('Returns', this.money(-r.returnsTotal, r.currency));
        kv('Net sales', this.money(r.netSales, r.currency));
        kv(
          'Receipts',
          `${r.receiptCount}${r.returnCount ? ` (+${r.returnCount} returns)` : ''}`,
        );
        kv('Items sold', String(r.itemCount));
        kv('Average ticket', this.money(r.averageTicket, r.currency));
        if (r.tipsTotal) kv('Tips', this.money(r.tipsTotal, r.currency));

        heading('Payment mix');
        if (r.paymentMix.length) {
          for (const m of r.paymentMix) {
            kv(m.label, this.money(m.amount, r.currency));
          }
        } else {
          kv('No payments recorded', '');
        }

        heading('Cash drawer');
        kv('Opening float', this.money(r.openingFloat, r.currency));
        kv('Closing float', this.money(r.closingFloat, r.currency));
        kv('Expected cash', this.money(r.expectedCash, r.currency));
        kv(
          'Variance',
          r.variance == null
            ? '—'
            : `${r.variance >= 0 ? '+' : ''}${this.money(r.variance, r.currency)}`,
        );

        if (session.note) {
          heading('Note');
          doc.fontSize(10).fillColor('#333').text(session.note, { width: 495 });
        }

        doc.moveDown(2);
        doc
          .fontSize(8)
          .fillColor('#aaaaaa')
          .text('Powered by Suuq S', { align: 'center' });

        doc.end();
      } catch (e) {
        reject(e as Error);
      }
    });
  }
}
