import type { BaseScene } from '../scenes/BaseScene';
import type { AppContext } from './App';
import { registerDebug } from './debug';
import { Transition } from './Transition';

/**
 * Owns the scene registry and transitions. The camera rig (with camera,
 * controllers and the fade sphere) is re-parented into the active scene's
 * graph so exactly one THREE.Scene is rendered at a time.
 */
export class SceneManager {
  private scenes = new Map<string, BaseScene>();
  private initialized = new Set<string>();
  private active: BaseScene | null = null;
  private transitioning = false;
  readonly transition = new Transition();

  constructor(private ctx: AppContext) {
    ctx.cameraRig.add(this.transition.mesh);
    this.transition.mesh.position.set(0, 1.6, 0);
    registerDebug('goTo', (id: string, payload?: unknown) => this.goTo(id, payload));
  }

  register(scene: BaseScene): void {
    this.scenes.set(scene.id, scene);
  }

  get activeId(): string {
    return this.active?.id ?? 'none';
  }

  async goTo(id: string, payload?: unknown): Promise<void> {
    const next = this.scenes.get(id);
    if (!next || this.transitioning || next === this.active) return;
    this.transitioning = true;
    try {
      if (this.active) {
        this.transition.fadeOut();
        await this.waitForFade();
        this.active.exit();
      }
      if (!this.initialized.has(id)) {
        await next.init(this.ctx);
        this.initialized.add(id);
      }
      next.scene.add(this.ctx.cameraRig);
      next.enter(payload);
      this.active = next;
      registerDebug('state', id);
      this.transition.fadeIn();
      await this.waitForFade();
    } finally {
      this.transitioning = false;
    }
  }

  private waitForFade(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.transition.done) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  update(dt: number, elapsed: number): void {
    this.transition.update(dt);
    this.active?.update(dt, elapsed);
  }

  get activeScene(): BaseScene | null {
    return this.active;
  }
}
