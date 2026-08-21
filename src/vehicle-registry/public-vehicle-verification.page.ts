import type { PublicVehicleResult, PublicVehicleStatus } from './public-vehicle-verification.service';

/**
 * The page a scanned certificate lands on.
 *
 * Self-contained and JavaScript-free, like the receipt verification page it is
 * modelled on. The reader is standing at a roadside on someone else's phone,
 * possibly on a bad connection — a single small HTML document renders before a
 * framework would have finished downloading.
 *
 * Trilingual on the FACE, not by locale negotiation: the person scanning is not
 * the person who printed it, and a checkpoint in the Somali Region may be
 * staffed by someone who reads Amharic. Every verdict says its piece three
 * times.
 *
 * The verdict is a colour and a word before it is anything else. Somebody
 * glancing at a phone held up by a driver needs to know in one look, so the
 * answer is a full-width band at the top and the detail is underneath.
 */

const STATUS_COPY: Record<
  PublicVehicleStatus,
  { so: string; am: string; en: string; bg: string; fg: string }
> = {
  VALID: {
    so: 'DIIWAAN GASHAN',
    am: 'የተመዘገበ',
    en: 'REGISTERED',
    bg: '#166534',
    fg: '#ffffff',
  },
  /**
   * Registered, no official number issued yet.
   *
   * GREEN, not amber. This is the normal, correct state for most of the fleet
   * in this drive — the vehicle is on the register, which is exactly what the
   * portal is asked about. Colouring it as a problem would tell an officer
   * something is wrong with a vehicle whose paperwork is in perfect order.
   */
  REGISTERED_NO_PLATE: {
    so: 'DIIWAAN GASHAN',
    am: 'የተመዘገበ',
    en: 'REGISTERED',
    bg: '#166534',
    fg: '#ffffff',
  },
  /**
   * Registered, plate not yet fitted, permit still valid.
   *
   * Amber rather than green: the vehicle is legal, but the plate an officer is
   * looking at does not match the record, and saying "registered" without
   * saying that would be misleading.
   */
  AWAITING_PLATE: {
    so: 'DIIWAAN GASHAN — TAARIKHDU MA RIBIN',
    am: 'የተመዘገበ — ሰሌዳ ገና አልተገጠመም',
    en: 'REGISTERED — PLATE NOT YET FITTED',
    bg: '#b45309',
    fg: '#ffffff',
  },
  /**
   * Registered, plate not fitted, and the permit has run out.
   *
   * Overdue, not unlawful. The office may simply not have produced the plate,
   * and the wording refers the reader to the office rather than accusing the
   * driver of anything.
   */
  PLATE_OVERDUE: {
    so: 'TAARIKHDA WAA DIB U DHACDAY',
    am: 'ሰሌዳው አልተገጠመም — ጊዜው አልፎበታል',
    en: 'PLATE OVERDUE',
    bg: '#b91c1c',
    fg: '#ffffff',
  },
  EXPIRED: {
    so: 'DHACAY',
    am: 'ጊዜው አልፎበታል',
    en: 'EXPIRED',
    bg: '#b45309',
    fg: '#ffffff',
  },
  SUSPENDED: {
    so: 'LA JOOJIYAY',
    am: 'ታግዷል',
    en: 'SUSPENDED',
    bg: '#b91c1c',
    fg: '#ffffff',
  },
  DEREGISTERED: {
    so: 'LAGA SAARAY DIIWAANKA',
    am: 'ከመዝገብ ተሰርዟል',
    en: 'DEREGISTERED',
    bg: '#b91c1c',
    fg: '#ffffff',
  },
  PENDING: {
    so: 'WELI LA MA BIXIN',
    am: 'ገና አልተሰጠም',
    en: 'NOT YET ISSUED',
    bg: '#6b7280',
    fg: '#ffffff',
  },
  NOT_REGISTERED: {
    so: 'DIIWAAN LAGA MA HELIN',
    am: 'በመዝገብ አልተገኘም',
    en: 'NO RECORD FOUND',
    bg: '#6b7280',
    fg: '#ffffff',
  },
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px;
    font-family: 'Noto Sans Ethiopic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: #f3f4f6; color: #111827; line-height: 1.45;
  }
  .wrap { max-width: 460px; margin: 0 auto; }
  .bureau { text-align: center; font-size: 12px; color: #4b5563; margin-bottom: 10px; }
  .card { background: #fff; border-radius: 12px; overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .verdict { padding: 16px; text-align: center; }
  .verdict .so { font-size: 20px; font-weight: 800; letter-spacing: .5px; }
  .verdict .am, .verdict .en { font-size: 12px; opacity: .9; }
  .plate { margin: 16px; text-align: center; border: 3px solid #111827;
           border-radius: 8px; padding: 10px; font-size: 26px; font-weight: 800;
           letter-spacing: 4px; font-family: 'Courier New', monospace; }
  dl { margin: 0; padding: 0 16px 16px; }
  .row { display: flex; justify-content: space-between; gap: 12px;
         padding: 7px 0; border-bottom: 1px dotted #e5e7eb; font-size: 13px; }
  .row:last-child { border-bottom: 0; }
  .row dt { color: #6b7280; margin: 0; }
  .row dd { margin: 0; font-weight: 600; text-align: right; }
  .flag { margin: 0 16px 16px; padding: 12px; border-radius: 8px;
          background: #fef2f2; border: 2px solid #b91c1c; color: #7f1d1d;
          font-size: 13px; font-weight: 700; text-align: center; }
  form { display: flex; gap: 8px; margin: 16px; }
  input { flex: 1; padding: 11px; border: 1px solid #d1d5db; border-radius: 8px;
          font-size: 16px; }
  button { padding: 11px 18px; border: 0; border-radius: 8px; background: #14532d;
           color: #fff; font-weight: 700; font-size: 15px; }
  .note { font-size: 11px; color: #6b7280; text-align: center; margin: 14px 16px 0; }
</style>
</head>
<body><div class="wrap">
<div class="bureau">Somali Regional State · Bureau of Trade and Transport<br>Xafiiska Diiwaangelinta Gaadiidka</div>
${body}
<p class="note">
  Bogga rasmiga ah ee xaqiijinta · ኦፊሴላዊ የማረጋገጫ ገጽ · Official verification page
</p>
</div></body></html>`;
}

/** The typed-plate form — also where a damaged QR lands. */
export function renderVehicleFormPage(message?: string | null): string {
  return shell(
    'Verify a vehicle',
    `<div class="card">
      <div class="verdict" style="background:#14532d;color:#fff">
        <div class="so">HUBI GAADIIDKA</div>
        <div class="am">ተሽከርካሪ ያረጋግጡ</div>
        <div class="en">Verify a vehicle</div>
      </div>
      <form method="get" action="">
        <input name="plate" placeholder="3-SM-01234" aria-label="Plate number"
               autocapitalize="characters" autocomplete="off" />
        <button type="submit">Hubi</button>
      </form>
      ${message ? `<p class="note">${esc(message)}</p>` : ''}
    </div>`,
  );
}

export function renderVehicleResultPage(result: PublicVehicleResult): string {
  const copy = STATUS_COPY[result.status] ?? STATUS_COPY.NOT_REGISTERED;

  if (!result.found) {
    return shell(
      'No record found',
      `<div class="card">
        <div class="verdict" style="background:${copy.bg};color:${copy.fg}">
          <div class="so">${esc(copy.so)}</div>
          <div class="am">${esc(copy.am)}</div>
          <div class="en">${esc(copy.en)}</div>
        </div>
        <p class="note">
          Ma jiro diiwaan u dhigma. Hubi lambarka, ama la xidhiidh xafiiska.<br>
          ተመሳሳይ መዝገብ የለም። ቁጥሩን ያረጋግጡ።<br>
          No matching record. Check the number, or contact the issuing office.
        </p>
      </div>
      ${renderVehicleFormPage().split('<div class="wrap">')[1]?.split('<p class="note">')[0] ?? ''}`,
    );
  }

  const plateBg = result.plateBackgroundColour || '#ffffff';
  const plateFg = result.plateTextColour || '#111827';

  const row = (so: string, am: string, en: string, value: unknown) =>
    value == null || value === ''
      ? ''
      : `<div class="row"><dt>${esc(so)} · ${esc(am)} · ${esc(en)}</dt><dd>${esc(value)}</dd></div>`;

  return shell(
    `${result.plateNumber ?? 'Vehicle'} — ${copy.en}`,
    `<div class="card">
      <div class="verdict" style="background:${copy.bg};color:${copy.fg}">
        <div class="so">${esc(copy.so)}</div>
        <div class="am">${esc(copy.am)}</div>
        <div class="en">${esc(copy.en)}</div>
      </div>

      <div class="plate" style="background:${esc(plateBg)};color:${esc(plateFg)}">
        ${esc(result.plateNumber ?? '—')}
      </div>

      ${
        result.status === 'REGISTERED_NO_PLATE'
          ? `<div class="flag" style="background:#f0fdf4;border-color:#16a34a;color:#166534">
               Baabuurkani wuxuu ku jiraa diiwaanka. Lambar rasmi ah weli lama siin.<br>
               ይህ ተሽከርካሪ ተመዝግቧል። ኦፊሴላዊ ቁጥር ገና አልተሰጠም።<br>
               This vehicle IS registered. An official plate number has not been
               issued yet${
                 result.previousPlateNumber
                   ? `, so it still carries <strong>${esc(result.previousPlateNumber)}</strong>`
                   : ''
               }.
             </div>`
          : ''
      }

      ${
        result.status === 'AWAITING_PLATE' || result.status === 'PLATE_OVERDUE'
          ? `<div class="flag" style="background:#fffbeb;border-color:#f59e0b;color:#92400e">
               Baabuurkani wuxuu diiwaan ugu jiraa ${esc(result.plateNumber ?? '')}<br>
               ይህ ተሽከርካሪ የተመዘገበው በ ${esc(result.plateNumber ?? '')} ነው<br>
               This vehicle is registered as <strong>${esc(result.plateNumber ?? '')}</strong>.
               The plate has not been fitted yet${
                 result.previousPlateNumber
                   ? `, so it is still carrying <strong>${esc(result.previousPlateNumber)}</strong>`
                   : ''
               }.${
                 result.status === 'PLATE_OVERDUE'
                   ? ' The interim permit has run out — refer the driver to the issuing office.'
                   : `${
                       result.interimPermitExpiresAt
                         ? ` Permitted until ${esc(formatDate(result.interimPermitExpiresAt))}.`
                         : ''
                     }`
               }
             </div>`
          : ''
      }

      ${
        result.matchedOnPreviousNumber
          ? `<div class="flag" style="background:#fffbeb;border-color:#f59e0b;color:#92400e">
               Baabuurkan wuxuu hadda leeyahay lambar cusub — ${esc(result.plateNumber ?? '')}<br>
               ይህ ተሽከርካሪ አሁን አዲስ ቁጥር አለው<br>
               You searched <strong>${esc(result.previousPlateNumber ?? '')}</strong>, the number this
               vehicle used to carry. Its registered plate is now
               <strong>${esc(result.plateNumber ?? '')}</strong>.
             </div>`
          : ''
      }

      ${
        result.flagged
          ? `<div class="flag">
               ⚠ GAADIIDKAN WAA LA SOO SHEEGAY — LA XIDHIIDH BOOLISKA<br>
               ይህ ተሽከርካሪ ተጠቁሟል — ፖሊስን ያነጋግሩ<br>
               THIS VEHICLE IS REPORTED — CONTACT TRAFFIC POLICE
             </div>`
          : ''
      }

      <dl>
        ${row('Nooca', 'ዓይነት', 'Class', result.className)}
        ${row('Nooca gaadhiga', 'ማርካ', 'Make', [result.make, result.model].filter(Boolean).join(' '))}
        ${row('Sanadka', 'ዓመት', 'Year', result.modelYear)}
        ${row('Midabka', 'ቀለም', 'Colour', result.colour)}
        ${row('Chassis (4-ta danbe)', 'ሻሲ (የመጨረሻ 4)', 'Chassis (last 4)', result.vinLast4)}
        ${row('Dhacaya', 'የሚያበቃበት', 'Expires', formatDate(result.expiresAt))}
        ${row('Xafiiska', 'ጽሕፈት ቤት', 'Issuing office', result.issuingOffice)}
        ${row('Shahaadada', 'የምስክር ወረቀት', 'Certificate', result.certificateNumber)}
      </dl>
    </div>
    <p class="note">
      Macluumaadka milkiilaha lama muujiyo. Booliska ayaa arka.<br>
      የባለቤት መረጃ አይታይም። ፖሊስ ብቻ ያያል።<br>
      Owner details are not shown here. Traffic police see the full record.
    </p>`,
  );
}
