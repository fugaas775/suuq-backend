/**
 * Compute great-circle distance between two coordinates using the Haversine formula.
 * Returns kilometers as a number (double precision).
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return R * c;
}

/**
 * Round a number to fixed decimal places and return a Number (not string).
 */
export function roundTo(
  value: number | null | undefined,
  digits = 4,
): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
