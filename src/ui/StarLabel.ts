import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';

/**
 * A selectable-destination marker on the sky: pulsing ring + name sprite,
 * positioned each frame along the star's current direction.
 */
export class StarLabel extends Group {
  readonly dir = new Vector3(0, 1, 0);
  hovered = false;
  belowHorizon = false;

  private ring: Mesh<RingGeometry, MeshBasicMaterial>;
  private sprite: Sprite;
  private baseScale: number;

  constructor(name: string, distanceMeters = 850) {
    super();
    this.baseScale = distanceMeters * 0.028;
    this.ring = new Mesh(
      new RingGeometry(0.72, 0.8, 40),
      new MeshBasicMaterial({
        color: 0x59d5ff,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    this.add(this.ring);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '600 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(60, 180, 255, 0.9)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#dff3ff';
    ctx.fillText(name, 256, 64);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(
      new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    this.sprite.scale.set(4, 1, 1);
    this.sprite.position.set(0, -1.7, 0);
    this.add(this.sprite);
    this.distance = distanceMeters;
  }

  private distance: number;

  /** Point the marker along a world direction and face the observer. */
  setDirection(dir: Vector3): void {
    this.dir.copy(dir).normalize();
    this.position.copy(this.dir).multiplyScalar(this.distance);
    this.lookAt(0, 0, 0);
    const s = this.baseScale * (this.hovered ? 1.35 : 1);
    this.scale.setScalar(s);
  }

  update(elapsed: number): void {
    const pulse = 1 + 0.08 * Math.sin(elapsed * 2.4);
    this.ring.scale.setScalar(pulse);
    const targetOpacity = this.belowHorizon ? 0.3 : this.hovered ? 1 : 0.85;
    this.ring.material.opacity = targetOpacity;
    this.sprite.material.opacity = this.belowHorizon ? 0.4 : 1;
    this.ring.material.color.setHex(this.hovered ? 0xaef0ff : 0x59d5ff);
  }
}
