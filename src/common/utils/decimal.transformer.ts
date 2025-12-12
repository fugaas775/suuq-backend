export const decimalColumnTransformer = {
  to(value?: number | null): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  },
  from(value?: string | number | null): number | null {
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  },
};
