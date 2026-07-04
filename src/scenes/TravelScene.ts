import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
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
// The streak tunnel wraps around the rider: it reaches TUNNEL_BEHIND meters
// past the camera, so looking around never reveals an end — streaks fly by
// and keep going behind you (both ends fade out instead of clipping).
const TUNNEL_LEN = 320;
const TUNNEL_BEHIND = 95;
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
  private streaks!: Mesh<BufferGeometry, ShaderMaterial>;
  private destSprite!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private flash!: Mesh<SphereGeometry, MeshBasicMaterial>;
  private vignette!: Mesh;
  private world: World | null = null;
  private t = 0;
  private targetQuat = new Quaternion();
  private arrived = false;

  init(ctx: AppContext): void {
    this.ctx = ctx;
    this.scene.background = new Color(0x02030c);
    this.streaks = buildStreaks();
    this.scene.add(this.streaks);
    this.scene.add(buildStarBackdrop());

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
    // Aim the whole tunnel down the flight direction, so looking ahead gives
    // the radial-burst view and the streaks pass by on all sides.
    this.streaks.quaternion.copy(this.targetQuat);
    this.destSprite.position.copy(dir).multiplyScalar(400).add(new Vector3(0, 1.6, 0));
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

// Reference-image palette: cyans and blues dominate, punctuated by orange
// and amber streaks; weights sum implicitly via repetition.
const STREAK_PALETTE: Array<[number, number, number]> = [
  [0.4, 0.85, 1.0],
  [0.4, 0.85, 1.0],
  [0.3, 0.55, 1.0],
  [0.3, 0.55, 1.0],
  [0.92, 0.96, 1.0],
  [1.0, 0.6, 0.22],
  [1.0, 0.6, 0.22],
  [1.0, 0.78, 0.42],
];

/**
 * Streaks as camera-facing ribbons (one indexed mesh, one draw call):
 * varied widths and colors, soft edges, tails fading out, and both tunnel
 * ends dissolving smoothly so the ride surrounds the rider.
 */
function buildStreaks(): Mesh<BufferGeometry, ShaderMaterial> {
  const n = 1200;
  const rand = mulberry32(1234);
  const positions = new Float32Array(n * 4 * 3);
  const tangents = new Float32Array(n * 4 * 2);
  const tails = new Float32Array(n * 4);
  const sides = new Float32Array(n * 4);
  const widths = new Float32Array(n * 4);
  const colors = new Float32Array(n * 4 * 3);
  const lenMuls = new Float32Array(n * 4);
  const index = new Uint32Array(n * 6);

  for (let i = 0; i < n; i++) {
    const theta = rand() * Math.PI * 2;
    const r = 3 + rand() * 46;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r; // centered; the mesh is placed at eye height
    const z = -rand() * TUNNEL_LEN;
    // Ribbon spans the tangent direction, so it always faces the tunnel axis.
    const tx = -Math.sin(theta);
    const ty = Math.cos(theta);
    // Mostly hairlines, a few thick "hero" streaks; wider when farther out.
    const w = (0.03 + rand() * rand() * rand() * 0.5) * (0.5 + r / 40);
    const c = STREAK_PALETTE[Math.floor(rand() * STREAK_PALETTE.length)];
    const glow = 0.55 + rand() * 0.65;
    const lenMul = 0.45 + rand() * 1.4;
    for (let v = 0; v < 4; v++) {
      const k = i * 4 + v;
      positions[k * 3] = x;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = z;
      tangents[k * 2] = tx;
      tangents[k * 2 + 1] = ty;
      tails[k] = v < 2 ? 0 : 1;
      sides[k] = v % 2 === 0 ? -1 : 1;
      widths[k] = w;
      colors[k * 3] = c[0] * glow;
      colors[k * 3 + 1] = c[1] * glow;
      colors[k * 3 + 2] = c[2] * glow;
      lenMuls[k] = lenMul;
    }
    const b = i * 4;
    index.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6);
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('aTangent', new Float32BufferAttribute(tangents, 2));
  geo.setAttribute('aTail', new Float32BufferAttribute(tails, 1));
  geo.setAttribute('aSide', new Float32BufferAttribute(sides, 1));
  geo.setAttribute('aWidth', new Float32BufferAttribute(widths, 1));
  geo.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  geo.setAttribute('aLenMul', new Float32BufferAttribute(lenMuls, 1));
  geo.setIndex([...index]);

  const L = TUNNEL_LEN.toFixed(1);
  const B = TUNNEL_BEHIND.toFixed(1);
  const material = new ShaderMaterial({
    uniforms: {
      uDist: { value: 0 },
      uStreak: { value: 2 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uDist;
      uniform float uStreak;
      attribute vec2 aTangent;
      attribute float aTail;
      attribute float aSide;
      attribute float aWidth;
      attribute vec3 aColor;
      attribute float aLenMul;
      varying vec3 vColor;
      varying float vT;
      varying float vEdge;
      varying float vEnv;
      void main() {
        vec3 p = position;
        // Recycle along the axis; the tunnel spans [-(LEN-BEHIND), +BEHIND].
        float head = mod(p.z + uDist, ${L}) - (${L} - ${B});
        float z = head - aTail * uStreak * aLenMul;
        // Dissolve at both ends instead of clipping.
        float far = -(${L} - ${B});
        vEnv = smoothstep(far, far + 60.0, z) * (1.0 - smoothstep(${B} - 40.0, ${B}, z));
        vec2 xy = p.xy + aTangent * aSide * aWidth;
        vColor = aColor;
        vT = aTail;
        vEdge = aSide;
        // modelMatrix carries the tunnel's flight-direction orientation.
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(xy, z, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vT;
      varying float vEdge;
      varying float vEnv;
      void main() {
        float body = pow(1.0 - vT, 1.6);          // tail fades out
        float core = 1.0 + 2.2 * pow(1.0 - vT, 9.0); // hot head
        float soft = 1.0 - vEdge * vEdge;         // soft ribbon edges
        float a = uOpacity * vEnv * body * soft;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * core, a);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geo, material);
  mesh.position.set(0, 1.6, 0); // pivot at the rider's head
  mesh.frustumCulled = false;
  return mesh;
}

/** Faint distant stars so the warp has a backdrop, as in the reference. */
function buildStarBackdrop(): Points {
  const n = 900;
  const rand = mulberry32(777);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = Math.cos(phi) * s * 480;
    positions[i * 3 + 1] = u * 480 + 1.6;
    positions[i * 3 + 2] = Math.sin(phi) * s * 480;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const points = new Points(
    geo,
    new PointsMaterial({
      color: 0x9db8de,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;
  return points;
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
