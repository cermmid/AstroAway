import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Ray,
  Raycaster,
  SRGBColorSpace,
  Vector3,
} from 'three';

export interface PanelButton {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  accent?: boolean;
}

const BG = 'rgba(6, 14, 28, 0.88)';
const BORDER = 'rgba(110, 170, 230, 0.55)';
const TEXT = '#d7e8f8';
const ACCENT = '#39c2ff';

/**
 * A world-space UI panel: an offscreen canvas rendered onto a plane. Works
 * identically for mouse and XR-controller rays; one draw call per panel.
 */
export class CanvasPanel {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  protected canvas: HTMLCanvasElement;
  protected ctx: CanvasRenderingContext2D;
  protected texture: CanvasTexture;
  protected buttons: PanelButton[] = [];
  private raycaster = new Raycaster();

  constructor(
    widthMeters: number,
    heightMeters: number,
    pxWidth = 1024,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxWidth;
    this.canvas.height = Math.round((pxWidth * heightMeters) / widthMeters);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new Mesh(
      new PlaneGeometry(widthMeters, heightMeters),
      new MeshBasicMaterial({ map: this.texture, transparent: true }),
    );
    this.mesh.renderOrder = 10;
  }

  protected clear(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = BG;
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 26);
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 3;
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 26);
    ctx.stroke();
  }

  protected drawTitle(text: string): void {
    const { ctx } = this;
    ctx.fillStyle = ACCENT;
    ctx.font = '600 52px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(text, 48, 40);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(48, 116);
    ctx.lineTo(this.canvas.width - 48, 116);
    ctx.stroke();
  }

  /** Wraps and draws text; returns the y position after the block. */
  protected drawText(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    font = '400 34px system-ui, sans-serif',
    lineHeight = 46,
    color = TEXT,
  ): number {
    const { ctx } = this;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    let line = '';
    let yy = y;
    for (const word of text.split(' ')) {
      const attempt = line ? `${line} ${word}` : word;
      if (ctx.measureText(attempt).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        yy += lineHeight;
        line = word;
      } else line = attempt;
    }
    if (line) {
      ctx.fillText(line, x, yy);
      yy += lineHeight;
    }
    return yy;
  }

  protected drawButtons(): void {
    const { ctx } = this;
    for (const b of this.buttons) {
      ctx.fillStyle = b.accent ? 'rgba(20, 90, 140, 0.9)' : 'rgba(25, 45, 75, 0.9)';
      roundRect(ctx, b.x, b.y, b.w, b.h, 14);
      ctx.fill();
      ctx.strokeStyle = b.accent ? ACCENT : BORDER;
      ctx.lineWidth = 2.5;
      roundRect(ctx, b.x, b.y, b.w, b.h, 14);
      ctx.stroke();
      ctx.fillStyle = b.accent ? '#eaf7ff' : TEXT;
      ctx.font = '600 34px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(b.label).width;
      ctx.fillText(b.label, b.x + (b.w - tw) / 2, b.y + b.h / 2 + 2);
    }
    ctx.textBaseline = 'top';
  }

  protected commit(): void {
    this.texture.needsUpdate = true;
  }

  /** World-space center of a button (for E2E tests aiming real clicks). */
  buttonWorldPos(id: string, out: Vector3): Vector3 | null {
    const b = this.buttons.find((btn) => btn.id === id);
    if (!b) return null;
    const geo = this.mesh.geometry.parameters;
    out.set(
      ((b.x + b.w / 2) / this.canvas.width - 0.5) * geo.width,
      (0.5 - (b.y + b.h / 2) / this.canvas.height) * geo.height,
      0,
    );
    this.mesh.updateWorldMatrix(true, false);
    return this.mesh.localToWorld(out);
  }

  /** Returns the button id hit by the ray, 'panel' for the body, or null. */
  hit(ray: Ray): string | null {
    if (!this.mesh.visible) return null;
    this.raycaster.ray.copy(ray);
    this.raycaster.far = 50;
    const hits = this.raycaster.intersectObject(this.mesh, false);
    if (!hits.length || !hits[0].uv) return null;
    const px = hits[0].uv.x * this.canvas.width;
    const py = (1 - hits[0].uv.y) * this.canvas.height;
    for (const b of this.buttons) {
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id;
    }
    return 'panel';
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
