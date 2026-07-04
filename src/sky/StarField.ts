import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Points,
  ShaderMaterial,
} from 'three';
import { equatorialSkyQuaternion } from '../astro/coords';
import type { StarCatalog } from './StarCatalog';

export const STAR_SPHERE_RADIUS = 900;

/**
 * The whole naked-eye sky as ONE Points draw call. Star positions are baked
 * in equatorial coordinates; diurnal motion is a single group rotation
 * (see astro/coords.equatorialSkyQuaternion).
 */
export class StarField extends Group {
  constructor(catalog: StarCatalog) {
    super();
    const n = catalog.count;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ra = catalog.data[i * 4];
      const dec = catalog.data[i * 4 + 1];
      const mag = catalog.data[i * 4 + 2];
      const bv = catalog.data[i * 4 + 3];
      const c = Math.cos(dec);
      positions[i * 3] = c * Math.cos(ra) * STAR_SPHERE_RADIUS;
      positions[i * 3 + 1] = c * Math.sin(ra) * STAR_SPHERE_RADIUS;
      positions[i * 3 + 2] = Math.sin(dec) * STAR_SPHERE_RADIUS;
      const [r, g, b] = bvToRgb(bv);
      // Dim faint stars via color: additive blending makes this act as alpha.
      const lum = Math.min(1, Math.pow(10, -0.11 * (mag - 2.2)));
      colors[i * 3] = r * lum;
      colors[i * 3 + 1] = g * lum;
      colors[i * 3 + 2] = b * lum;
      sizes[i] = Math.max(2.0, Math.min(11, 8.5 * Math.pow(10, -0.1 * mag)));
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));

    const material = new ShaderMaterial({
      uniforms: { uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aSize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d) * 2.0;
          float a = smoothstep(1.0, 0.35, r);
          gl_FragColor = vec4(vColor * a, 1.0);
        }
      `,
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const points = new Points(geo, material);
    points.frustumCulled = false;
    points.renderOrder = -1;
    this.add(points);
  }

  /** Orient the celestial sphere for the observer; call whenever time moves. */
  setOrientation(latRad: number, lstRad: number): void {
    equatorialSkyQuaternion(latRad, lstRad, this.quaternion);
  }

  setPixelScale(scale: number): void {
    const pts = this.children[0] as Points;
    (pts.material as ShaderMaterial).uniforms.uScale.value = scale;
  }
}

/** Approximate B-V color index -> linear RGB (classic piecewise fit). */
export function bvToRgb(bv: number): [number, number, number] {
  const v = Math.max(-0.4, Math.min(2.0, bv));
  let r: number;
  let g: number;
  let b: number;
  let t: number;
  if (v < 0.0) {
    t = (v + 0.4) / 0.4;
    r = 0.61 + 0.11 * t + 0.1 * t * t;
  } else if (v < 0.4) {
    t = v / 0.4;
    r = 0.83 + 0.17 * t;
  } else r = 1.0;
  if (v < 0.0) {
    t = (v + 0.4) / 0.4;
    g = 0.7 + 0.07 * t + 0.1 * t * t;
  } else if (v < 0.4) {
    t = v / 0.4;
    g = 0.87 + 0.11 * t;
  } else if (v < 1.6) {
    t = (v - 0.4) / 1.2;
    g = 0.98 - 0.16 * t;
  } else {
    t = (v - 1.6) / 0.4;
    g = 0.82 - 0.5 * t * t;
  }
  if (v < 0.4) b = 1.0;
  else if (v < 1.5) {
    t = (v - 0.4) / 1.1;
    b = 1.0 - 0.47 * t + 0.1 * t * t;
  } else {
    t = (v - 1.5) / 0.5;
    b = 0.63 - 0.6 * t * t;
  }
  return [r, g, b];
}
