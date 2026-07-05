// The shoreline: moonlit sand with a wet reflective band and an animated
// surf strip (wave fronts rolling in, lace foam, swash climbing the sand).
// Geometry conventions (BeachScene): ocean plane at y=-0.3, sand profile
// sandHeight(z), so the still-water line sits where the two meet (z ~ -11.7).
import {
  BufferAttribute,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { bakeSandTextures } from '../../world-gen/bakeTextures';
import { noise2 } from '../../world-gen/noise';

export const WATERLINE_Z = -11.7;

/** Sand elevation profile; bumps fade out near the surf zone. */
export function sandHeight(x: number, z: number): number {
  const slope = (z + 25) * 0.015 - 0.5;
  const bumpFade = Math.min(1, Math.max(0, (z + 4) / 14));
  const bumps = noise2(x * 0.05, z * 0.05, 7) * 0.12 * bumpFade;
  return slope + bumps;
}

const GLSL_NOISE = /* glsl */ `
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
`;

// Shared wave-front timing so surf foam and the wet-sand edge breathe together.
const GLSL_FRONTS = /* glsl */ `
  // Returns the current z of wave front i (0..2) and its life phase (0..1).
  vec2 waveFront(int i, float t, float x) {
    float fi = float(i);
    float period = 7.0 + fi * 1.7;
    float phase = fract(t / period + fi * 0.37);
    float lateral = sin(x * 0.045 + fi * 2.3) * 1.6 + sin(x * 0.013 - fi) * 2.2;
    // Sea (-34) toward the beach (-7), decelerating like a dying swash.
    float z = mix(-34.0, -7.0, 1.0 - (1.0 - phase) * (1.0 - phase)) + lateral;
    return vec2(z, phase);
  }
`;

export interface SandBuild {
  mesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
  timeUniform: { value: number };
}

// GLSL for the wet swash band, injected into MeshStandardMaterial so the
// sand keeps full PBR lighting (normal/roughness maps, IBL) plus our logic.
const GLSL_WET = /* glsl */ `
  float wetFactor(vec3 wp, float t) {
    float reach = -10.0;
    for (int i = 0; i < 3; i++) {
      vec2 f = waveFront(i, t, wp.x);
      reach = max(reach, f.x + 1.2 * (1.0 - f.y));
    }
    return smoothstep(reach + 1.2, reach - 1.4, wp.z);
  }
`;

export function buildSand(): SandBuild {
  const geo = new PlaneGeometry(500, 130, 96, 40);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    // Local z; the mesh itself is shifted +40 in world z below.
    pos.setY(i, sandHeight(pos.getX(i), pos.getZ(i) + 40));
  }
  geo.computeVertexNormals();

  const maps = bakeSandTextures();
  for (const tex of [maps.map, maps.normalMap, maps.roughnessMap]) {
    tex.repeat.set(50, 13);
    // Break the mirrored-wrap symmetry (visible as concentric arcs otherwise).
    tex.center.set(0.5, 0.5);
    tex.rotation = 0.6;
  }
  const timeUniform = { value: 0 };
  const material = new MeshStandardMaterial({ ...maps, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uSkySheen = { value: new Color('#2a5178') };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetWorldPos;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWetWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uSkySheen;
        varying vec3 vWetWorldPos;
        ${GLSL_NOISE}
        ${GLSL_FRONTS}
        ${GLSL_WET}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= 1.0 - 0.45 * wetFactor(vWetWorldPos, uTime);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 sheenViewDir = normalize(vViewPosition);
          float fres = pow(1.0 - max(dot(sheenViewDir, normal), 0.0), 3.5);
          float patches = smoothstep(0.35, 0.8, vnoise(vWetWorldPos.xz * 1.3));
          totalEmissiveRadiance +=
            uSkySheen * min(fres, 0.55) * wetFactor(vWetWorldPos, uTime) * patches * 0.4;
        }`,
      );
  };

  const mesh = new Mesh(geo, material);
  mesh.position.z = 40; // world z in [-25, 105]
  mesh.name = 'sand';
  return { mesh, timeUniform };
}

/** Transparent surf strip laid over the water/sand seam. */
export function buildSurf(): Mesh<PlaneGeometry, ShaderMaterial> {
  const geo = new PlaneGeometry(500, 40, 96, 60);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - 22; // world z in [-42, -2]
    // Hug the sand where it rises above the ocean, else float on the water.
    pos.setY(i, Math.max(-0.3 + 0.04, sandHeight(x, z) + 0.05));
  }
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
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
      varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_FRONTS}
      void main() {
        float x = vWorld.x;
        float z = vWorld.z;
        float foam = 0.0;
        for (int i = 0; i < 3; i++) {
          vec2 f = waveFront(i, uTime, x);
          float d = z - f.x; // >0: beach side of the front
          // Crest: bright narrow lip right at the front, trailing foam behind.
          float crest = smoothstep(0.9, 0.05, abs(d + 0.4));
          float trail = smoothstep(0.2, -0.8, d) * smoothstep(-6.5, -1.2, d);
          float life = 1.0 - f.y * f.y; // wave fades as it dies on the sand
          foam += (crest * 0.9 + trail * 0.45) * life;
        }
        // Persistent lace at the still-water seam.
        foam += smoothstep(2.6, 0.4, abs(z + 11.7)) * 0.3;
        // Break the foam into lace.
        float lace = vnoise(vec2(x * 0.55, z * 0.8 + uTime * 0.35));
        lace = 0.4 + 0.6 * smoothstep(0.28, 0.75, lace + 0.25 * vnoise(vec2(x, z) * 2.7));
        float a = clamp(foam, 0.0, 1.0) * lace;
        if (a < 0.02) discard;
        vec3 col = vec3(0.82, 0.9, 0.98);
        gl_FragColor = vec4(col, a * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geo, material);
  mesh.position.z = -22;
  mesh.renderOrder = 2;
  mesh.name = 'surf';
  return mesh;
}
