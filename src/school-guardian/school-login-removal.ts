import { EntityManager } from 'typeorm';
import { User } from '../users/entities/user.entity';

/**
 * Remove a parent's or a pupil's login, all or nothing. The school's rows go
 * first (`dropRows`); the user row goes too when no other school still holds
 * it (`stillHeld`) and the office minted it (MANUAL).
 *
 * These were separate writes: the account row was deleted, then the user row
 * failed on something still pointing at it, and the desk was left with no
 * login listed AND the username taken — the pupil could never be given it
 * again. Now one transaction; and when the user row cannot go, it is RETIRED
 * instead — sign-in off, username and internal e-mail cleared out of the way —
 * so the name is free while whatever still points at the row keeps pointing.
 */
export async function removeMintedLogin(
  manager: EntityManager,
  userId: number,
  dropRows: (em: EntityManager) => Promise<void>,
  stillHeld: (em: EntityManager) => Promise<boolean>,
): Promise<{ userRemoved: boolean; userRetired: boolean }> {
  const none = { userRemoved: false, userRetired: false };
  const minted = async (em: EntityManager) => {
    if (await stillHeld(em)) return null;
    const user = await em
      .getRepository(User)
      .findOne({ where: { id: userId } });
    return user && user.authMode === 'MANUAL' ? user : null;
  };
  try {
    return await manager.transaction(async (em) => {
      await dropRows(em);
      const user = await minted(em);
      if (!user) return none;
      await em.getRepository(User).remove(user);
      return { userRemoved: true, userRetired: false };
    });
  } catch {
    // The whole delete rolled back. Again, retiring the user row this time.
    return manager.transaction(async (em) => {
      await dropRows(em);
      const user = await minted(em);
      if (!user) return none;
      user.posUsername = null;
      user.email = `retired-${user.id}-${Date.now()}@sys.internal`;
      user.isActive = false;
      await em.getRepository(User).save(user);
      return { userRemoved: false, userRetired: true };
    });
  }
}
