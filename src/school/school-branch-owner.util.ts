import { EntityManager } from 'typeorm';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';

/**
 * The owner of a school is the branch's owner OR its tenant's owner — the
 * account that holds the business — the same two the POS branch guard
 * counts. Read here so the class scope, the login desks and the pupil-record
 * check stop trusting a global POS_MANAGER role instead: every VENDOR account
 * carries it, and any account can make itself a vendor, so it made a
 * stranger the head of every school (school pass 8, closed 2026-10-18).
 */
export async function tenantOwnerOf(
  manager: EntityManager | undefined,
  retailTenantId: number | null | undefined,
): Promise<number | null> {
  if (!manager || retailTenantId == null) return null;
  const tenant = await manager.getRepository(RetailTenant).findOne({
    where: { id: retailTenantId },
    select: { id: true, ownerUserId: true },
  });
  return tenant?.ownerUserId ?? null;
}

/** Whether `actorId` is the branch's owner or its tenant's owner. */
export function isSchoolOwner(
  actorId: number | null | undefined,
  ownerId: number | null | undefined,
  tenantOwnerId?: number | null,
): boolean {
  if (actorId == null) return false;
  return [ownerId, tenantOwnerId].some(
    (id) => id != null && Number(id) === Number(actorId),
  );
}
