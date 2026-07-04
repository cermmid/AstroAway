import { Group, PerspectiveCamera, Raycaster, Vector2, WebGLRenderer } from 'three';
import type { InputSystem } from './InputSystem';

const CLICK_MAX_PX = 6;
const CLICK_MAX_MS = 400;
const LOOK_SPEED = 0.0035;
const WALK_SPEED = 4;
const WALK_RADIUS = 90;

/**
 * Mouse/keyboard fallback: drag to look (yaw on the rig, pitch on the
 * camera), cursor raycast feeds InputSystem.ray, short clicks emit select,
 * WASD walks when a scene enables it. Disabled while an XR session presents.
 */
export class DesktopControls {
  walkEnabled = false;

  private ndc = new Vector2(0, 0);
  private raycaster = new Raycaster();
  private dragging = false;
  private downAt = 0;
  private downPos = new Vector2();
  private moved = 0;
  private keys = new Set<string>();

  constructor(
    private renderer: WebGLRenderer,
    private camera: PerspectiveCamera,
    private rig: Group,
    private input: InputSystem,
  ) {
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.downAt = performance.now();
      this.downPos.set(e.clientX, e.clientY);
      this.moved = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      this.ndc.set((e.clientX / el.clientWidth) * 2 - 1, -(e.clientY / el.clientHeight) * 2 + 1);
      if (!this.dragging || this.isXR()) return;
      this.moved += Math.hypot(e.movementX, e.movementY);
      this.rig.rotation.y -= e.movementX * LOOK_SPEED;
      this.camera.rotation.x = Math.max(
        -1.48,
        Math.min(1.48, this.camera.rotation.x - e.movementY * LOOK_SPEED),
      );
    });
    el.addEventListener('pointerup', (e) => {
      this.dragging = false;
      const quick = performance.now() - this.downAt < CLICK_MAX_MS;
      if (quick && this.moved < CLICK_MAX_PX && !this.isXR()) {
        this.updateRay();
        if (this.input.ray) this.input.emitSelect(this.input.ray.clone());
      }
      el.releasePointerCapture(e.pointerId);
    });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private isXR(): boolean {
    return this.renderer.xr.isPresenting;
  }

  private updateRay(): void {
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.input.ray) this.input.ray = this.raycaster.ray.clone();
    else this.input.ray.copy(this.raycaster.ray);
  }

  update(dt: number): void {
    if (this.isXR()) return;
    this.updateRay();
    if (!this.walkEnabled) return;
    let fwd = 0;
    let side = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) side += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) side -= 1;
    if (!fwd && !side) return;
    const yaw = this.rig.rotation.y;
    const dx = (Math.sin(yaw) * -fwd + Math.cos(yaw) * side) * WALK_SPEED * dt;
    const dz = (Math.cos(yaw) * -fwd - Math.sin(yaw) * side) * WALK_SPEED * dt;
    this.rig.position.x += dx;
    this.rig.position.z += dz;
    const r = Math.hypot(this.rig.position.x, this.rig.position.z);
    if (r > WALK_RADIUS) {
      this.rig.position.x *= WALK_RADIUS / r;
      this.rig.position.z *= WALK_RADIUS / r;
    }
  }
}
