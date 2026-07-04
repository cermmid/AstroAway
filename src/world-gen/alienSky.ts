import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { altAzToVector3 } from '../astro/coords';
import type { SkyParams } from '../data/schema';
import { SkyDome } from '../sky/SkyDome';

const DEG = Math.PI / 180;
const SUN_DIST = 700;

/** Alien-world sky: gradient dome + a huge low-hanging local sun disc. */
export function buildAlienSky(p: SkyParams): { group: Group; sunDir: [number, number] } {
  const group = new Group();
  group.add(new SkyDome(p.zenith, p.horizon, 800));

  const elevation = (p.sunElevationDeg ?? 10) * DEG;
  const azimuth = (p.sunAzimuthDeg ?? 180) * DEG;
  if (p.sunColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.18, p.sunColor);
    grad.addColorStop(0.45, `${p.sunColor}55`);
    grad.addColorStop(1, `${p.sunColor}00`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    // Halo extends ~3x beyond the disc itself, hence the size multiplier.
    const size = Math.tan(((p.sunAngularDeg ?? 4) * DEG) / 2) * SUN_DIST * 2 * 3.2;
    const sun = new Mesh(
      new PlaneGeometry(size, size),
      new MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    const dir = altAzToVector3(elevation, azimuth);
    sun.position.copy(dir).multiplyScalar(SUN_DIST);
    sun.lookAt(0, 0, 0);
    sun.renderOrder = -1;
    group.add(sun);
  }
  return { group, sunDir: [elevation, azimuth] };
}
