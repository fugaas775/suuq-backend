/**
 * Formal warnings — the steps before a dismissal.
 *
 * Owner 2026-09-23: "The system should give some warnings before a teacher
 * is fired." A warning is a level on a ladder: VERBAL, then WRITTEN, then
 * FINAL (written), and only then is dismissal the next step. Each stands
 * for a time and then lapses — six months for a verbal one, twelve for the
 * written ones — unless withdrawn sooner. The ladder is advice the screen
 * gives, not a lock: the school decides, the system says what is on file.
 *
 * Pure: the service reads the rows, this decides. Who may issue one is the
 * heads' rule shared with leave (`isStaffHead`).
 */
export const WARNING_LEVELS = ['VERBAL', 'WRITTEN', 'FINAL'] as const;
export type WarningLevel = (typeof WARNING_LEVELS)[number];

export const WARNING_CATEGORIES = [
  'ABSENCE',
  'LATENESS',
  'CONDUCT',
  'PERFORMANCE',
  'NEGLECT',
  'OTHER',
] as const;

/** How long a warning stands, by level, when the issuer sets no date. */
export const WARNING_DEFAULT_MONTHS: Record<WarningLevel, number> = {
  VERBAL: 6,
  WRITTEN: 12,
  FINAL: 12,
};

export const LEVEL_RANK: Record<WarningLevel, number> = {
  VERBAL: 1,
  WRITTEN: 2,
  FINAL: 3,
};

export type WarningNextStep = WarningLevel | 'DISMISSAL';

const day = (v: unknown) => String(v ?? '').slice(0, 10);

/** `issuedOn` plus the level's months, as 'YYYY-MM-DD'. */
export function defaultExpiry(level: WarningLevel, issuedOn: string): string {
  const d = new Date(`${day(issuedOn)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + (WARNING_DEFAULT_MONTHS[level] ?? 12));
  return d.toISOString().slice(0, 10);
}

/** Standing today: not withdrawn, and not past its expiry. */
export function isWarningActive(
  w: { status?: string | null; expiresOn?: string | null },
  today: string,
): boolean {
  if (String(w.status ?? 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
  const exp = day(w.expiresOn);
  return !exp || exp >= day(today);
}

/** The highest level standing, or null. */
export function highestLevel(
  active: Array<{ level: string }>,
): WarningLevel | null {
  let best: WarningLevel | null = null;
  for (const w of active) {
    const lvl = String(w.level).toUpperCase() as WarningLevel;
    if (!LEVEL_RANK[lvl]) continue;
    if (!best || LEVEL_RANK[lvl] > LEVEL_RANK[best]) best = lvl;
  }
  return best;
}

/** The step the ladder points at next, given what stands. */
export function nextWarningStep(
  active: Array<{ level: string }>,
): WarningNextStep {
  const top = highestLevel(active);
  if (!top) return 'VERBAL';
  if (top === 'VERBAL') return 'WRITTEN';
  if (top === 'WRITTEN') return 'FINAL';
  return 'DISMISSAL';
}

export type WarningSummaryRow = {
  employeeId: number;
  employeeName: string | null;
  active: number;
  byLevel: Record<string, number>;
  highest: WarningLevel | null;
  nextStep: WarningNextStep;
  latestIssuedOn: string | null;
  latestCategory: string | null;
  unacknowledged: number;
  withdrawn: number;
};

/** Per person: what stands, the highest level, and the next step. */
export function summarizeWarnings(
  rows: Array<{
    employeeId: number;
    employeeName?: string | null;
    level: string;
    category?: string | null;
    status?: string | null;
    issuedOn: string;
    expiresOn?: string | null;
    acknowledgedAt?: Date | string | null;
  }>,
  today: string,
): WarningSummaryRow[] {
  const byPerson = new Map<number, WarningSummaryRow & { activeRows: Array<{ level: string }> }>();
  for (const row of rows) {
    const id = Number(row.employeeId);
    const entry = byPerson.get(id) ?? {
      employeeId: id,
      employeeName: row.employeeName ?? null,
      active: 0,
      byLevel: {},
      highest: null,
      nextStep: 'VERBAL' as WarningNextStep,
      latestIssuedOn: null,
      latestCategory: null,
      unacknowledged: 0,
      withdrawn: 0,
      activeRows: [],
    };
    if (String(row.status ?? 'ACTIVE').toUpperCase() === 'WITHDRAWN') {
      entry.withdrawn += 1;
    } else if (isWarningActive(row, today)) {
      entry.active += 1;
      entry.activeRows.push({ level: row.level });
      const lvl = String(row.level).toUpperCase();
      entry.byLevel[lvl] = (entry.byLevel[lvl] ?? 0) + 1;
      if (!row.acknowledgedAt) entry.unacknowledged += 1;
      if (!entry.latestIssuedOn || day(row.issuedOn) > entry.latestIssuedOn) {
        entry.latestIssuedOn = day(row.issuedOn);
        entry.latestCategory = row.category ?? null;
      }
    }
    byPerson.set(id, entry);
  }
  return [...byPerson.values()]
    .map(({ activeRows, ...entry }) => ({
      ...entry,
      highest: highestLevel(activeRows),
      nextStep: nextWarningStep(activeRows),
    }))
    .sort(
      (a, b) =>
        (LEVEL_RANK[b.highest as WarningLevel] ?? 0) -
          (LEVEL_RANK[a.highest as WarningLevel] ?? 0) ||
        String(a.employeeName ?? '').localeCompare(String(b.employeeName ?? '')),
    );
}
