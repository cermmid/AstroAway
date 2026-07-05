import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Ray,
  Scene,
} from 'three';
import { Vector3 } from 'three';
import { altAzToVector3 } from '../astro/coords';
import type { AppContext } from '../core/App';
import { registerDebug } from '../core/debug';
import { loadModel, type LoadedModel } from '../core/models';
import { projectToScreen } from '../ui/project';
import type { World } from '../data/schema';
import { mulberry32 } from '../world-gen/noise';
import { buildAlienSky } from '../world-gen/alienSky';
import { buildAurora, buildVeins, type Animated } from '../world-gen/atmosferics';
import { buildCrystals } from '../world-gen/structures';
import { buildTerrain } from '../world-gen/terrain';
import { InfoPanel } from '../ui/InfoPanel';
import type { BaseScene } from './BaseScene';

/**
 * A fully data-driven alien world: everything visual comes from the world's
 * JSON `scene` params, so new worlds are content, not code.
 */
export class WorldScene implements BaseScene {
  readonly id: string;
  readonly scene = new Scene();

  private ctx!: AppContext;
  private crystals: InstancedMesh | null = null;
  private baseEmissive = 0.5;
  private motes: Points | null = null;
  private panel!: InfoPanel;
  private offSelect: (() => void) | null = null;
  private loadedModels: LoadedModel[] = [];
  private animated: Animated[] = [];

  constructor(private world: World) {
    this.id = `world:${world.id}`;
  }

  init(ctx: AppContext): void {
    this.ctx = ctx;
    const p = this.world.scene;

    this.scene.fog = new FogExp2(new Color(p.atmosphere.fogColor), p.atmosphere.fogDensity);
    const { group: sky, sunDir } = buildAlienSky(p.sky);
    this.scene.add(sky);

    if (p.sceneFile) {
      // Blender-authored world: the .glb replaces procedural ground/structures.
      void loadModel(p.sceneFile).then((loaded) => {
        this.loadedModels.push(loaded);
        this.scene.add(loaded.object);
      });
    } else {
      this.scene.add(buildTerrain(p.terrain));
      this.crystals = buildCrystals(p.structures, p.terrain);
      if (this.crystals) {
        this.baseEmissive = p.structures.emissiveIntensity ?? 0.5;
        this.scene.add(this.crystals);
      }
    }

    if (p.atmosphere.particles === 'motes') {
      this.motes = buildMotes(new Color(p.palette.emissive), p.terrain.seed);
      this.scene.add(this.motes);
    }
    if (p.atmosphere.aurora) {
      const aurora = buildAurora(p.atmosphere.aurora.color);
      this.animated.push(aurora);
      this.scene.add(aurora.object);
    }
    if (p.atmosphere.veins && !p.sceneFile) {
      const veins = buildVeins(p.atmosphere.veins.color, p.terrain);
      this.animated.push(veins);
      this.scene.add(veins.object);
    }

    this.scene.add(
      new HemisphereLight(new Color(p.sky.horizon), new Color(p.terrain.color), 0.75),
    );
    const sun = new DirectionalLight(new Color(p.sky.sunColor ?? '#ffffff'), 1.0);
    sun.position.copy(altAzToVector3(sunDir[0], sunDir[1]).multiplyScalar(120));
    this.scene.add(sun);

    this.panel = new InfoPanel(this.world);
    this.panel.mesh.position.set(0, 1.35, -1.9);
    this.panel.mesh.lookAt(0, 1.6, 0);
    this.scene.add(this.panel.mesh);

    // Optional user-supplied glTF/GLB props (public/models/), animations included.
    for (const m of this.world.scene.models ?? []) {
      void loadModel(m.file).then((loaded) => {
        const obj = loaded.object;
        if (m.position) obj.position.set(...m.position);
        if (m.rotationYDeg) obj.rotation.y = (m.rotationYDeg * Math.PI) / 180;
        if (m.scale) obj.scale.setScalar(m.scale);
        this.loadedModels.push(loaded);
        this.scene.add(obj);
      });
    }
  }

  enter(): void {
    this.ctx.cameraRig.position.set(0, 0, 0);
    // Arrive standing upright, facing the info panel (travel leaves the rig
    // pointed at the destination star, including pitch on desktop).
    this.ctx.cameraRig.rotation.set(0, 0, 0);
    if (!this.ctx.renderer.xr.isPresenting) this.ctx.camera.rotation.set(0, 0, 0);
    this.ctx.desktop.walkEnabled = true;
    this.ctx.ambience.setMode(this.world.scene.ambience === 'drone' ? 'drone' : 'off');
    this.ctx.hud?.setMessage(`${this.world.name} — ${this.world.star.distanceLy} ly od Ziemi`);
    this.offSelect = this.ctx.input.onSelect((ray) => this.onSelect(ray));
    // E2E hook: screen position of an info-panel button while this world is active.
    registerDebug('getPanelButtonScreenPos', (buttonId: string) => {
      const world = this.panel.buttonWorldPos(buttonId, new Vector3());
      return world ? projectToScreen(world, this.ctx.camera) : null;
    });
  }

  exit(): void {
    this.offSelect?.();
    this.offSelect = null;
    this.ctx.desktop.walkEnabled = false;
  }

  private onSelect(ray: Ray): void {
    const hit = this.panel.hit(ray);
    if (hit && hit !== 'panel' && this.panel.press(hit) === 'return') {
      void this.ctx.sceneManager.goTo('beach');
    }
  }

  update(dt: number, elapsed: number): void {
    for (const m of this.loadedModels) m.mixer?.update(dt);
    for (const a of this.animated) a.timeUniform.value = elapsed;
    if (this.crystals) {
      const mat = this.crystals.material as MeshStandardMaterial;
      // Peaks past 1.0 so the bloom pass picks the crystals up.
      mat.emissiveIntensity = this.baseEmissive * (1.3 + 0.7 * Math.sin(elapsed * 1.7));
    }
    if (this.motes) {
      const pos = this.motes.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 0.25;
        if (y > 14) y = 0;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  }
}

function buildMotes(color: Color, seed: number): Points {
  const n = 280;
  const rand = mulberry32(seed + 5);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const theta = rand() * Math.PI * 2;
    const r = 3 + rand() * 38;
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = rand() * 14;
    positions[i * 3 + 2] = Math.sin(theta) * r;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const mat = new PointsMaterial({
    color,
    size: 0.08,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
