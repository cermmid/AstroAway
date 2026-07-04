// Validates the hand-rolled sidereal/coordinate math against astronomy-engine
// (the oracle) and against basic sky invariants. Both sides are fed the same
// J2000 coordinates, so this checks the transformation math itself;
// precession is intentionally out of scope (~0.35 deg in the 2020s).
import { describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { Vector3 } from 'three';
import { gmst, julianDate, localSiderealTime, normalizeRad } from '../src/astro/time';
import {
  altAzToVector3,
  equatorialSkyQuaternion,
  equatorialToWorld,
  raDecToAltAz,
  raDecToEquatorialVector,
} from '../src/astro/coords';

const DEG = Math.PI / 180;

// J2000 positions (HYG catalog values).
const STARS = {
  Arcturus: { raRad: 3.73353, decRad: 0.3348 },
  Polaris: { raRad: 0.66242, decRad: 1.55795 },
  Vega: { raRad: 4.87356, decRad: 0.67704 },
};

const DATES = [
  new Date('2026-07-03T22:00:00Z'),
  new Date('2026-01-15T04:30:00Z'),
  new Date('2030-11-01T18:12:34Z'),
  new Date('2019-03-20T21:58:00Z'),
];

describe('gmst', () => {
  it('matches astronomy-engine SiderealTime within the equation of equinoxes', () => {
    // The oracle returns *apparent* sidereal time (with nutation); ours is
    // *mean*. They differ by up to ~20 arcsec, invisible at eye scale.
    for (const date of DATES) {
      const oursHours = (gmst(julianDate(date)) * 12) / Math.PI;
      const oracle = Astronomy.SiderealTime(date);
      const diffHours = Math.abs(oursHours - oracle) % 24;
      const diff = Math.min(diffHours, 24 - diffHours);
      expect(diff * 15 * 3600).toBeLessThan(30); // arcseconds
    }
  });
});

describe('raDecToAltAz', () => {
  it('matches astronomy-engine Horizon (no refraction) within 0.05 deg', () => {
    const sites = [
      { lat: 52.23, lon: 21.01 },
      { lat: -33.87, lon: 151.21 },
      { lat: 0, lon: 0 },
    ];
    for (const date of DATES) {
      for (const site of sites) {
        const observer = new Astronomy.Observer(site.lat, site.lon, 0);
        for (const [name, s] of Object.entries(STARS)) {
          const lstRad = localSiderealTime(date, site.lon);
          const ours = raDecToAltAz(s.raRad, s.decRad, site.lat * DEG, lstRad);
          const raHours = (s.raRad * 12) / Math.PI;
          const decDeg = s.decRad / DEG;
          const oracle = Astronomy.Horizon(date, observer, raHours, decDeg);
          expect(Math.abs(ours.alt / DEG - oracle.altitude), `${name} alt`).toBeLessThan(0.05);
          const azDiff = Math.abs(normalizeRad(ours.az) / DEG - oracle.azimuth) % 360;
          expect(Math.min(azDiff, 360 - azDiff), `${name} az`).toBeLessThan(0.05);
        }
      }
    }
  });

  it('puts Polaris at altitude ~ latitude', () => {
    const lstRad = localSiderealTime(DATES[0], 21.01);
    const { alt } = raDecToAltAz(STARS.Polaris.raRad, STARS.Polaris.decRad, 52.23 * DEG, lstRad);
    expect(Math.abs(alt / DEG - 52.23)).toBeLessThan(1);
  });
});

describe('equatorialSkyQuaternion', () => {
  it('rotates star vectors to the same direction as alt/az conversion', () => {
    for (const date of DATES) {
      const latRad = 52.23 * DEG;
      const lstRad = localSiderealTime(date, 21.01);
      const q = equatorialSkyQuaternion(latRad, lstRad);
      for (const s of Object.values(STARS)) {
        const viaQuat = raDecToEquatorialVector(s.raRad, s.decRad).applyQuaternion(q);
        const { alt, az } = raDecToAltAz(s.raRad, s.decRad, latRad, lstRad);
        const viaAltAz = altAzToVector3(alt, az);
        expect(viaQuat.distanceTo(viaAltAz)).toBeLessThan(1e-6);
      }
    }
  });

  it('equatorialToWorld agrees with the quaternion path', () => {
    const latRad = -20 * DEG;
    const lstRad = 1.2345;
    const v = raDecToEquatorialVector(STARS.Vega.raRad, STARS.Vega.decRad);
    const a = equatorialToWorld(v.clone(), latRad, lstRad, new Vector3());
    const b = v.clone().applyQuaternion(equatorialSkyQuaternion(latRad, lstRad));
    expect(a.distanceTo(b)).toBeLessThan(1e-9);
  });
});
