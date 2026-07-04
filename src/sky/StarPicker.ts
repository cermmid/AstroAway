import type { Ray, Vector3 } from 'three';

export interface Pickable<T> {
  /** Unit direction toward the object in world space (updated by the owner). */
  dir: Vector3;
  payload: T;
}

/**
 * Angular-distance picking for sky objects: no colliders, just
 * acos(ray . dir) against a small threshold. O(number of destinations).
 */
export class StarPicker<T> {
  constructor(
    private items: Pickable<T>[],
    private thresholdRad = (2.2 * Math.PI) / 180,
  ) {}

  pick(ray: Ray): Pickable<T> | null {
    let best: Pickable<T> | null = null;
    let bestAngle = this.thresholdRad;
    for (const item of this.items) {
      const dot = Math.min(1, Math.max(-1, ray.direction.dot(item.dir)));
      const angle = Math.acos(dot);
      if (angle < bestAngle) {
        bestAngle = angle;
        best = item;
      }
    }
    return best;
  }
}
