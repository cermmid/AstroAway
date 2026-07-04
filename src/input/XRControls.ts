import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Ray,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { InputSystem } from './InputSystem';

/**
 * XR controller pointing: a laser line per controller, trigger emits select.
 * Kept intentionally thin — everything testable lives behind InputSystem.
 */
export class XRControls {
  private controllers: Group[] = [];
  private activeIndex = 0;
  private tmpDir = new Vector3();
  private tmpPos = new Vector3();
  private tmpQuat = new Quaternion();

  constructor(
    private renderer: WebGLRenderer,
    rig: Group,
    private input: InputSystem,
  ) {
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -8], 3));
      const line = new Line(
        lineGeo,
        new LineBasicMaterial({
          color: 0x88ccff,
          transparent: true,
          opacity: 0.5,
          blending: AdditiveBlending,
        }),
      );
      line.name = 'laser';
      controller.add(line);
      const tip = new Mesh(
        new SphereGeometry(0.012, 8, 6),
        new MeshBasicMaterial({ color: 0xbfe6ff }),
      );
      controller.add(tip);
      controller.addEventListener('selectstart', () => {
        this.activeIndex = i;
        const ray = this.controllerRay(i);
        if (ray) this.input.emitSelect(ray);
      });
      rig.add(controller);
      this.controllers.push(controller);
    }
  }

  private controllerRay(i: number): Ray | null {
    const c = this.controllers[i];
    if (!c) return null;
    c.getWorldPosition(this.tmpPos);
    c.getWorldQuaternion(this.tmpQuat);
    this.tmpDir.set(0, 0, -1).applyQuaternion(this.tmpQuat);
    return new Ray(this.tmpPos.clone(), this.tmpDir.clone().normalize());
  }

  update(): void {
    if (!this.renderer.xr.isPresenting) return;
    const ray = this.controllerRay(this.activeIndex);
    if (ray) {
      if (!this.input.ray) this.input.ray = ray;
      else this.input.ray.copy(ray);
    }
  }
}
