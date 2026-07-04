// Equatorial (RA/Dec, J2000) <-> local horizontal coordinate conversions and
// the single quaternion that orients the whole celestial sphere for an
// observer. Pure math except for the three.js Vector3/Quaternion types.
//
// World frame convention (three.js): +X = east, +Y = up (zenith), -Z = north.
// Azimuth is measured from north, increasing eastward (astronomical standard).
//
// Precession from J2000 to the mid-2020s shifts stars ~0.35 deg; that is below
// what the eye can register against a horizon and is deliberately ignored.

import { Matrix4, Quaternion, Vector3 } from 'three';
import { normalizeRad } from './time';

export interface AltAz {
  /** Altitude above horizon, radians. */
  alt: number;
  /** Azimuth from north through east, radians in [0, 2pi). */
  az: number;
}

/** Classic spherical-trig conversion for a single object. */
export function raDecToAltAz(
  raRad: number,
  decRad: number,
  latRad: number,
  lstRad: number,
): AltAz {
  const H = lstRad - raRad; // hour angle, west-positive
  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(H);
  const alt = Math.asin(Math.min(1, Math.max(-1, sinAlt)));
  const az = Math.atan2(
    -Math.cos(decRad) * Math.sin(H),
    Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(H),
  );
  return { alt, az: normalizeRad(az) };
}

/** Unit direction in the world frame for a given alt/az. */
export function altAzToVector3(alt: number, az: number, out = new Vector3()): Vector3 {
  const c = Math.cos(alt);
  return out.set(Math.sin(az) * c, Math.sin(alt), -Math.cos(az) * c);
}

/** Unit vector of an RA/Dec direction in the equatorial cartesian frame. */
export function raDecToEquatorialVector(raRad: number, decRad: number, out = new Vector3()): Vector3 {
  const c = Math.cos(decRad);
  return out.set(c * Math.cos(raRad), c * Math.sin(raRad), Math.sin(decRad));
}

/**
 * Transforms an equatorial-frame unit vector into the world (horizon) frame
 * for observer latitude + local sidereal time. Same math as raDecToAltAz,
 * vectorized: Rz(-LST), tilt by latitude, remap axes to (east, up, -north).
 */
export function equatorialToWorld(
  v: Vector3,
  latRad: number,
  lstRad: number,
  out = new Vector3(),
): Vector3 {
  const cL = Math.cos(lstRad);
  const sL = Math.sin(lstRad);
  // Hour-angle frame: x toward the local meridian, y toward H = -6h, z to NCP.
  const x1 = v.x * cL + v.y * sL;
  const y1 = -v.x * sL + v.y * cL;
  const z1 = v.z;
  const cP = Math.cos(latRad);
  const sP = Math.sin(latRad);
  const north = -x1 * sP + z1 * cP;
  const east = y1;
  const up = x1 * cP + z1 * sP;
  return out.set(east, up, -north);
}

const _c0 = new Vector3();
const _c1 = new Vector3();
const _c2 = new Vector3();
const _m = new Matrix4();

/**
 * The one rotation applied to the star-sphere group each frame: takes points
 * stored in equatorial coordinates to their current horizon-frame positions.
 */
export function equatorialSkyQuaternion(
  latRad: number,
  lstRad: number,
  out = new Quaternion(),
): Quaternion {
  equatorialToWorld(_c0.set(1, 0, 0), latRad, lstRad, _c0);
  equatorialToWorld(_c1.set(0, 1, 0), latRad, lstRad, _c1);
  equatorialToWorld(_c2.set(0, 0, 1), latRad, lstRad, _c2);
  _m.makeBasis(_c0, _c1, _c2);
  return out.setFromRotationMatrix(_m);
}
