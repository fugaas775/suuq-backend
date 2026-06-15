import { Repository } from 'typeorm';
import { SupplierProfile } from './entities/supplier-profile.entity';

/**
 * Multi-supplier support: a single account may own more than one supplier
 * profile. The portal tells the backend which one it is currently operating via
 * the `x-supplier-id` request header (mirrors `x-branch-id` for POS branches).
 * These helpers read that selection and resolve the owned profile a request
 * should act on, defaulting to the account's primary (lowest-id) supplier.
 */

/** Read the caller's chosen active supplier id from request headers. */
export function extractActiveSupplierId(
  req: { headers?: Record<string, unknown> } | null | undefined,
): number | null {
  const headers = req?.headers ?? {};
  const raw = headers['x-supplier-id'] ?? headers['x-active-supplier-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve the owned supplier profile a request should operate on. Honours an
 * explicit selection (`preferredId`) when it belongs to the user; otherwise
 * falls back to the account's primary (lowest-id) profile. Returns null when the
 * user owns no supplier profile.
 */
export async function resolveActiveOwnedProfile(
  repo: Repository<SupplierProfile>,
  userId: number,
  preferredId?: number | null,
): Promise<SupplierProfile | null> {
  const profiles = await repo.find({
    where: { userId },
    order: { id: 'ASC' },
  });
  if (!profiles.length) {
    return null;
  }
  if (preferredId) {
    const chosen = profiles.find((p) => p.id === Number(preferredId));
    if (chosen) {
      return chosen;
    }
  }
  return profiles[0];
}

/** All supplier profile ids OWNED by a user (membership set for record checks). */
export async function listOwnedSupplierProfileIds(
  repo: Repository<SupplierProfile>,
  userId: number,
): Promise<number[]> {
  const profiles = await repo.find({
    where: { userId },
    select: { id: true },
    order: { id: 'ASC' },
  });
  return profiles.map((p) => p.id);
}
