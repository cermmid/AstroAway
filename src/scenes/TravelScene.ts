import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { altAzToVector3, raDecToAltAz } from '../astro/coords';
import { localSiderealTime } from '../astro/time';
import type { AppContext } from '../core/App';
import type { World } from '../data/schema';
import { mulberry32 } from '../world-gen/noise';
import type { BaseScene } from './BaseScene';

const DEG = Math.PI / 180;
const TUNNEL_LEN = 260;
const ORIENT_END = 1.4;
const CRUISE_END = 7.0;
const FLASH_END = 7.9;

/**
 * Warp flight: the rig turns toward the destination's real position in the
 * sky (continuity with the beach), star streaks accelerate, the target star
 * grows, then a flash hands over to the world scene.
 */
export class TravelScene implements BaseScene {
  readonly id = 'travel';
  readonly scene = new Scene();

  private ctx!: AppContext;
  private streaks!: LineSegments<BufferGeometry, ShaderMaterial>;
  private destSprite!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private flash!: Mesh<SphereGeometry, MeshBasicMaterial>;
  private vignette!: Mesh;
  private world: World | null = null;
  private t = 0;
  private targetQuat = new Quaternion();
  private arrived = false;

  init(ctx: AppContext): void {
    this.ctx = ctx;
    this.scene.background = new Color(0x000005);
    this.streaks = buildStreaks();
    this.scene.add(this.streaks);

    this.destSprite = buildDestSprite();
    this.scene.add(this.destSprite);

    this.flash = new Mesh(
      new SphereGeometry(0.6, 16, 12),
      new MeshBasicMaterial({
        color: 0xe8fbff,
        side: BackSide,
        transparent: true,
        opacity: 0,
        depthTest: false,
      }),
    );
    this.flash.renderOrder = 999;
    this.flash.position.y = 1.6;
    ctx.cameraRig.add(this.flash);

    // Peripheral comfort vignette for XR (reduces vection sickness).
    this.vignette = buildVignette();
    ctx.camera.add(this.vignette);
  }

  enter(payload?: unknown): void {
    const p = payload as { world?: World } | undefined;
    this.world = p?.world ?? this.ctx.kb.getDestinations()[0] ?? null;
    this.t = 0;
    this.arrived = false;
    this.ctx.desktop.walkEnabled = false;
    this.ctx.ambience.setMode('off');
    this.streaks.material.uniforms.uOpacity.value = 0;
    this.streaks.material.uniforms.uDist.value = 0;
    this.flash.visible = true;
    (this.flash.material as MeshBasicMaterial).opacity = 0;
    this.destSprite.scale.setScalar(1);

    // Aim at where the star actually stands right now.
    const loc = this.ctx.getLocation();
    const star = this.world?.star;
    const dir = new Vector3(0, 0.3, -1).normalize();
    if (star) {
      const { alt, az } = raDecToAltAz(
        (star.raHours * Math.PI) / 12,
        star.decDeg * DEG,
        loc.latDeg * DEG,
        localSiderealTime(this.ctx.getNow(), loc.lonDeg),
      );
      altAzToVector3(alt, az, dir);
    }
    this.targetQuat.setFromRotationMatrix(
      new Matrix4().lookAt(new Vector3(0, 0, 0), dir, new Vector3(0, 1, 0)),
    );
    this.destSprite.position.copy(dir).multiplyScalar(400);
    this.destSprite.lookAt(0, 1.6, 0);
    this.vignette.visible = this.ctx.renderer.xr.isPresenting;
  }

  exit(): void {
    this.vignette.visible = false;
    this.flash.visible = false;
    (this.flash.material as MeshBasicMaterial).opacity = 0;
  }

  update(dt: number, elapsed: number): void {
    void elapsed;
    this.t += dt;
    const rig = this.ctx.cameraRig;
    const uniforms = this.streaks.material.uniforms;

    if (this.t < ORIENT_END + 1) {
      const k = Math.min(1, dt * 2.2);
      if (this.ctx.renderer.xr.isPresenting) {
        // Comfort: rotate yaw only in XR.
        const fwd = new Vector3(0, 0, -1).applyQuaternion(this.targetQuat);
        const targetYaw = Math.atan2(-fwd.x, -fwd.z);
        rig.rotation.y += (targetYaw - rig.rotation.y) * k;
      } else {
        rig.quaternion.slerp(this.targetQuat, k);
        this.ctx.camera.rotation.x *= 1 - k;
      }
    }

    // Speed profile: smooth ramp in, cruise, ease out into the flash.
    const ramp = smoothstep(ORIENT_END * 0.6, ORIENT_END + 1.6, this.t);
    const ease = 1 - smoothstep(CRUISE_END - 0.4, FLASH_END, this.t);
    const speed = ramp * ease;
    uniforms.uDist.value += speed * dt * 320;
    uniforms.uStreak.value = 2 + speed * 26;
    uniforms.uOpacity.value = Math.min(1, speed * 1.6);

    // The destination star swells as we get close.
    const approach = smoothstep(CRUISE_END - 2.2, FLASH_END - 0.2, this.t);
    this.destSprite.scale.setScalar(1 + approach * approach * 34);

    if (this.t > CRUISE_END) {
      const f = smoothstep(CRUISE_END, FLASH_END, this.t);
      (this.flash.material as MeshBasicMaterial).opacity = f;
    }
    if (this.t > FLASH_END && !this.arrived && this.world) {
      this.arrived = true;
      void this.ctx.sceneManager.goTo(`world:${this.world.id}`);
    }
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function buildStreaks(): LineSegments<BufferGeometry, ShaderMaterial> {
  const n = 1300;
  const rand = mulberry32(1234);
  const positions = new Float32Array(n * 2 * 3);
  const tails = new Float32Array(n * 2);
  const radii = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const theta = rand() * Math.PI * 2;
    const r = 2.5 + rand() * 42;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r + 1.6;
    const z = -rand() * TUNNEL_LEN;
    for (const v of [0, 1]) {
      positions[(i * 2 + v) * 3] = x;
      positions[(i * 2 + v) * 3 + 1] = y;
      positions[(i * 2 + v) * 3 + 2] = z;
      tails[i * 2 + v] = v;
      radii[i * 2 + v] = r;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('aTail', new Float32BufferAttribute(tails, 1));
  geo.setAttribute('aRadius', new Float32BufferAttribute(radii, 1));
  const material = new ShaderMaterial({
    uniforms: {
      uDist: { value: 0 },
      uStreak: { value: 2 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uDist;
      uniform float uStreak;
      attribute float aTail;
      attribute float aRadius;
      varying float vFade;
      void main() {
        vec3 p = position;
        float z = mod(p.z + uDist, ${TUNNEL_LEN.toFixed(1)}) - ${TUNNEL_LEN.toFixed(1)};
        z -= aTail * uStreak;
        p.z = z;
        vFade = (1.0 - clamp(-z / ${TUNNEL_LEN.toFixed(1)}, 0.0, 1.0))
              * (1.0 - aTail * 0.85)
              * smoothstep(2.0, 6.0, aRadius);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vFade;
      void main() {
        vec3 col = mix(vec3(0.55, 0.8, 1.0), vec3(1.0), vFade);
        gl_FragColor = vec4(col, vFade * uOpacity);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const lines = new LineSegments(geo, material);
  lines.frustumCulled = false;
  return lines;
}

function buildDestSprite(): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.15, '#cfeaff');
  grad.addColorStop(0.4, '#5fb8ff44');
  grad.addColorStop(1, '#5fb8ff00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    new PlaneGeometry(6, 6),
    new MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.renderOrder = 5;
  return mesh;
}

function buildVignette(): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const mesh = new Mesh(
    new PlaneGeometry(1.2, 1.2),
    new MeshBasicMaterial({
      map: new CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
    }),
  );
  mesh.position.z = -0.5;
  mesh.renderOrder = 998;
  mesh.visible = false;
  return mesh;
}
