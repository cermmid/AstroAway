import { PerspectiveCamera, Vector3 } from 'three';

export interface ScreenPos {
  x: number;
  y: number;
  inFront: boolean;
}

/** Project a world-space point to CSS pixel coordinates. */
export function projectToScreen(world: Vector3, camera: PerspectiveCamera): ScreenPos {
  const v = world.clone().project(camera);
  return {
    x: ((v.x + 1) / 2) * window.innerWidth,
    y: ((1 - v.y) / 2) * window.innerHeight,
    inFront: v.z < 1,
  };
}
