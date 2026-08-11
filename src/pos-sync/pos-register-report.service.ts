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

// Normalized model that both the client "Today"-tab report and the server-side
// fallback aggregation map onto, so a single HTML/PDF renderer covers every POS
// format — sections render only when they carry data.
interface RenderModel {
  currency: string;
  serviceFormat: string | null;
  summary: {
    grossSales: number;
    returnsTotal: number;
    netSales: number;
    receiptCount: number;
    averageTicket: number;
    readyTicketCount: number;
  };
  paymentMix: Array<{ label: string; amount: number }>;
  waiters: Array<{
    name: string;
    salesTotal: number;
    itemCount: number;
    receiptCount: number;
    tableCount: number;
  }>;
  cooks: Array<{
    name: string;
    ticketCount: number;
    itemCount: number;
    stations: Array<{ label: string; ticketCount: number }>;
  }>;
  settledRooms: Array<{
    room: string;
    settled: number;
    receiptCount: number;
    guestName: string;
    settledBy: string;
  }>;
  settlers: Array<{
    name: string;
    settled: number;
    receiptCount: number;
    roomCount: number;
  }>;
  settledReceipts: Array<{
    label: string;
    total: number;
    operatorName: string;
    paymentMethods: string[];
    itemCount: number;
  }>;
  counts: Record<string, number>;
  cash: {
    openingFloat: number | null;
    closingFloat: number | null;
    expectedCash: number | null;
    variance: number | null;
  };
}

const EAT_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: 'Africa/Addis_Ababa',
  dateStyle: 'medium',
  timeStyle: 'short',
};

const n = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const s = (value: unknown): string =>
  value == null ? '' : String(value).trim();

/**
 * Builds an end-of-shift report for a closed register session and emails it
 * (with a PDF attachment) to the branch owner. The report mirrors the in-app
 * "Today" tab: when the closing client sends its computed session report we
 * render that exactly; otherwise we fall back to a server-side aggregation of
 * the session's checkouts.
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
  async dispatchCloseReport(
    session: PosRegisterSession,
    opts: { report?: Record<string, any>; serviceFormat?: string | null } = {},
  ): Promise<void> {
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

      const model = opts.report
        ? await this.modelFromClientReport(
            session,
            opts.report,
            opts.serviceFormat ?? null,
          )
        : this.modelFromServerAggregation(
            session,
            await this.buildReport(session),
            opts.serviceFormat ?? null,
          );

      const pdf = await this.renderPdf(session, branch, model);

      const sessionLabel = `#${session.branchSessionNumber ?? session.id}`;
      const branchName = branch?.name || `Branch ${session.branchId}`;

      await this.emailService.send({
        to: ownerEmail,
        subject: `Session ${sessionLabel} closed — ${branchName} — Net ${this.money(
          model.summary.netSales,
          model.currency,
        )}`,
        text: this.renderText(session, branchName, model, sessionLabel),
        html: this.renderHtml(session, branchName, model, sessionLabel),
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
        `Queued session ${session.id} close report (${
          opts.report ? 'client' : 'server'
        }) to branch ${session.branchId} owner.`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to dispatch close report for session ${session?.id}: ${err?.message || err}`,
        err?.stack,
      );
    }
  }

  // --- model builders -----------------------------------------------------

  /** Map the client-sent "Today"-tab session report onto the render model. */
  private async modelFromClientReport(
    session: PosRegisterSession,
    report: Record<string, any>,
    serviceFormat: string | null,
  ): Promise<RenderModel> {
    const summary = report.summary || {};
    const paymentMix = (
      Array.isArray(report.paymentMix) ? report.paymentMix : []
    ).map((row: any) => ({
      label: s(row?.label || row?.method) || 'Other',
      amount: n(row?.amount),
      isCash: s(row?.method).toUpperCase() === 'CASH',
    }));

    const cashIn = paymentMix
      .filter((row) => row.isCash)
      .reduce((sum, row) => sum + row.amount, 0);

    const openingFloat = session.openingFloat ?? null;
    const closingFloat = session.closingFloat ?? null;
    const expectedCash = openingFloat != null ? openingFloat + cashIn : null;
    const variance =
      closingFloat != null && expectedCash != null
        ? closingFloat - expectedCash
        : null;

    return {
      currency: await this.resolveCurrency(session),
      serviceFormat: serviceFormat || null,
      summary: {
        grossSales: n(summary.grossSales),
        returnsTotal: n(summary.returnsTotal),
        netSales: n(summary.netSales),
        receiptCount: n(summary.receiptCount),
        averageTicket: n(summary.averageTicket),
        readyTicketCount: n(summary.readyTicketCount),
      },
      paymentMix: paymentMix.map(({ label, amount }) => ({ label, amount })),
      waiters: (Array.isArray(report.waiters) ? report.waiters : []).map(
        (row: any) => ({
          name: s(row?.name) || 'Unassigned',
          salesTotal: n(row?.salesTotal),
          itemCount: n(row?.itemCount),
          receiptCount: n(row?.receiptCount),
          tableCount: n(row?.tableCount),
        }),
      ),
      cooks: (Array.isArray(report.cooks) ? report.cooks : []).map(
        (row: any) => ({
          name: s(row?.name) || 'Unknown cook',
          ticketCount: n(row?.ticketCount),
          itemCount: n(row?.itemCount),
          stations: (Array.isArray(row?.stations) ? row.stations : []).map(
            (st: any) => ({
              label: s(st?.label || st?.code) || 'Station',
              ticketCount: n(st?.ticketCount),
            }),
          ),
        }),
      ),
      settledRooms: (Array.isArray(report.settledRooms)
        ? report.settledRooms
        : []
      ).map((row: any) => ({
        room: s(row?.room),
        settled: n(row?.settled),
        receiptCount: n(row?.receiptCount),
        guestName: s(row?.guestName),
        settledBy: s(row?.settledBy),
      })),
      settlers: (Array.isArray(report.settlers) ? report.settlers : []).map(
        (row: any) => ({
          name: s(row?.name) || 'Unassigned',
          settled: n(row?.settled),
          receiptCount: n(row?.receiptCount),
          roomCount: n(row?.roomCount),
        }),
      ),
      settledReceipts: (Array.isArray(report.settledReceipts)
        ? report.settledReceipts
        : []
      ).map((row: any) => ({
        label: s(row?.label),
        total: n(row?.total),
        operatorName: s(row?.operatorName) || 'Unassigned',
        paymentMethods: (Array.isArray(row?.paymentMethods)
          ? row.paymentMethods
          : []
        ).map((m: any) => s(m)),
        itemCount: n(row?.itemCount),
      })),
      counts:
        report.counts && typeof report.counts === 'object' ? report.counts : {},
      cash: { openingFloat, closingFloat, expectedCash, variance },
    };
  }

  /** Map the server-side aggregation onto the render model (fallback path). */
  private modelFromServerAggregation(
    session: PosRegisterSession,
    r: SessionReportData,
    serviceFormat: string | null,
  ): RenderModel {
    return {
      currency: r.currency,
      serviceFormat: serviceFormat || null,
      summary: {
        grossSales: r.grossSales,
        returnsTotal: r.returnsTotal,
        netSales: r.netSales,
        receiptCount: r.receiptCount,
        averageTicket: r.averageTicket,
        readyTicketCount: 0,
      },
      paymentMix: r.paymentMix.map((row) => ({
        label: row.label,
        amount: row.amount,
      })),
      waiters: [],
      cooks: [],
      settledRooms: [],
      settlers: [],
      settledReceipts: [],
      counts: {},
      cash: {
        openingFloat: r.openingFloat,
        closingFloat: r.closingFloat,
        expectedCash: r.expectedCash,
        variance: r.variance,
      },
    };
  }

  private async resolveCurrency(session: PosRegisterSession): Promise<string> {
    const row = await this.checkoutsRepository.findOne({
      where: { branchId: session.branchId, registerSessionId: session.id },
      select: ['currency'],
      order: { id: 'DESC' },
    });
    return row?.currency || 'ETB';
  }

  /** Aggregate the session's checkouts into a sales summary (fallback source). */
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

  /** Section heading for the per-server breakdown, by POS format. */
  private serverSectionTitle(format: string | null): string {
    switch ((format || '').toUpperCase()) {
      case 'BARBER':
        return 'By stylist';
      case 'RETAIL':
        return 'By cashier';
      default:
        return 'By waiter';
    }
  }

  /** Section heading for the settled-unit breakdown, by POS format. */
  private unitSectionTitle(format: string | null): string {
    switch ((format || '').toUpperCase()) {
      case 'HOTEL':
        return 'Settled rooms';
      case 'CAFETERIA':
        return 'Settled tables';
      case 'BARBER':
        return 'Settled chairs';
      case 'PROPERTY_RENTAL':
        return 'Settled units';
      case 'SCHOOL':
        // The settled unit is a student's fee folio, not the class it sits in.
        return 'Settled student fees';
      default:
        return 'Settled units';
    }
  }

  private moreNote(shown: number, total: number | undefined): string {
    return total && total > shown ? ` (+${total - shown} more)` : '';
  }

  // --- text body ----------------------------------------------------------

  private renderText(
    session: PosRegisterSession,
    branchName: string,
    m: RenderModel,
    sessionLabel: string,
  ): string {
    const cur = m.currency;
    const lines: string[] = [
      `Register session ${sessionLabel} closed — ${branchName}`,
      m.serviceFormat ? `Format     : ${m.serviceFormat}` : '',
      `Register   : ${session.registerId}`,
      `Operator   : ${this.operatorLine(session)}`,
      `Opened     : ${this.when(session.openedAt)}`,
      `Closed     : ${this.when(session.closedAt)}`,
      '',
      `Gross sales   : ${this.money(m.summary.grossSales, cur)}`,
      `Returns       : ${this.money(-m.summary.returnsTotal, cur)}`,
      `Net sales     : ${this.money(m.summary.netSales, cur)}`,
      `Receipts      : ${m.summary.receiptCount}`,
      `Avg ticket    : ${this.money(m.summary.averageTicket, cur)}`,
      m.summary.readyTicketCount
        ? `Ready tickets : ${m.summary.readyTicketCount}`
        : '',
      '',
      'Payment mix',
      ...(m.paymentMix.length
        ? m.paymentMix.map(
            (p) => `  ${p.label.padEnd(16)} ${this.money(p.amount, cur)}`,
          )
        : ['  (none)']),
    ];

    if (m.waiters.length) {
      lines.push('', this.serverSectionTitle(m.serviceFormat));
      for (const w of m.waiters) {
        lines.push(
          `  ${w.name.padEnd(16)} ${this.money(w.salesTotal, cur)}  (${w.itemCount} items, ${w.receiptCount} receipts)`,
        );
      }
    }
    if (m.cooks.length) {
      lines.push('', 'Kitchen (cooks)');
      for (const c of m.cooks) {
        lines.push(
          `  ${c.name.padEnd(16)} ${c.ticketCount} tickets, ${c.itemCount} items`,
        );
      }
    }
    if (m.settledRooms.length) {
      lines.push('', this.unitSectionTitle(m.serviceFormat));
      for (const r of m.settledRooms) {
        lines.push(
          `  ${String(r.room).padEnd(10)} ${this.money(r.settled, cur)}${r.guestName ? `  ${r.guestName}` : ''}`,
        );
      }
    }
    if (m.settlers.length) {
      lines.push('', 'Settlers');
      for (const st of m.settlers) {
        lines.push(
          `  ${st.name.padEnd(16)} ${this.money(st.settled, cur)}  (${st.roomCount} units)`,
        );
      }
    }

    lines.push(
      '',
      'Cash drawer',
      `  Opening float : ${this.money(m.cash.openingFloat, cur)}`,
      `  Closing float : ${this.money(m.cash.closingFloat, cur)}`,
      `  Expected cash : ${this.money(m.cash.expectedCash, cur)}`,
      m.cash.variance != null
        ? `  Variance      : ${m.cash.variance >= 0 ? '+' : ''}${this.money(m.cash.variance, cur)}`
        : '',
      session.note ? `\nNote: ${session.note}` : '',
      '',
      'A printable PDF of this report is attached.',
    );
    return lines.filter((l) => l !== '').join('\n');
  }

  // --- html body ----------------------------------------------------------

  private renderHtml(
    session: PosRegisterSession,
    branchName: string,
    m: RenderModel,
    sessionLabel: string,
  ): string {
    const cur = m.currency;
    const kv = (label: string, value: string, strong = false) =>
      `<tr><td style="padding:6px 0;color:#555">${label}</td><td style="padding:6px 0;text-align:right;${
        strong ? 'font-weight:bold' : ''
      }">${value}</td></tr>`;
    const heading = (title: string) =>
      `<h3 style="margin:18px 0 4px;font-size:1em;border-bottom:2px solid #eee;padding-bottom:4px">${title}</h3>`;
    const esc = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const sections: string[] = [];

    sections.push(
      `<table style="width:100%;font-size:0.92em;border-collapse:collapse;margin-bottom:8px">
        ${m.serviceFormat ? kv('Format', esc(m.serviceFormat)) : ''}
        ${kv('Operator', esc(this.operatorLine(session)))}
        ${kv('Opened', this.when(session.openedAt))}
        ${kv('Closed', this.when(session.closedAt))}
      </table>`,
    );

    sections.push(
      heading('Sales') +
        `<table style="width:100%;font-size:0.92em;border-collapse:collapse">
          ${kv('Gross sales', this.money(m.summary.grossSales, cur))}
          ${kv('Returns', this.money(-m.summary.returnsTotal, cur))}
          ${kv('Net sales', this.money(m.summary.netSales, cur), true)}
          ${kv('Receipts', String(m.summary.receiptCount))}
          ${kv('Average ticket', this.money(m.summary.averageTicket, cur))}
          ${m.summary.readyTicketCount ? kv('Ready tickets (KDS)', String(m.summary.readyTicketCount)) : ''}
        </table>`,
    );

    sections.push(
      heading('Payment mix') +
        `<table style="width:100%;font-size:0.92em;border-collapse:collapse">
          ${
            m.paymentMix.length
              ? m.paymentMix
                  .map((p) => kv(esc(p.label), this.money(p.amount, cur)))
                  .join('')
              : kv('No payments recorded', '')
          }
        </table>`,
    );

    if (m.waiters.length) {
      sections.push(
        heading(
          this.serverSectionTitle(m.serviceFormat) +
            this.moreNote(m.waiters.length, m.counts.waiters),
        ) +
          `<table style="width:100%;font-size:0.9em;border-collapse:collapse">
            <tr style="color:#999;font-size:0.85em"><td>Name</td><td style="text-align:right">Sales</td><td style="text-align:right">Items</td><td style="text-align:right">Receipts</td></tr>
            ${m.waiters
              .map(
                (w) =>
                  `<tr><td style="padding:4px 0">${esc(w.name)}</td><td style="padding:4px 0;text-align:right">${this.money(w.salesTotal, cur)}</td><td style="padding:4px 0;text-align:right">${w.itemCount}</td><td style="padding:4px 0;text-align:right">${w.receiptCount}</td></tr>`,
              )
              .join('')}
          </table>`,
      );
    }

    if (m.cooks.length) {
      sections.push(
        heading(
          'Kitchen — cooks' + this.moreNote(m.cooks.length, m.counts.cooks),
        ) +
          `<table style="width:100%;font-size:0.9em;border-collapse:collapse">
            <tr style="color:#999;font-size:0.85em"><td>Cook</td><td style="text-align:right">Tickets</td><td style="text-align:right">Items</td></tr>
            ${m.cooks
              .map((c) => {
                const stations = c.stations.length
                  ? `<div style="color:#888;font-size:0.85em">${c.stations
                      .map((st) => `${esc(st.label)} (${st.ticketCount})`)
                      .join(' · ')}</div>`
                  : '';
                return `<tr><td style="padding:4px 0">${esc(c.name)}${stations}</td><td style="padding:4px 0;text-align:right;vertical-align:top">${c.ticketCount}</td><td style="padding:4px 0;text-align:right;vertical-align:top">${c.itemCount}</td></tr>`;
              })
              .join('')}
          </table>`,
      );
    }

    if (m.settledRooms.length) {
      sections.push(
        heading(
          this.unitSectionTitle(m.serviceFormat) +
            this.moreNote(m.settledRooms.length, m.counts.settledRooms),
        ) +
          `<table style="width:100%;font-size:0.9em;border-collapse:collapse">
            ${m.settledRooms
              .map(
                (r) =>
                  `<tr><td style="padding:4px 0">${esc(r.room)}${r.guestName ? ` · ${esc(r.guestName)}` : ''}</td><td style="padding:4px 0;text-align:right">${this.money(r.settled, cur)}</td></tr>`,
              )
              .join('')}
          </table>`,
      );
    }

    if (m.settlers.length) {
      sections.push(
        heading(
          'Settlers' + this.moreNote(m.settlers.length, m.counts.settlers),
        ) +
          `<table style="width:100%;font-size:0.9em;border-collapse:collapse">
            ${m.settlers
              .map(
                (st) =>
                  `<tr><td style="padding:4px 0">${esc(st.name)}</td><td style="padding:4px 0;text-align:right">${this.money(st.settled, cur)} · ${st.roomCount} units</td></tr>`,
              )
              .join('')}
          </table>`,
      );
    }

    if (m.settledReceipts.length) {
      sections.push(
        heading(
          'Settled receipts' +
            this.moreNote(m.settledReceipts.length, m.counts.settledReceipts),
        ) +
          `<table style="width:100%;font-size:0.88em;border-collapse:collapse">
            ${m.settledReceipts
              .map(
                (r) =>
                  `<tr><td style="padding:3px 0">${esc(r.label)}<span style="color:#999"> · ${esc(r.operatorName)}</span></td><td style="padding:3px 0;text-align:right">${this.money(r.total, cur)}</td></tr>`,
              )
              .join('')}
          </table>`,
      );
    }

    const varianceColor =
      m.cash.variance == null
        ? '#555'
        : m.cash.variance < 0
          ? '#c0392b'
          : '#27ae60';
    const varianceStr =
      m.cash.variance == null
        ? '—'
        : `${m.cash.variance >= 0 ? '+' : ''}${this.money(m.cash.variance, cur)}`;
    sections.push(
      heading('Cash drawer') +
        `<table style="width:100%;font-size:0.92em;border-collapse:collapse">
          ${kv('Opening float', this.money(m.cash.openingFloat, cur))}
          ${kv('Closing float', this.money(m.cash.closingFloat, cur))}
          ${kv('Expected cash', this.money(m.cash.expectedCash, cur))}
          <tr><td style="padding:6px 0;color:#555">Variance</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:${varianceColor}">${varianceStr}</td></tr>
        </table>`,
    );

    return `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:auto;padding:24px;color:#222">
        <h2 style="margin:0 0 4px">Session ${sessionLabel} closed</h2>
        <div style="color:#666;margin:0 0 12px">${esc(branchName)} · Register ${esc(session.registerId)}</div>
        ${sections.join('\n')}
        ${session.note ? `<p style="margin:18px 0 0;font-size:0.9em"><strong>Note:</strong> ${esc(session.note)}</p>` : ''}
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
    m: RenderModel,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const cur = m.currency;
        const branchName = branch?.name || `Branch ${session.branchId}`;
        const sessionLabel = `#${session.branchSessionNumber ?? session.id}`;

        doc.fontSize(18).text('Register Session Report', { align: 'left' });
        doc
          .fontSize(11)
          .fillColor('#666')
          .text(
            `${branchName} · Register ${session.registerId} · Session ${sessionLabel}${
              m.serviceFormat ? ` · ${m.serviceFormat}` : ''
            }`,
          );
        doc.fillColor('#000').moveDown(0.8);

        const kv = (label: string, value: string) => {
          const y = doc.y;
          doc.fontSize(10).fillColor('#555').text(label, 50, y, { width: 240 });
          doc
            .fillColor('#000')
            .text(value, 290, y, { width: 255, align: 'right' });
          doc.moveDown(0.35);
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
        kv('Gross sales', this.money(m.summary.grossSales, cur));
        kv('Returns', this.money(-m.summary.returnsTotal, cur));
        kv('Net sales', this.money(m.summary.netSales, cur));
        kv('Receipts', String(m.summary.receiptCount));
        kv('Average ticket', this.money(m.summary.averageTicket, cur));
        if (m.summary.readyTicketCount)
          kv('Ready tickets (KDS)', String(m.summary.readyTicketCount));

        heading('Payment mix');
        if (m.paymentMix.length) {
          for (const p of m.paymentMix) kv(p.label, this.money(p.amount, cur));
        } else {
          kv('No payments recorded', '');
        }

        if (m.waiters.length) {
          heading(
            this.serverSectionTitle(m.serviceFormat) +
              this.moreNote(m.waiters.length, m.counts.waiters),
          );
          for (const w of m.waiters) {
            kv(
              w.name,
              `${this.money(w.salesTotal, cur)}  ·  ${w.itemCount} items  ·  ${w.receiptCount} rcpts`,
            );
          }
        }

        if (m.cooks.length) {
          heading(
            'Kitchen — cooks' + this.moreNote(m.cooks.length, m.counts.cooks),
          );
          for (const c of m.cooks) {
            const stations = c.stations.length
              ? `  (${c.stations.map((st) => `${st.label} ${st.ticketCount}`).join(', ')})`
              : '';
            kv(
              c.name,
              `${c.ticketCount} tickets · ${c.itemCount} items${stations}`,
            );
          }
        }

        if (m.settledRooms.length) {
          heading(
            this.unitSectionTitle(m.serviceFormat) +
              this.moreNote(m.settledRooms.length, m.counts.settledRooms),
          );
          for (const r of m.settledRooms) {
            kv(
              `${r.room}${r.guestName ? ` · ${r.guestName}` : ''}`,
              this.money(r.settled, cur),
            );
          }
        }

        if (m.settlers.length) {
          heading(
            'Settlers' + this.moreNote(m.settlers.length, m.counts.settlers),
          );
          for (const st of m.settlers) {
            kv(
              st.name,
              `${this.money(st.settled, cur)} · ${st.roomCount} units`,
            );
          }
        }

        if (m.settledReceipts.length) {
          heading(
            'Settled receipts' +
              this.moreNote(m.settledReceipts.length, m.counts.settledReceipts),
          );
          for (const r of m.settledReceipts) {
            kv(`${r.label} · ${r.operatorName}`, this.money(r.total, cur));
          }
        }

        heading('Cash drawer');
        kv('Opening float', this.money(m.cash.openingFloat, cur));
        kv('Closing float', this.money(m.cash.closingFloat, cur));
        kv('Expected cash', this.money(m.cash.expectedCash, cur));
        kv(
          'Variance',
          m.cash.variance == null
            ? '—'
            : `${m.cash.variance >= 0 ? '+' : ''}${this.money(m.cash.variance, cur)}`,
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
