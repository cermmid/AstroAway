import type { Scene } from 'three';
import type { AppContext } from '../core/App';

export interface BaseScene {
  /** Stable identifier used by SceneManager.goTo and the debug hooks. */
  readonly id: string;
  readonly scene: Scene;
  /** Called once, lazily, before the first enter(). */
  init(ctx: AppContext): void | Promise<void>;
  enter(payload?: unknown): void;
  exit(): void;
  update(dt: number, elapsed: number): void;
}
