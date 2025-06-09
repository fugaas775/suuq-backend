export enum UserRole {
  ADMIN = 'ADMIN',
  VENDOR = 'VENDOR',
  CUSTOMER = 'CUSTOMER',
  DELIVERER = 'DELIVERER',
}

export function normalizeRoles(raw: string | string[] | null | undefined): UserRole[] {
  const allRoles = Object.values(UserRole);
  if (Array.isArray(raw)) {
    return raw
      .map(r => {
        const upper = (r || '').toUpperCase();
        return allRoles.includes(upper as UserRole) ? (upper as UserRole) : null;
      })
      .filter((r): r is UserRole => !!r);
  }
  if (typeof raw === 'string') {
    const upper = raw.toUpperCase();
    return allRoles.includes(upper as UserRole) ? [upper as UserRole] : [];
  }
  return [];
}