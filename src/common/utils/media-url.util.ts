export function absolutize(
  url: string | null | undefined,
): string | null | undefined {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) {
    // Prefer PUBLIC_BASE_URL scheme if set, else default to https
    const base =
      process.env.PUBLIC_BASE_URL || process.env.MEDIA_BASE_URL || '';
    let scheme = 'https:';
    try {
      if (base) {
        const u = new URL(base);
        if (u.protocol) scheme = u.protocol;
      }
    } catch {}
    return `${scheme}${url}`;
  }
  const base = process.env.MEDIA_BASE_URL || process.env.PUBLIC_BASE_URL || '';
  if (!base) return url; // cannot resolve without base
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base.replace(/\/$/, '')}/${url}`;
}

export function normalizeProductMedia<T extends Record<string, any>>(p: T): T {
  if (!p || typeof p !== 'object') return p;
  const out: any = { ...p };
  if (Array.isArray(out.images)) {
    out.images = out.images.map((img: any) => {
      // Support string items: ["/uploads/x.jpg", ...]
      if (typeof img === 'string') {
        return { src: absolutize(img) };
      }
      if (!img || typeof img !== 'object') return img;
      const o: any = { ...img };
      if (typeof o.src === 'string') o.src = absolutize(o.src);
      if (typeof o.thumbnailSrc === 'string')
        o.thumbnailSrc = absolutize(o.thumbnailSrc);
      if (typeof o.lowResSrc === 'string')
        o.lowResSrc = absolutize(o.lowResSrc);
      return o;
    });
  }
  const first =
    Array.isArray(out.images) && out.images.length ? out.images[0] : null;
  const candidate =
    (first?.thumbnailSrc as string) ||
    (first?.lowResSrc as string) ||
    (first?.src as string) ||
    (out.imageUrl as string);
  if (candidate) out.imageUrl = absolutize(candidate);
  else if (typeof out.imageUrl === 'string')
    out.imageUrl = absolutize(out.imageUrl);
  return out as T;
}
