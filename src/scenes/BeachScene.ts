import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  Ray,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  TextureLoader,
  Vector3,
} from 'three';
import { altAzToVector3, raDecToAltAz } from '../astro/coords';
import { localSiderealTime } from '../astro/time';
import type { AppContext } from '../core/App';
import { registerDebug } from '../core/debug';
import { projectToScreen } from '../ui/project';
import type { World } from '../data/schema';
import { MilkyWay } from '../sky/MilkyWay';
import { SkyDome } from '../sky/SkyDome';
import { StarField } from '../sky/StarField';
import { buildSand, buildSurf } from './beach/shore';
import { buildSilhouettes } from './beach/silhouettes';
import { StarPicker, type Pickable } from '../sky/StarPicker';
import { CanvasPanel } from '../ui/CanvasPanel';
import { StarLabel } from '../ui/StarLabel';
import type { BaseScene } from './BaseScene';

const DEG = Math.PI / 180;

interface Destination {
  world: World;
  label: StarLabel;
  raRad: number;
  decRad: number;
}

/** The home scene: night beach under the real sky, destinations selectable. */
export class BeachScene implements BaseScene {
  readonly id = 'beach';
  readonly scene = new Scene();

  private ctx!: AppContext;
  private starField!: StarField;
  private ocean!: Mesh<PlaneGeometry, ShaderMaterial>;
  private sandTime!: { value: number };
  private surf!: Mesh<PlaneGeometry, ShaderMaterial>;
  private destinations: Destination[] = [];
  private picker!: StarPicker<Destination>;
  private confirm: CanvasPanel | null = null;
  private confirmWorld: World | null = null;
  private offSelect: (() => void) | null = null;

  init(ctx: AppContext): void {
    this.ctx = ctx;
    this.scene.add(new SkyDome('#01020a', '#10294a'));
    this.starField = new StarField(ctx.catalog);
    this.starField.add(new MilkyWay());
    this.scene.add(this.starField);

    this.ocean = buildOcean();
    this.scene.add(this.ocean);
    const sand = buildSand();
    this.sandTime = sand.timeUniform;
    this.scene.add(sand.mesh);
    this.surf = buildSurf();
    this.scene.add(this.surf);
    this.scene.add(buildSilhouettes());

    // "Moonlight" without a visible moon: enough to read sand and rocks.
    this.scene.add(new HemisphereLight(0x2c4a76, 0x17120c, 0.85));
    const dir = new DirectionalLight(0xbcd4f2, 0.5);
    dir.position.set(-0.4, 1, 0.35);
    this.scene.add(dir);

    const pickables: Pickable<Destination>[] = [];
    for (const world of ctx.kb.getDestinations()) {
      const label = new StarLabel(world.star.name);
      this.scene.add(label);
      const dest: Destination = {
        world,
        label,
        raRad: (world.star.raHours * Math.PI) / 12,
        decRad: world.star.decDeg * DEG,
      };
      this.destinations.push(dest);
      pickables.push({ dir: label.dir, payload: dest });
    }
    this.picker = new StarPicker(pickables);

    // E2E hook: screen position of a confirm-dialog button (null when closed).
    registerDebug('getConfirmButtonScreenPos', (buttonId: string) => {
      if (!this.confirm) return null;
      const world = this.confirm.buttonWorldPos(buttonId, new Vector3());
      return world ? projectToScreen(world, this.ctx.camera) : null;
    });
  }

  enter(): void {
    this.ctx.desktop.walkEnabled = false;
    // A few meters up the beach: dry sand in the foreground, surf ahead.
    this.ctx.cameraRig.position.set(0, 0, 6);
    this.ctx.ambience.setMode('ocean');
    this.offSelect = this.ctx.input.onSelect((ray) => this.onSelect(ray));
    this.ctx.hud?.setLocation(this.ctx.getLocation());
  }

  exit(): void {
    this.offSelect?.();
    this.offSelect = null;
    this.closeConfirm();
  }

  private onSelect(ray: Ray): void {
    if (this.confirm) {
      const hit = this.confirm.hit(ray);
      if (hit === 'go' && this.confirmWorld) {
        const world = this.confirmWorld;
        this.closeConfirm();
        void this.ctx.sceneManager.goTo('travel', { world });
      } else if (hit !== 'panel') {
        this.closeConfirm();
      }
      return;
    }
    const picked = this.picker.pick(ray);
    if (picked) this.openConfirm(picked.payload.world);
  }

  private openConfirm(world: World): void {
    this.closeConfirm();
    const panel = new ConfirmPanel(world);
    const camPos = new Vector3();
    const camDir = new Vector3();
    this.ctx.camera.getWorldPosition(camPos);
    this.ctx.camera.getWorldDirection(camDir);
    camDir.y = Math.max(camDir.y, -0.1);
    panel.mesh.position.copy(camPos).addScaledVector(camDir.normalize(), 2.2);
    panel.mesh.lookAt(camPos);
    this.scene.add(panel.mesh);
    this.confirm = panel;
    this.confirmWorld = world;
  }

  private closeConfirm(): void {
    if (this.confirm) {
      this.scene.remove(this.confirm.mesh);
      this.confirm.dispose();
      this.confirm = null;
      this.confirmWorld = null;
    }
  }

  update(dt: number, elapsed: number): void {
    void dt;
    const loc = this.ctx.getLocation();
    const latRad = loc.latDeg * DEG;
    const lstRad = localSiderealTime(this.ctx.getNow(), loc.lonDeg);
    this.starField.setOrientation(latRad, lstRad);
    this.ocean.material.uniforms.uTime.value = elapsed;
    this.sandTime.value = elapsed;
    this.surf.material.uniforms.uTime.value = elapsed;

    const ray = this.ctx.input.ray;
    const hoveredDest = ray && !this.confirm ? this.picker.pick(ray)?.payload : null;
    for (const dest of this.destinations) {
      const { alt, az } = raDecToAltAz(dest.raRad, dest.decRad, latRad, lstRad);
      dest.label.belowHorizon = alt < 0;
      dest.label.hovered = dest === hoveredDest;
      dest.label.setDirection(altAzToVector3(alt, az));
      dest.label.update(elapsed);
    }
  }
}

class ConfirmPanel extends CanvasPanel {
  constructor(world: World) {
    super(1.0, 0.56, 900);
    this.clear();
    this.drawTitle(world.star.name);
    let y = 150;
    y = this.drawText(
      `${world.name} — ${world.star.distanceLy} lat świetlnych`,
      48,
      y,
      this.canvas.width - 96,
      '500 34px system-ui, sans-serif',
    );
    this.drawText(
      world.race.name,
      48,
      y + 4,
      this.canvas.width - 96,
      '400 30px system-ui, sans-serif',
      40,
      '#a9c4dd',
    );
    const by = this.canvas.height - 116;
    this.buttons = [
      { id: 'go', x: 48, y: by, w: 360, h: 80, label: 'Leć tam ✦', accent: true },
      { id: 'cancel', x: this.canvas.width - 328, y: by, w: 280, h: 80, label: 'Anuluj' },
    ];
    this.drawButtons();
    this.commit();
  }
}

function buildOcean(): Mesh<PlaneGeometry, ShaderMaterial> {
  // Water only seaward of the beach (z < -10) — a full-scene plane would
  // poke its wave crests up through the sand.
  const geo = new PlaneGeometry(4000, 2000, 96, 96);
  geo.rotateX(-Math.PI / 2);
  const normals = new TextureLoader().load('textures/waternormals.jpg');
  normals.wrapS = RepeatWrapping;
  normals.wrapT = RepeatWrapping;
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uNormals: { value: normals },
      uDeep: { value: new Color('#04131f') },
      uRefl: { value: new Color('#16395c') },
      uHorizon: { value: new Color('#10294a') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        // Swell dies out approaching the shoreline; the surf strip takes over.
        float deep = 1.0 - smoothstep(-42.0, -14.0, w.z);
        w.y += (sin(w.x * 0.021 + uTime * 0.6) * 0.22
              + sin(w.z * 0.017 - uTime * 0.5) * 0.18) * deep;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uNormals;
      uniform vec3 uDeep;
      uniform vec3 uRefl;
      uniform vec3 uHorizon;
      varying vec3 vWorld;
      // Classic two-layer scrolling normal map (three.js waternormals).
      vec3 waterNormal(vec2 xz) {
        vec2 n1 = texture2D(uNormals, xz * 0.06 + vec2(uTime * 0.014, uTime * 0.010)).xy * 2.0 - 1.0;
        vec2 n2 = texture2D(uNormals, xz * 0.013 - vec2(uTime * 0.007, uTime * 0.004)).xy * 2.0 - 1.0;
        return normalize(vec3(n1.x + n2.x, 2.6, n1.y + n2.y));
      }
      void main() {
        vec3 nrm = waterNormal(vWorld.xz);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(nrm, viewDir), 0.0), 3.0);
        vec3 col = mix(uDeep, uRefl, fresnel);
        float dist = length(vWorld.xz - cameraPosition.xz);
        float fade = smoothstep(250.0, 1600.0, dist);
        col = mix(col, uHorizon, fade);
        // Moon-glint sparkle off the wave facets.
        vec3 lightDir = normalize(vec3(-0.4, 0.55, 0.35));
        float glint = pow(max(dot(reflect(-lightDir, nrm), viewDir), 0.0), 60.0);
        col += vec3(0.7, 0.85, 1.0) * glint * 0.9 * (1.0 - fade);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new Mesh(geo, material);
  mesh.position.set(0, -0.3, -1010); // spans z in [-2010, -10]
  mesh.name = 'ocean';
  return mesh;
}

