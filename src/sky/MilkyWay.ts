import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { raDecToEquatorialVector } from '../astro/coords';
import { mulberry32 } from '../world-gen/noise';

const DEG = Math.PI / 180;
// J2000 galactic frame anchors.
const GAL_POLE_RA = 192.85948 * DEG;
const GAL_POLE_DEC = 27.12825 * DEG;
const GAL_CENTER_RA = 266.405 * DEG;
const GAL_CENTER_DEC = -28.93617 * DEG;
const BAND_HALF_WIDTH = 22 * DEG;

/**
 * The Milky Way as a procedurally textured band on the celestial sphere,
 * oriented along the real galactic plane (bulge toward Sagittarius). Add it
 * as a child of StarField so it inherits the sky's diurnal rotation.
 */
export class MilkyWay extends Mesh<SphereGeometry, MeshBasicMaterial> {
  constructor(radius = 920) {
    const geo = new SphereGeometry(
      radius,
      96,
      24,
      0,
      Math.PI * 2,
      Math.PI / 2 - BAND_HALF_WIDTH,
      BAND_HALF_WIDTH * 2,
    );
    const texture = new CanvasTexture(makeBandTexture());
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    super(
      geo,
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        side: BackSide,
        depthWrite: false,
      }),
    );
    this.renderOrder = -1;
    this.frustumCulled = false;

    // Local frame -> equatorial: +Y to the galactic pole, +X to the galactic
    // center (SphereGeometry puts u=0.5 on local +X, where the bulge sits).
    const y = raDecToEquatorialVector(GAL_POLE_RA, GAL_POLE_DEC);
    const toCenter = raDecToEquatorialVector(GAL_CENTER_RA, GAL_CENTER_DEC);
    const x = toCenter.clone().addScaledVector(y, -toCenter.dot(y)).normalize();
    const z = new Vector3().crossVectors(x, y);
    this.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
  }
}

function makeBandTexture(): HTMLCanvasElement {
  const W = 2048;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(20260704);

  // Wrap-around blob painter so the u seam (anti-center) stays invisible.
  const blob = (x: number, y: number, r: number, color: string, alpha: number) => {
    for (const dx of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  };

  // Diffuse glow, denser and brighter toward the bulge at u=0.5. A tight
  // bright ribbon inside a wider faint halo keeps the band reading as a band.
  for (let i = 0; i < 520; i++) {
    const x = rand() * W;
    const bulge = Math.exp(-(((x - W / 2) / 340) ** 2));
    if (rand() > 0.4 + 0.6 * bulge) continue;
    const ribbon = rand() < 0.62;
    const spread = ribbon ? 26 + 22 * bulge : 70 + 40 * bulge;
    const y = H / 2 + (rand() + rand() - 1) * spread + Math.sin(x * 0.006) * 22;
    const r = ribbon ? 30 + rand() * 70 : 70 + rand() * 140;
    blob(x, y, r, 'rgba(150, 185, 240, 1)', (ribbon ? 0.06 : 0.03) + 0.05 * bulge);
  }
  // Warm core.
  for (let i = 0; i < 90; i++) {
    const x = W / 2 + (rand() + rand() - 1) * 190;
    const y = H / 2 + (rand() + rand() - 1) * 46;
    blob(x, y, 35 + rand() * 75, 'rgba(255, 226, 185, 1)', 0.07);
  }
  ctx.globalAlpha = 1;

  // Dark dust lanes meandering along the plane — subtle, they only texture
  // the glow, never carve a hole in it.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 80; i++) {
    const x = rand() * W;
    const y =
      H / 2 +
      Math.sin(x * 0.0092 + 1.3) * 24 + // integer wave count keeps the seam clean
      (rand() + rand() - 1) * 20;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(x, y, 26 + rand() * 70, 7 + rand() * 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fade the band edges vertically (roughly gaussian falloff).
  const mask = ctx.createLinearGradient(0, 0, 0, H);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.16, 'rgba(0,0,0,0.85)');
  mask.addColorStop(0.32, 'rgba(0,0,0,0.3)');
  mask.addColorStop(0.45, 'rgba(0,0,0,0)');
  mask.addColorStop(0.55, 'rgba(0,0,0,0)');
  mask.addColorStop(0.68, 'rgba(0,0,0,0.3)');
  mask.addColorStop(0.84, 'rgba(0,0,0,0.85)');
  mask.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  // Fine star dust.
  for (let i = 0; i < 1600; i++) {
    const x = rand() * W;
    const bulge = Math.exp(-(((x - W / 2) / 380) ** 2));
    const y = H / 2 + (rand() + rand() - 1) * (60 + 40 * bulge);
    ctx.globalAlpha = 0.04 + rand() * 0.12;
    ctx.fillStyle = '#dce8ff';
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
  return canvas;
}
