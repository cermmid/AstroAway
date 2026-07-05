// Runtime-baked PBR texture sets (albedo/normal/roughness) — no downloads,
// no repo assets, identical output everywhere thanks to seeded noise.
// MirroredRepeatWrapping hides that the noise isn't strictly tileable.
import { CanvasTexture, MirroredRepeatWrapping, SRGBColorSpace } from 'three';
import { fbm2, noise2 } from './noise';

export interface BakedMaps {
  map: CanvasTexture;
  normalMap: CanvasTexture;
  roughnessMap: CanvasTexture;
}

const SIZE = 512;

function makeCanvas(fill: (img: ImageData) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  fill(img);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function texture(canvas: HTMLCanvasElement, srgb: boolean): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = MirroredRepeatWrapping;
  tex.wrapT = MirroredRepeatWrapping;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tangent-space normal map from a height field (OpenGL +Y convention). */
function bakeNormal(height: Float32Array, strength: number): HTMLCanvasElement {
  return makeCanvas((img) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        const hl = height[y * SIZE + ((x - 1 + SIZE) % SIZE)];
        const hr = height[y * SIZE + ((x + 1) % SIZE)];
        const hu = height[((y - 1 + SIZE) % SIZE) * SIZE + x];
        const hd = height[((y + 1) % SIZE) * SIZE + x];
        let nx = (hl - hr) * strength;
        let ny = (hd - hu) * strength;
        const nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        const k = i * 4;
        img.data[k] = (nx * 0.5 + 0.5) * 255;
        img.data[k + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[k + 2] = (nz / len) * 0.5 * 255 + 127;
        img.data[k + 3] = 255;
      }
    }
  });
}

function bakeSet(
  height: Float32Array,
  albedo: (h: number, x: number, y: number) => [number, number, number],
  rough: (h: number, x: number, y: number) => number,
  normalStrength: number,
): BakedMaps {
  const map = makeCanvas((img) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        const [r, g, b] = albedo(height[i], x, y);
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = 255;
      }
    }
  });
  const roughness = makeCanvas((img) => {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        const v = rough(height[i], x, y) * 255;
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
    }
  });
  return {
    map: texture(map, true),
    normalMap: texture(bakeNormal(height, normalStrength), false),
    roughnessMap: texture(roughness, false),
  };
}

/** Wind-rippled beach sand with fine grain. */
export function bakeSandTextures(): BakedMaps {
  const height = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const wobble = fbm2(u * 5, v * 5, 11, 2) * 1.6;
      const ripples = Math.sin((v * 42 + wobble) * Math.PI * 2) * 0.30;
      const dunes = fbm2(u * 4, v * 4, 12, 3) * 0.55;
      const grain = noise2(u * 220, v * 220, 13) * 0.16;
      height[y * SIZE + x] = ripples + dunes + grain;
    }
  }
  return bakeSet(
    height,
    (h, x, y) => {
      const t = h * 0.5 + 0.5;
      const speck = noise2(x * 0.9, y * 0.9, 14);
      const r = 122 + t * 46 + speck * 12;
      const g = 108 + t * 40 + speck * 10;
      const b = 84 + t * 30 + speck * 8;
      return [r, g, b];
    },
    (h) => 0.86 + h * 0.06,
    5.5,
  );
}

/** Weathered coastal rock: ridged strata and cracks. */
export function bakeRockTextures(): BakedMaps {
  const height = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const base = fbm2(u * 6, v * 6, 21, 4);
      const ridged = 1 - Math.abs(fbm2(u * 11, v * 11, 22, 3)) * 2;
      const strata = Math.sin((v * 7 + base * 1.4) * Math.PI * 2) * 0.18;
      height[y * SIZE + x] = base * 0.6 + ridged * 0.3 + strata;
    }
  }
  return bakeSet(
    height,
    (h, x, y) => {
      const t = Math.min(1, Math.max(0, h * 0.5 + 0.5));
      const tint = noise2(x * 0.02, y * 0.02, 23) * 14;
      const r = 52 + t * 44 + tint;
      const g = 56 + t * 46 + tint;
      const b = 66 + t * 50 + tint * 0.6;
      return [r, g, b];
    },
    (h) => 0.78 + h * 0.1,
    7,
  );
}

/** Fibrous palm bark rings. */
export function bakeBarkTextures(): BakedMaps {
  const height = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      const rings = Math.sin(v * 34 * Math.PI) * 0.5;
      const fibers = fbm2(u * 26, v * 3, 31, 2) * 0.5;
      height[y * SIZE + x] = rings * 0.5 + fibers;
    }
  }
  return bakeSet(
    height,
    (h) => {
      const t = h * 0.5 + 0.5;
      return [58 + t * 30, 46 + t * 24, 34 + t * 18];
    },
    () => 0.9,
    4,
  );
}
