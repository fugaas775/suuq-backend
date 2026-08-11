import {
  PublicReceiptStatus,
  PublicReceiptVerificationResult,
} from './public-receipt-verification.service';

/**
 * The page a customer lands on after scanning the QR on a receipt.
 *
 * Server-rendered, self-contained, and free of JavaScript on purpose. It is
 * opened by someone standing at a counter on whatever phone they have, often on
 * a thin connection, to answer one question — is this piece of paper real? So
 * it must render on the first byte, work with scripting off, and never depend
 * on a CDN. Bilingual English/Somali throughout, since the answer is worthless
 * to a customer who cannot read it.
 *
 * Served through nginx at https://suuq-s.com/v/<code>; the JSON at
 * /api/public/receipts/<code> is the same data for programmatic callers.
 */

type Copy = { en: string; so: string };

const STATUS_COPY: Record<
  PublicReceiptStatus | 'NOT_FOUND',
  { tone: string; mark: string; title: Copy; detail: Copy }
> = {
  VALID: {
    tone: 'ok',
    mark: '✓',
    title: { en: 'Genuine receipt', so: 'Rasiid sax ah' },
    detail: {
      en: 'This sale is recorded on SUUQ exactly as printed below.',
      so: 'Iibkan waxaa lagu diiwaangeliyay SUUQ sida hoos ku qoran.',
    },
  },
  PARTIALLY_REFUNDED: {
    tone: 'warn',
    mark: '↩',
    title: { en: 'Partly refunded', so: 'Qayb ahaan waa la celiyay' },
    detail: {
      en: 'This sale is genuine, but part of it has since been returned.',
      so: 'Iibkan waa sax, laakiin qayb ka mid ah waa la celiyay.',
    },
  },
  REFUNDED: {
    tone: 'warn',
    mark: '↩',
    title: { en: 'Refunded', so: 'Waa la celiyay' },
    detail: {
      en: 'This sale is genuine, but it has since been returned in full.',
      so: 'Iibkan waa sax, laakiin dhammaantiis waa la celiyay.',
    },
  },
  VOIDED: {
    tone: 'bad',
    mark: '⊘',
    title: { en: 'Cancelled', so: 'Waa la joojiyay' },
    detail: {
      en: 'This receipt was cancelled after it was printed. It is not proof of a completed sale.',
      so: 'Rasiidkan waa la joojiyay ka dib markii la daabacay. Ma aha caddayn iib dhammaystiran.',
    },
  },
  PENDING: {
    tone: 'warn',
    mark: '⏳',
    title: { en: 'Not yet final', so: 'Wali lama dhammaystirin' },
    detail: {
      en: 'This sale reached SUUQ but has not finished processing. Ask the shop to confirm it.',
      so: 'Iibkan wuxuu gaadhay SUUQ laakiin wali lama dhammaystirin. Dukaanka weydii inuu xaqiijiyo.',
    },
  },
  // An order slip is not a payment. Every one of these says so, in the title
  // and again in the body, because a slip mistaken for a receipt is exactly the
  // confusion this page exists to end.
  OPEN: {
    tone: 'warn',
    mark: '🧾',
    title: { en: 'Order slip — not paid', so: 'Amar — lama bixin' },
    detail: {
      en: 'This is a real order at the shop, and it has not been paid for. It is not a receipt.',
      so: 'Kani waa amar dhab ah oo dukaanka ku jira, lamana bixin. Rasiid ma aha.',
    },
  },
  SETTLED: {
    tone: 'ok',
    mark: '✓',
    title: { en: 'Order slip — paid', so: 'Amar — waa la bixiyay' },
    detail: {
      en: 'This order was paid for. The receipt for it is the proof of payment, not this slip.',
      so: 'Amarkan waa la bixiyay. Rasiidka ayaa caddayn u ah lacag-bixinta, ee ma aha warqaddan.',
    },
  },
  CANCELLED: {
    tone: 'bad',
    mark: '⊘',
    title: { en: 'Order cancelled', so: 'Amarka waa la joojiyay' },
    detail: {
      en: 'This order was dropped without being paid for.',
      so: 'Amarkan waa la joojiyay iyadoo aan la bixin.',
    },
  },
  NOT_FOUND: {
    tone: 'bad',
    mark: '?',
    title: { en: 'No record found', so: 'Diiwaan lama helin' },
    detail: {
      en: 'SUUQ holds no sale for this code. It may have been issued before receipt verification existed, it may still be waiting to reach us from the shop’s device, or this receipt may not be genuine. Ask the shop.',
      so: 'SUUQ iib kuma hayo koodhkan. Waxaa laga yaabaa in la bixiyay ka hor inta aan xaqiijinta rasiidka jirin, ama uu wali ku sugan yahay qalabka dukaanka, ama uusan rasiidkani sax ahayn. Dukaanka weydii.',
    },
  },
};

const esc = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0));
  return `${currency} ${formatted}`;
}

// Times are shown in East Africa Time and labelled as such — a customer
// comparing the screen to the paper in their hand should never have to wonder
// which clock either one is on.
function formatMoment(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Addis_Ababa',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${formatted} EAT`;
}

function row(label: Copy, value: string): string {
  return `
      <div class="row">
        <div class="label"><span>${esc(label.en)}</span><em>${esc(label.so)}</em></div>
        <div class="value">${esc(value)}</div>
      </div>`;
}

const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: #f4f5f7; color: #111827;
    padding: 20px 16px 40px; line-height: 1.45;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 460px; margin: 0 auto; }
  .brand { text-align: center; font-size: 13px; letter-spacing: .18em;
           text-transform: uppercase; color: #6b7280; margin-bottom: 14px; }
  .card { background: #fff; border-radius: 16px; padding: 22px 18px;
          box-shadow: 0 1px 3px rgba(0,0,0,.10), 0 8px 24px rgba(0,0,0,.06); }
  .status { text-align: center; padding-bottom: 18px; border-bottom: 1px solid #e5e7eb; }
  .mark { display: inline-flex; align-items: center; justify-content: center;
          width: 62px; height: 62px; border-radius: 50%; font-size: 30px;
          font-weight: 700; margin-bottom: 12px; }
  .status h1 { font-size: 21px; font-weight: 700; }
  .status h2 { font-size: 15px; font-weight: 500; color: #6b7280; margin-top: 2px; }
  .status p { font-size: 13.5px; color: #4b5563; margin-top: 10px; }
  .status p.so { color: #6b7280; font-style: italic; margin-top: 4px; }
  .ok .mark { background: #dcfce7; color: #15803d; }
  .ok h1 { color: #15803d; }
  .warn .mark { background: #fef3c7; color: #b45309; }
  .warn h1 { color: #b45309; }
  .bad .mark { background: #fee2e2; color: #b91c1c; }
  .bad h1 { color: #b91c1c; }
  .row { display: flex; justify-content: space-between; align-items: baseline;
         gap: 14px; padding: 11px 0; border-bottom: 1px solid #f3f4f6; }
  .row:last-child { border-bottom: 0; }
  .label { font-size: 13px; color: #6b7280; }
  .label em { display: block; font-size: 11.5px; color: #9ca3af; font-style: normal; }
  .value { font-size: 14.5px; font-weight: 600; text-align: right;
           word-break: break-word; }
  .rows { padding-top: 6px; }
  .total .value { font-size: 20px; }
  .code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing: .06em; }
  .foot { margin-top: 18px; font-size: 11.5px; color: #6b7280; text-align: center; }
  .foot em { display: block; font-style: normal; color: #9ca3af; margin-top: 3px; }
  form { margin-top: 16px; display: flex; gap: 8px; }
  input { flex: 1; min-width: 0; font-size: 16px; padding: 12px 14px;
          border: 1px solid #d1d5db; border-radius: 10px; background: #fff;
          color: inherit; font-family: ui-monospace, Menlo, monospace; }
  button { font-size: 15px; font-weight: 600; padding: 12px 18px; border: 0;
           border-radius: 10px; background: #0f766e; color: #fff; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0f14; color: #e5e7eb; }
    .card { background: #151b23; box-shadow: none; border: 1px solid #232c38; }
    .status { border-bottom-color: #232c38; }
    .row { border-bottom-color: #1c242e; }
    .status h2, .status p, .label, .foot { color: #9ca3af; }
    .status p.so, .label em, .foot em { color: #6b7280; }
    .ok .mark { background: #052e16; color: #4ade80; } .ok h1 { color: #4ade80; }
    .warn .mark { background: #3b2506; color: #fbbf24; } .warn h1 { color: #fbbf24; }
    .bad .mark { background: #3f0d0d; color: #f87171; } .bad h1 { color: #f87171; }
    input { background: #0b0f14; border-color: #2b3543; }
  }
`;

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)} · SUUQ</title>
<style>${STYLES}</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">SUUQ · Receipt check</div>
    <div class="card">${body}</div>
    <p class="foot">
      This page shows what SUUQ’s own records hold for this receipt.
      <em>Boggani wuxuu tusinayaa waxa diiwaanka SUUQ ku hayo rasiidkan.</em>
    </p>
  </div>
</body>
</html>`;
}

function statusBlock(status: PublicReceiptStatus | 'NOT_FOUND'): string {
  const copy = STATUS_COPY[status];
  return `
    <div class="status ${copy.tone}">
      <div class="mark">${copy.mark}</div>
      <h1>${esc(copy.title.en)}</h1>
      <h2>${esc(copy.title.so)}</h2>
      <p>${esc(copy.detail.en)}</p>
      <p class="so">${esc(copy.detail.so)}</p>
    </div>`;
}

/** The "type your code" fallback, for a camera that will not focus. */
export function renderVerificationFormPage(
  attemptedCode?: string | null,
): string {
  const body = `
    <div class="status">
      <h1>Check a receipt</h1>
      <h2>Hubi rasiid</h2>
      <p>Enter the code printed under the QR square on your receipt.</p>
      <p class="so">Geli koodhka ku qoran hoosta labajibbaaran ee QR-ka.</p>
    </div>
    <form method="get" action="">
      <input name="code" value="${esc(attemptedCode)}" placeholder="XXXX-XXXX-XXXX-XX"
             autocapitalize="characters" autocomplete="off" spellcheck="false"
             inputmode="latin" aria-label="Receipt code">
      <button type="submit">Check</button>
    </form>`;
  return shell('Check a receipt', body);
}

function renderOrderSlipPage(
  result: PublicReceiptVerificationResult,
  currency: string,
): string {
  const status = result.status ?? 'OPEN';
  const rows = [
    row({ en: 'Shop', so: 'Dukaanka' }, result.branch?.name ?? '—'),
    result.branch?.city
      ? row({ en: 'Place', so: 'Goobta' }, result.branch.city)
      : '',
    result.orderLabel
      ? row({ en: 'Order', so: 'Amarka' }, result.orderLabel)
      : '',
    row(
      { en: 'Placed on', so: 'Waxaa la dalbaday' },
      formatMoment(result.issuedAt),
    ),
    row({ en: 'Items', so: 'Alaabta' }, String(result.itemCount ?? 0)),
    result.settledReceiptNumber
      ? row(
          { en: 'Paid on receipt', so: 'Rasiidka lagu bixiyay' },
          result.settledReceiptNumber,
        )
      : '',
  ]
    .filter(Boolean)
    .join('');

  const totalRow = `
      <div class="row total">
        <div class="label"><span>Order total</span><em>Wadarta amarka</em></div>
        <div class="value">${esc(formatMoney(result.total ?? 0, currency))}</div>
      </div>`;

  const codeRow = `
      <div class="row">
        <div class="label"><span>Verification code</span><em>Koodhka xaqiijinta</em></div>
        <div class="value code">${esc(result.displayCode ?? '')}</div>
      </div>`;

  return shell(
    STATUS_COPY[status].title.en,
    statusBlock(status) +
      `<div class="rows">${rows}${totalRow}${codeRow}</div>`,
  );
}

export function renderVerificationResultPage(
  result: PublicReceiptVerificationResult,
): string {
  if (!result.found) {
    return shell(
      'No record found',
      statusBlock('NOT_FOUND') +
        `<div class="rows">${row({ en: 'Code checked', so: 'Koodhka la hubiyay' }, result.displayCode ?? '—')}</div>`,
    );
  }

  const currency = result.currency ?? 'ETB';
  const isReturn = result.documentType === 'RETURN';
  const isSlip = result.documentType === 'ORDER_SLIP';

  if (isSlip) return renderOrderSlipPage(result, currency);

  const rows = [
    row({ en: 'Shop', so: 'Dukaanka' }, result.branch?.name ?? '—'),
    result.branch?.city
      ? row({ en: 'Place', so: 'Goobta' }, result.branch.city)
      : '',
    row(
      isReturn
        ? { en: 'Refunded on', so: 'Waxaa la celiyay' }
        : { en: 'Sold on', so: 'Waxaa la iibiyay' },
      formatMoment(result.issuedAt),
    ),
    row(
      { en: 'Receipt number', so: 'Lambarka rasiidka' },
      result.receiptNumber ?? '—',
    ),
    isReturn && result.sourceReceiptNumber
      ? row(
          { en: 'Reverses receipt', so: 'Wuxuu celinayaa rasiidka' },
          result.sourceReceiptNumber,
        )
      : '',
    row({ en: 'Items', so: 'Alaabta' }, String(result.itemCount ?? 0)),
    (result.refundedAmount ?? 0) > 0
      ? row(
          { en: 'Returned since', so: 'Waxaa la celiyay' },
          formatMoney(result.refundedAmount ?? 0, currency),
        )
      : '',
  ]
    .filter(Boolean)
    .join('');

  const totalRow = `
      <div class="row total">
        <div class="label"><span>${isReturn ? 'Refund total' : 'Total paid'}</span><em>${isReturn ? 'Wadarta celinta' : 'Wadarta la bixiyay'}</em></div>
        <div class="value">${esc(formatMoney(result.total ?? 0, currency))}</div>
      </div>`;

  const tipRow =
    (result.tipAmount ?? 0) > 0
      ? row(
          { en: 'Of which tip', so: 'Waxaa ka mid ah tip' },
          formatMoney(result.tipAmount ?? 0, currency),
        )
      : '';

  const codeRow = `
      <div class="row">
        <div class="label"><span>Verification code</span><em>Koodhka xaqiijinta</em></div>
        <div class="value code">${esc(result.displayCode ?? '')}</div>
      </div>`;

  return shell(
    STATUS_COPY[result.status ?? 'VALID'].title.en,
    statusBlock(result.status ?? 'VALID') +
      `<div class="rows">${rows}${totalRow}${tipRow}${codeRow}</div>`,
  );
}
