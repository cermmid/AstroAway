import { BackSide, Mesh, MeshBasicMaterial, SphereGeometry } from 'three';

/**
 * XR-safe fade to black: an inverted sphere around the camera rig whose
 * opacity is animated. DOM overlays do not exist inside an XR session.
 */
export class Transition {
  readonly mesh: Mesh<SphereGeometry, MeshBasicMaterial>;
  private target = 0;
  private speed = 2.5; // opacity units per second

  constructor() {
    this.mesh = new Mesh(
      new SphereGeometry(0.7, 16, 12),
      new MeshBasicMaterial({
        color: 0x000000,
        side: BackSide,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = 1000;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  fadeOut(): void {
    this.target = 1;
    this.mesh.visible = true;
  }

  fadeIn(): void {
    this.target = 0;
    this.mesh.visible = true;
  }

  get opacity(): number {
    return this.mesh.material.opacity;
  }

  get done(): boolean {
    return Math.abs(this.mesh.material.opacity - this.target) < 0.001;
  }

  update(dt: number): void {
    const m = this.mesh.material;
    const delta = this.target - m.opacity;
    if (delta === 0) {
      if (this.target === 0) this.mesh.visible = false;
      return;
    }
    const step = Math.sign(delta) * this.speed * dt;
    m.opacity = Math.abs(step) >= Math.abs(delta) ? this.target : m.opacity + step;
    if (this.target === 0 && m.opacity < 0.001) this.mesh.visible = false;
  }
}
