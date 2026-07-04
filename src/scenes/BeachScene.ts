import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  Ray,
  Scene,
  ShaderMaterial,
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
  private sand!: Mesh<PlaneGeometry, ShaderMaterial>;
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
    this.sand = buildSand();
    this.scene.add(this.sand);
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
    this.sand.material.uniforms.uTime.value = elapsed;
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
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
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
      uniform vec3 uDeep;
      uniform vec3 uRefl;
      uniform vec3 uHorizon;
      varying vec3 vWorld;
      void main() {
        vec3 p = vWorld;
        vec3 nrm = normalize(vec3(
          sin(p.x * 0.14 + uTime * 0.9) * 0.05 + sin(p.x * 0.032 + p.z * 0.02 + uTime * 0.4) * 0.09,
          1.0,
          sin(p.z * 0.18 + uTime * 1.1) * 0.05 + sin(p.z * 0.045 - uTime * 0.5) * 0.09
        ));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(nrm, viewDir), 0.0), 3.0);
        vec3 col = mix(uDeep, uRefl, fresnel);
        float dist = length(vWorld.xz - cameraPosition.xz);
        float fade = smoothstep(250.0, 1600.0, dist);
        col = mix(col, uHorizon, fade);
        float sp = sin(p.x * 1.9 + uTime * 2.1) * sin(p.z * 2.3 - uTime * 1.6);
        col += vec3(0.45, 0.65, 0.9) * pow(max(sp, 0.0), 26.0) * 0.4 * (1.0 - fade);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new Mesh(geo, material);
  mesh.position.set(0, -0.3, -1010); // spans z in [-2010, -10]
  mesh.name = 'ocean';
  return mesh;
}

