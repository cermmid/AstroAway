// Time helpers for sidereal sky orientation. Pure functions, no three.js.

const DAY_MS = 86400000;
const J2000 = 2451545.0;

/** Julian date (UT) for a JS Date. */
export function julianDate(date: Date): number {
  return date.getTime() / DAY_MS + 2440587.5;
}

const TWO_PI = Math.PI * 2;

export function normalizeRad(a: number): number {
  const r = a % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
}

/**
 * Greenwich Mean Sidereal Time in radians.
 * IAU 1982 polynomial expressed in degrees; accurate to well under an
 * arcsecond over +/- a century, far below our visual needs.
 */
export function gmst(jd: number): number {
  const d = jd - J2000;
  const t = d / 36525;
  const deg =
    280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000;
  return normalizeRad((deg * Math.PI) / 180);
}

/** Local sidereal time (radians) for an east-positive longitude in degrees. */
export function lst(gmstRad: number, lonDeg: number): number {
  return normalizeRad(gmstRad + (lonDeg * Math.PI) / 180);
}

/** Convenience: LST directly from Date + longitude. */
export function localSiderealTime(date: Date, lonDeg: number): number {
  return lst(gmst(julianDate(date)), lonDeg);
}
