/**
 * Per-branch configuration for the branch-customizable Home page (`/home` in the
 * POS frontend). Persisted as a jsonb blob on `branches.homeConfig`, threaded to
 * the client on the login/session payload exactly like `logoUrl`.
 *
 * The Dashboard (`/dashboard`) is fixed and ignores this; only Home reads it. A
 * null column means "this branch has never customized" — the client renders a
 * sensible per-format default.
 *
 * `version` lets the shape evolve without a migration: the client's normalizer
 * tolerates unknown widget ids and older/newer versions rather than throwing.
 */
export interface BranchHomeWidgetConfig {
  /** A widget id from the frontend registry (widgetRegistry.js). */
  id: string;
  enabled: boolean;
}

export interface BranchHomeQuickLink {
  id: string;
  label: string;
  /** An internal path ("/ops/reports") or an absolute https:// URL. */
  to: string;
  external?: boolean;
}

export interface BranchHomeWelcome {
  title?: string | null;
  body?: string | null;
  enabled: boolean;
}

export interface BranchHomeBranding {
  coverImageUrl?: string | null;
  /** A CSS color the branch chose as its Home accent. */
  accent?: string | null;
}

/**
 * First-run milestones for this branch. Server-owned: written as a side effect
 * of the actions themselves, never sent up by the client, and preserved across
 * Home layout saves (which only carry the layout).
 *
 * It rides on `homeConfig` because that is an existing per-branch jsonb column
 * already threaded onto the session — no migration, no new column.
 */
export interface BranchHomeFirstRun {
  /**
   * When the owner confirmed what this branch sells. Auto-provisioned branches
   * all start on QSR, so the format alone cannot distinguish "confirmed" from
   * "never looked at it".
   */
  businessTypeConfirmedAt?: string | null;
}

export interface BranchHomeConfig {
  version: number;
  /** Ordered — the branch's chosen widget order and on/off state. */
  widgets: BranchHomeWidgetConfig[];
  quickLinks: BranchHomeQuickLink[];
  // Optional: an unset welcome/branding is treated the same as null (default).
  welcome?: BranchHomeWelcome | null;
  branding?: BranchHomeBranding | null;
  firstRun?: BranchHomeFirstRun | null;
}
