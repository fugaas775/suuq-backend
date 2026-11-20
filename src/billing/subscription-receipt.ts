/**
 * The receipt for a branch subscription payment — one renderer for the page the
 * owner opens from Billing and for the copy emailed when the payment confirms.
 *
 * A receipt is evidence that money was received, so it is only ever titled one
 * when the payment is PAID. Anything else prints as a payment record that says
 * plainly it is not a receipt — an owner must not be able to hand an accountant
 * a "receipt" for a charge that failed.
 *
 * The seller block and tax lines are read from the environment and printed only
 * when set — a tax number or a VAT amount is never invented here:
 *   BILLING_SELLER_NAME / BILLING_SELLER_TIN / BILLING_SELLER_ADDRESS
 *   BILLING_VAT_RATE      percent, e.g. 15. The price charged is treated as
 *                         VAT-INCLUSIVE and broken into net + VAT. Unset or 0
 *                         prints no tax lines at all.
 *   BILLING_SELLER_VAT_NOTE  free text printed under the table.
 */
export interface SubscriptionReceiptPayment {
  id: number;
  referenceId: string;
  state: 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED';
  amount: number;
  currency: string;
  periodMonths: number | null;
  termStartsAt: Date | null;
  termEndsAt: Date | null;
  receiptNumber: string | null;
  payerAccount: string | null;
  transactionId: string | null;
  issuerTransactionId: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

export function resolveBillingVatRate(): number {
  const rate = Number(process.env.BILLING_VAT_RATE);
  return Number.isFinite(rate) && rate > 0 && rate < 100 ? rate : 0;
}

/** Net and VAT inside a VAT-inclusive total, to the cent. */
export function splitVatInclusive(total: number, ratePercent: number) {
  const net = Math.round((total / (1 + ratePercent / 100)) * 100) / 100;
  return { net, vat: Math.round((total - net) * 100) / 100 };
}

export function renderSubscriptionReceiptHtml(
  branch: { id: number; name: string },
  payment: SubscriptionReceiptPayment,
): string {
  const escape = (v: unknown) =>
    String(v ?? '').replace(
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
  const env = (key: string) => String(process.env[key] || '').trim();
  const sellerName = env('BILLING_SELLER_NAME') || 'Suuq S';
  const sellerTin = env('BILLING_SELLER_TIN');
  const sellerAddress = env('BILLING_SELLER_ADDRESS');
  const vatNote = env('BILLING_SELLER_VAT_NOTE');
  const paid = payment.state === 'PAID';
  const currency = payment.currency || 'ETB';
  const amount = Number(payment.amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const when = (value: Date | string | null | undefined, withTime = true) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Addis_Ababa',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(date);
  };
  const planLabel =
    payment.periodMonths === 12
      ? 'POS branch subscription — 1 year'
      : payment.periodMonths === 1
        ? 'POS branch subscription — 1 month'
        : payment.periodMonths
          ? `POS branch subscription — ${payment.periodMonths} months`
          : 'POS branch subscription';
  const covered =
    paid && payment.termStartsAt
      ? `${when(payment.termStartsAt, false)} – ${when(payment.termEndsAt, false) || 'open'}`
      : '';
  const stateLabel: Record<string, string> = {
    PAID: 'Paid',
    PENDING: 'Awaiting confirmation',
    FAILED: 'Not completed',
    EXPIRED: 'Expired — not charged',
  };
  const row = (label: string, value: unknown) =>
    value
      ? `<tr><td class="k">${escape(label)}</td><td>${escape(value)}</td></tr>`
      : '';
  const vatRate = paid ? resolveBillingVatRate() : 0;
  const money = (value: number) =>
    `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const vatSplit = vatRate
    ? splitVatInclusive(Number(payment.amount), vatRate)
    : null;
  const vatRows = vatSplit
    ? `${row('Amount excl. VAT', money(vatSplit.net))}${row(`VAT ${vatRate}%`, money(vatSplit.vat))}${row('Total incl. VAT', money(Number(payment.amount)))}`
    : '';
  const title = paid
    ? vatRate
      ? 'Tax receipt'
      : 'Payment receipt'
    : 'Payment record';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escape(title)} ${escape(payment.receiptNumber || payment.referenceId)}</title>
<style>
body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:32px auto;padding:0 20px;color:#111;line-height:1.45;}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:16px;}
h1{font-size:18px;margin:0;}
.seller{font-size:13px;color:#444;}
.no{font-size:13px;color:#444;text-align:right;}
table{width:100%;border-collapse:collapse;}
td{padding:6px 0;vertical-align:top;border-bottom:1px solid #f0f0f0;}
td.k{color:#666;width:180px;}
.amount{font-size:26px;font-weight:600;margin:16px 0 4px;}
.status{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;margin-bottom:12px;}
.status.PAID{background:#dcfce7;color:#15803d;}
.status.PENDING{background:#fef3c7;color:#92400e;}
.status.FAILED,.status.EXPIRED{background:#fee2e2;color:#991b1b;}
.notice{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;font-size:13px;margin:12px 0;}
.foot{font-size:12px;color:#666;margin-top:20px;}
.print{margin-top:24px;}
@media print{.print{display:none;}body{margin:0 auto;}}
</style></head><body>
<header>
<div><h1>${escape(title)}</h1>
<div class="seller">${escape(sellerName)}${sellerAddress ? `<br/>${escape(sellerAddress)}` : ''}${sellerTin ? `<br/>TIN ${escape(sellerTin)}` : ''}</div></div>
<div class="no">${payment.receiptNumber ? `No. ${escape(payment.receiptNumber)}<br/>` : ''}${escape(when(payment.paidAt || payment.createdAt))}</div>
</header>
<div class="amount">${escape(currency)} ${escape(amount)}</div>
<div><span class="status ${escape(payment.state)}">${escape(stateLabel[payment.state] || payment.state)}</span></div>
${paid ? '' : '<div class="notice">This is not a receipt. No payment was confirmed for this request.</div>'}
<table>
${row('Billed to', `${branch.name} (branch #${branch.id})`)}
${row('For', planLabel)}
${row('Period covered', covered)}
${vatRows}
${row('Payment method', 'Ebirr mobile money')}
${row('Payer account', payment.payerAccount)}
${row(paid ? 'Paid on' : 'Requested on', when(paid ? payment.paidAt : payment.createdAt))}
${row('Payment reference', payment.referenceId)}
${row('Ebirr transaction', payment.transactionId)}
${row('Issuer transaction', payment.issuerTransactionId)}
</table>
${vatNote ? `<div class="foot">${escape(vatNote)}</div>` : ''}
<div class="foot">Times are East Africa Time (UTC+3). Keep this page for your records.</div>
<div class="print"><button onclick="window.print()">Print</button></div>
</body></html>`;
}
