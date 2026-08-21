/**
 * When the platform's free period ends — a fixed calendar date, the same one
 * for every account and for both kinds of workspace it can be spent on.
 *
 * It used to be six rolling months from signup, which meant the platform had as
 * many end dates as it had signups and no date at which revenue actually
 * started. This is a promotion with a deadline instead: free until the last
 * moment of 31 December 2026 in Addis Ababa (UTC+3), then every account pays
 * for every branch and supplier account it runs. An account that signs up in
 * November gets less free time than one that signed up in August — that is what
 * a deadline means, and it is the thing that makes 1 January 2027 a real
 * starting line.
 *
 * The offset is written out rather than left to the server's TZ: POS stores
 * `endsAt` in a naive `timestamp` column, so an unqualified
 * "2026-12-31T23:59:59" would mean a different instant on a UTC box than on an
 * Addis one.
 *
 * It lives here, not in either billing module, because the branch side and the
 * supplier side must never drift onto different deadlines — an account offered
 * one free workspace "or" the other would otherwise be choosing between two
 * different offers.
 */
const FREE_PERIOD_ENDS_AT_DEFAULT = '2026-12-31T23:59:59.999+03:00';

/**
 * Overridable so the deadline can be moved (or extended for a second
 * promotion) without a code change. An unparseable value is ignored rather than
 * obeyed — a typo in an env var must not silently end every free workspace on
 * the platform.
 */
export function getFreePeriodEndsAt(): Date {
  const configured = String(process.env.POS_FREE_PERIOD_ENDS_AT || '').trim();

  if (configured) {
    const parsed = new Date(configured);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(FREE_PERIOD_ENDS_AT_DEFAULT);
}

/**
 * Is the promotion still running?
 *
 * Guards the grant itself, not just the end date. Once this is false a new
 * signup must NOT be given a free-period row: the row would be born expired,
 * and the owner would land in a workspace that reports PAYMENT_REQUIRED with a
 * "your workspace is open" message on top of it. Callers skip the grant
 * entirely and fall through to the ordinary paywall.
 */
export function isFreePeriodOpen(now: number = Date.now()): boolean {
  return getFreePeriodEndsAt().getTime() > now;
}

/** The deadline as an owner reads it — "31 December 2026". */
export function formatFreePeriodEndsAt(locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Addis_Ababa',
  }).format(getFreePeriodEndsAt());
}
