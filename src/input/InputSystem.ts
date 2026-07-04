import { Ray } from 'three';

export type SelectHandler = (ray: Ray) => void;

/**
 * Unified pointing abstraction. Desktop (mouse) and XR (controller) controls
 * both feed a world-space ray here; scenes consume hover via `ray` each frame
 * and taps/clicks via onSelect. Scenes never know which mode is active.
 */
export class InputSystem {
  /** Current pointing ray in world space, or null when nothing points. */
  ray: Ray | null = null;

  private selectHandlers = new Set<SelectHandler>();

  onSelect(handler: SelectHandler): () => void {
    this.selectHandlers.add(handler);
    return () => this.selectHandlers.delete(handler);
  }

  emitSelect(ray: Ray): void {
    for (const h of [...this.selectHandlers]) h(ray);
  }
}
