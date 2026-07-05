import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { altAzToVector3 } from '../astro/coords';
import type { SkyParams } from '../data/schema';
import { SkyDome } from '../sky/SkyDome';
import { fbm2 } from './noise';

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

  if (p.gasGiant) group.add(buildGasGiant(p.gasGiant));

  return { group, sunDir: [elevation, azimuth] };
}

const GIANT_DIST = 650;

/** A banded planet dominating the sky, with optional tilted rings. */
function buildGasGiant(g: NonNullable<SkyParams['gasGiant']>): Group {
  const group = new Group();
  const radius = Math.tan((g.angularDeg * DEG) / 2) * GIANT_DIST;

  const tex = new CanvasTexture(makeBandedTexture(g.colorA, g.colorB));
  tex.colorSpace = SRGBColorSpace;
  const planet = new Mesh(
    new SphereGeometry(radius, 48, 32),
    new MeshBasicMaterial({ map: tex, fog: false }),
  );
  group.add(planet);

  if (g.rings) {
    const ringTex = new CanvasTexture(makeRingTexture(g.colorA));
    ringTex.colorSpace = SRGBColorSpace;
    const rings = new Mesh(
      new RingGeometry(radius * 1.35, radius * 2.3, 96),
      new MeshBasicMaterial({
        map: ringTex,
        transparent: true,
        side: DoubleSide,
        fog: false,
        depthWrite: false,
      }),
    );
    rings.rotation.x = Math.PI / 2 - 0.35;
    rings.rotation.y = 0.2;
    group.add(rings);
  }

  const dir = altAzToVector3(g.elevationDeg * DEG, g.azimuthDeg * DEG);
  group.position.copy(dir).multiplyScalar(GIANT_DIST);
  group.lookAt(0, 0, 0);
  group.renderOrder = -1;
  return group;
}

function makeBandedTexture(colorA: string, colorB: string): HTMLCanvasElement {
  const W = 512;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const a = new Color(colorA);
  const b = new Color(colorB);
  const c = new Color();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = y / H;
      // Latitude bands warped by turbulence, like Jupiter's flow.
      const turb = fbm2((x / W) * 6, v * 3, 91, 3) * 0.35;
      const band = Math.sin((v * 11 + turb) * Math.PI) * 0.5 + 0.5;
      const storm = Math.max(0, fbm2((x / W) * 9 + 40, v * 9, 92, 3)) * 0.5;
      c.copy(a).lerp(b, Math.min(1, band + storm));
      // Simple limb darkening toward the poles.
      const limb = 1 - Math.abs(v - 0.5) * 0.7;
      const i = (y * W + x) * 4;
      img.data[i] = c.r * 255 * limb;
      img.data[i + 1] = c.g * 255 * limb;
      img.data[i + 2] = c.b * 255 * limb;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function makeRingTexture(color: string): HTMLCanvasElement {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const base = new Color(color).lerp(new Color('#ffffff'), 0.45);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - S / 2) / (S / 2);
      const dy = (y - S / 2) / (S / 2);
      const r = Math.hypot(dx, dy);
      const i = (y * S + x) * 4;
      // Ring plane spans r in [~0.58, 1]; carve gaps with banded noise.
      const t = (r - 0.58) / 0.42;
      let alpha = 0;
      if (t >= 0 && t <= 1) {
        const bands = 0.55 + 0.45 * Math.sin(t * 40 + fbm2(t * 8, 0.3, 93, 2) * 3);
        const fadeIn = Math.min(1, t * 6);
        const fadeOut = Math.min(1, (1 - t) * 4);
        alpha = bands * fadeIn * fadeOut * 0.75;
      }
      img.data[i] = base.r * 255;
      img.data[i + 1] = base.g * 255;
      img.data[i + 2] = base.b * 255;
      img.data[i + 3] = alpha * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
