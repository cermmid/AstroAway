import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';

/**
 * Inverted gradient sphere: zenith -> horizon glow -> below-horizon haze.
 * Drawn behind everything (renderOrder -2, no depth write).
 */
export class SkyDome extends Mesh<SphereGeometry, ShaderMaterial> {
  constructor(zenith: string, horizon: string, radius = 960) {
    const material = new ShaderMaterial({
      uniforms: {
        uZenith: { value: new Color(zenith) },
        uHorizon: { value: new Color(horizon) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          float up = pow(clamp(y, 0.0, 1.0), 0.45);
          vec3 sky = mix(uHorizon, uZenith, up);
          // Below the horizon fade the haze down into darkness.
          float below = clamp(-y * 6.0, 0.0, 1.0);
          sky = mix(sky, uZenith * 0.35, below);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: BackSide,
      depthWrite: false,
    });
    super(new SphereGeometry(radius, 32, 24), material);
    this.renderOrder = -2;
    this.frustumCulled = false;
  }
}
