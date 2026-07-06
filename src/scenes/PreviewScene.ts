import {
  Box3,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three';
import type { AppContext } from '../core/App';
import { registerDebug } from '../core/debug';
import { loadModel, type LoadedModel } from '../core/models';
import { SkyDome } from '../sky/SkyDome';
import type { BaseScene } from './BaseScene';

/**
 * Asset stage: shows a Blender export exactly as three.js renders it (same
 * tone mapping, bloom and IBL as the rest of the app). Load a model by
 * dropping a .glb onto the window, or via ?scene=preview&model=models/x.glb.
 */
export class PreviewScene implements BaseScene {
  readonly id = 'preview';
  readonly scene = new Scene();

  private ctx!: AppContext;
  private current: LoadedModel | null = null;
  private holder = new Group();
  private debugRotX = 0;
  private debugRotY = 0;
  private debugRotZ = 0;

  init(ctx: AppContext): void {
    this.ctx = ctx;
    this.scene.add(new SkyDome('#0a1322', '#20395c', 500));
    this.scene.add(new GridHelper(24, 24, 0x3a6a9a, 0x1c2f45));
    const ground = new Mesh(
      new PlaneGeometry(200, 200),
      new MeshStandardMaterial({ color: 0x141c28, roughness: 0.95 }),
    );
    ground.rotateX(-Math.PI / 2);
    ground.position.y = -0.01;
    this.scene.add(ground);

    this.scene.add(new HemisphereLight(0x8fb0d8, 0x2a2622, 1.1));
    const key = new DirectionalLight(0xfff4e0, 1.6);
    key.position.set(3, 6, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0x88b8ff, 0.7);
    rim.position.set(-4, 3, -3);
    this.scene.add(rim);

    this.scene.add(this.holder);

    const fromUrl = this.ctx.params.get('model');
    if (fromUrl) void this.show(fromUrl);
    // Optional debug rotations (degrees) to test up-axis conventions.
    this.debugRotX = parseFloat(this.ctx.params.get('rotx') ?? '0') || 0;
    this.debugRotY = parseFloat(this.ctx.params.get('roty') ?? '0') || 0;
    this.debugRotZ = parseFloat(this.ctx.params.get('rotz') ?? '0') || 0;

    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && /\.(glb|gltf)$/i.test(file.name)) {
        void this.show(URL.createObjectURL(file));
      }
    });

    registerDebug('previewInfo', () => ({
      loaded: this.current !== null,
      animated: this.current?.mixer !== null && this.current !== null,
    }));
    registerDebug('inspectModel', () => {
      if (!this.current) return null;
      const box = new Box3().setFromObject(this.current.object);
      const size = box.getSize(new Vector3());
      let tris = 0;
      let meshes = 0;
      const mats: unknown[] = [];
      this.current.object.traverse((o) => {
        const mesh = o as unknown as {
          isMesh?: boolean;
          geometry?: { index?: { count: number } | null; attributes: { position: { count: number }; uv?: unknown } };
          material?: unknown;
        };
        if (mesh.isMesh && mesh.geometry) {
          meshes++;
          const g = mesh.geometry;
          tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mm of list) {
            const m = mm as { type?: string; name?: string; color?: { getHexString(): string }; map?: unknown; emissive?: { getHexString(): string } };
            mats.push({
              type: m.type,
              name: m.name,
              color: m.color?.getHexString(),
              hasMap: !!m.map,
              hasUV: !!g.attributes.uv,
              emissive: m.emissive?.getHexString(),
            });
          }
        }
      });
      return {
        size: [size.x, size.y, size.z].map((n) => +n.toFixed(2)),
        triangles: Math.round(tris),
        meshes,
        materials: mats,
      };
    });
  }

  private async show(url: string): Promise<void> {
    try {
      const loaded = await loadModel(url);
      this.holder.clear();
      this.current = loaded;
      loaded.object.rotation.set(
        (this.debugRotX * Math.PI) / 180,
        (this.debugRotY * Math.PI) / 180,
        (this.debugRotZ * Math.PI) / 180,
      );
      // Auto-frame: keep oversized scenes graspable, lift sunk pivots.
      const box = new Box3().setFromObject(loaded.object);
      const size = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 8) loaded.object.scale.setScalar(6 / maxDim);
      const scaledBox = new Box3().setFromObject(loaded.object);
      loaded.object.position.y -= scaledBox.min.y;
      loaded.object.position.z = -Math.max(3, scaledBox.getSize(new Vector3()).length());
      this.holder.add(loaded.object);
      this.ctx.hud?.setMessage(`Podgląd załadowany (animacje: ${loaded.mixer ? 'tak' : 'brak'})`);
    } catch (err) {
      console.error('Preview load failed:', err);
      this.ctx.hud?.setMessage('Nie udało się wczytać modelu — szczegóły w konsoli.');
    }
  }

  enter(): void {
    this.ctx.desktop.walkEnabled = true;
    this.ctx.cameraRig.position.set(0, 0, 2);
    this.ctx.cameraRig.rotation.set(0, 0, 0);
    if (!this.ctx.renderer.xr.isPresenting) this.ctx.camera.rotation.set(0, 0, 0);
    this.ctx.ambience.setMode('off');
    this.ctx.hud?.setMessage('Tryb podglądu: przeciągnij plik .glb z Blendera na to okno.');
  }

  exit(): void {
    this.ctx.desktop.walkEnabled = false;
  }

  update(dt: number, elapsed: number): void {
    void elapsed;
    this.current?.mixer?.update(dt);
  }
}
