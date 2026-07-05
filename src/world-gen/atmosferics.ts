// Atmospheric drama for alien worlds: animated aurora curtains and a
// bioluminescent vein network glowing through the terrain. Each is one
// additive draw call driven by a shared time uniform.
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import type { TerrainParams } from '../data/schema';
import { terrainHeight } from './terrain';

export interface Animated {
  object: Mesh | Group;
  timeUniform: { value: number };
}

/** Tall rippling light curtains hugging the horizon. */
export function buildAurora(color: string): Animated {
  const timeUniform = { value: 0 };
  const group = new Group();
  const material = new ShaderMaterial({
    uniforms: {
      uTime: timeUniform,
      uColor: { value: new Color(color) },
      uColorTop: { value: new Color(color).offsetHSL(0.16, 0, 0.05) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.x += sin(uv.y * 4.0 + uTime * 0.35 + uv.x * 9.0) * 14.0 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uColorTop;
      varying vec2 vUv;
      void main() {
        // Vertical curtain rays drifting sideways.
        float rays = 0.55 + 0.45 * sin(vUv.x * 60.0 + sin(vUv.x * 13.0 + uTime * 0.5) * 3.0);
        float body = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        float flicker = 0.8 + 0.2 * sin(uTime * 0.9 + vUv.x * 21.0);
        vec3 col = mix(uColor, uColorTop, vUv.y);
        gl_FragColor = vec4(col, rays * body * flicker * 0.4);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  // Three curtains at different bearings and distances.
  const placements: Array<[number, number, number]> = [
    // [azimuth rad, distance, width]
    [0.4, 640, 700],
    [-0.9, 700, 560],
    [2.6, 660, 620],
  ];
  for (const [az, dist, width] of placements) {
    const curtain = new Mesh(new PlaneGeometry(width, 260, 24, 8), material);
    curtain.position.set(Math.sin(az) * dist, 150, -Math.cos(az) * dist);
    curtain.lookAt(0, 120, 0);
    curtain.renderOrder = 0;
    curtain.frustumCulled = false;
    group.add(curtain);
  }
  return { object: group, timeUniform };
}

/** Glowing energy veins pulsing across the terrain surface. */
export function buildVeins(color: string, terrain: TerrainParams): Animated {
  const timeUniform = { value: 0 };
  const segments = 160;
  const geo = new PlaneGeometry(terrain.size, terrain.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i), terrain) + 0.12);
  }
  const material = new ShaderMaterial({
    uniforms: {
      uTime: timeUniform,
      uColor: { value: new Color(color) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vWorld;
      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
          mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x),
          f.y
        );
      }
      void main() {
        vec2 p = vWorld.xz * 0.055;
        float n = vnoise(p) + vnoise(p * 2.3) * 0.4;
        // Ridges of the noise field become the vein lines.
        float vein = 1.0 - smoothstep(0.0, 0.09, abs(fract(n * 1.6) - 0.5) * 0.62);
        // Energy pulses travelling along the network.
        float pulse = 0.55 + 0.45 * sin(uTime * 1.4 - n * 14.0);
        // Patchy coverage so the whole plain isn't wired.
        float region = smoothstep(0.45, 0.75, vnoise(p * 0.35 + 7.0));
        float a = vein * pulse * region;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * (0.6 + pulse), a * 0.8);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'veins';
  return { object: mesh, timeUniform };
}
