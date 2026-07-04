// Night silhouettes framing the left of the view: a headland descending into
// the sea and a couple of palms at the beach edge. Canvas-textured billboards
// — the user never walks on the beach, so there is no parallax to betray them.
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { mulberry32 } from '../../world-gen/noise';

export function buildSilhouettes(): Group {
  const group = new Group();

  const cliff = new Mesh(
    new PlaneGeometry(300, 70),
    billboardMaterial(makeCliffTexture()),
  );
  cliff.position.set(-190, 21, -130);
  cliff.lookAt(0, 21, 0);
  cliff.renderOrder = 1;
  group.add(cliff);

  const palmTex = new CanvasTexture(makePalmTexture());
  palmTex.colorSpace = SRGBColorSpace;
  const palms: Array<[number, number, number, number, boolean]> = [
    // [x, z, height, lean, mirrored]
    [-21, -13, 9.5, 0.06, false],
    [-30, 3, 7.5, -0.04, true],
  ];
  for (const [x, z, h, lean, mirror] of palms) {
    const mat = new MeshBasicMaterial({
      map: palmTex,
      transparent: true,
      depthWrite: false,
    });
    const palm = new Mesh(new PlaneGeometry(h * 0.75, h), mat);
    palm.position.set(x, h / 2 - 0.4, z);
    palm.lookAt(0, palm.position.y, 0);
    if (mirror) palm.scale.x = -1;
    // Local-space lean; assigning .rotation.z after lookAt() can flip the
    // plane when the quaternion's Euler form carries x/z = pi.
    palm.rotateZ(lean);
    palm.renderOrder = 3;
    group.add(palm);
  }
  return group;
}

function billboardMaterial(canvas: HTMLCanvasElement): MeshBasicMaterial {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
}

function makeCliffTexture(): HTMLCanvasElement {
  const W = 1024;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(31337);

  // Jagged ridge: tall on the left, sinking into the sea on the right.
  ctx.beginPath();
  ctx.moveTo(0, H);
  let y = 55;
  for (let x = 0; x <= W; x += 16) {
    const base = 55 + (x / W) ** 1.6 * 175; // overall descent
    y = y * 0.55 + (base + (rand() - 0.5) * 34) * 0.45;
    ctx.lineTo(x, Math.min(y, H - 12));
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = '#0a1322';
  ctx.fill();
  // Barely-there moonlit rim on the ridge line.
  ctx.strokeStyle = 'rgba(80, 110, 160, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Melt the base into the horizon haze and both ends into the sky, so the
  // billboard's rectangular edges never show.
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, H - 70, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, H - 70, W, 70);
  for (const [x0, x1] of [
    [0, 150],
    [W, W - 150],
  ]) {
    const side = ctx.createLinearGradient(x0, 0, x1, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = side;
    ctx.fillRect(Math.min(x0, x1), 0, 150, H);
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

function makePalmTexture(): HTMLCanvasElement {
  const W = 512;
  const H = 680;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b1511'; // a hair above the sky so the crown still reads
  const rand = mulberry32(97);

  // Trunk: filled tapered polygon along a gentle curve; crown near (300, 150).
  const spine = (t: number) => ({
    x: 215 + 85 * t * t,
    y: H - 10 - t * (H - 160),
  });
  ctx.beginPath();
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let t = 0; t <= 1.001; t += 0.1) {
    const p = spine(t);
    const w = (14 - 9 * t) / 2;
    left.push([p.x - w, p.y]);
    right.push([p.x + w, p.y]);
  }
  ctx.moveTo(...left[0]);
  for (const pt of left) ctx.lineTo(...pt);
  for (const pt of right.reverse()) ctx.lineTo(...pt);
  ctx.closePath();
  ctx.fill();

  // Fronds: closed, filled leaf shapes arching out and drooping at the tips.
  const crown = spine(1);
  for (let i = 0; i < 8; i++) {
    const dirX = i < 4 ? -1 : 1; // four fronds to each side
    const spreadIdx = i % 4;
    const reach = 120 + spreadIdx * 32 + rand() * 25;
    const lift = 62 - spreadIdx * 38 + rand() * 12; // top fronds rise, low droop
    const tipX = crown.x + dirX * reach;
    const tipY = crown.y - lift + spreadIdx * spreadIdx * 9;
    // Upper edge arches high, lower edge sags — the fill between reads as a frond.
    ctx.beginPath();
    ctx.moveTo(crown.x, crown.y);
    ctx.quadraticCurveTo(
      crown.x + dirX * reach * 0.45,
      crown.y - lift - 46,
      tipX,
      tipY,
    );
    ctx.quadraticCurveTo(
      crown.x + dirX * reach * 0.5,
      crown.y - lift * 0.25 + 26,
      crown.x,
      crown.y + 8,
    );
    ctx.closePath();
    ctx.fill();
    // Notches: bite into the frond edge so it silhouettes as leaflets.
    ctx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 7; k++) {
      const t = 0.25 + (k / 7) * 0.7;
      const bx = crown.x + dirX * reach * t;
      const by = crown.y - lift * Math.sin(t * Math.PI * 0.55) + spreadIdx * 6 + 14;
      ctx.beginPath();
      ctx.ellipse(bx, by + 16, 9 + rand() * 7, 15 + rand() * 9, dirX * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // Coconut cluster at the crown.
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(crown.x - 8 + i * 9, crown.y + 6, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
