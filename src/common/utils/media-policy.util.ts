export function isAllowedMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const allowed = (process.env.ALLOWED_MEDIA_HOSTS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!allowed.length) return true; // no restriction
    const host = u.hostname.toLowerCase();
    return allowed.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function assertAllowedMediaUrl(url: string): void {
  if (!isAllowedMediaUrl(url)) {
    throw new Error('Image host is not allowed by policy.');
  }
}
