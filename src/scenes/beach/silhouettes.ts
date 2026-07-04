// Night silhouettes framing the left of the view: a headland descending into
// the sea and a couple of palms at the beach edge. Canvas-textured billboards
// — the user never walks on the beach, so there is no parallax to betray them.
import {
  BufferAttribute,
  CanvasTexture,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { mulberry32, noise2 } from '../../world-gen/noise';
import { sandHeight } from './shore';

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

  group.add(buildRocks());

  const palmTex = new CanvasTexture(makePalmTexture());
  palmTex.colorSpace = SRGBColorSpace;
  const palms: Array<[number, number, number, number, boolean]> = [
    // [x, z, height, lean, mirrored] — one right overhead, the rest layering depth
    [-8.5, -3, 11, 0.07, false],
    [-15, 5, 8.5, -0.05, true],
    [-26, -9, 7, 0.04, false],
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

/**
 * Real 3D rocks: a cluster at the waterline and single boulders on the sand,
 * one InstancedMesh of noise-displaced icosahedrons lit by the scene lights.
 */
function buildRocks(): InstancedMesh {
  const geo = new IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const bump = 1 + 0.32 * noise2(v.x * 1.7 + 9, v.y * 1.7 + v.z * 1.3, 3);
    v.multiplyScalar(bump);
    pos.setXYZ(i, v.x, v.y * 0.62, v.z); // squashed like surf-worn boulders
  }
  geo.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color: 0x3a4150,
    roughness: 0.82,
    metalness: 0.05,
    flatShading: true,
  });
  const placements: Array<[number, number, number]> = [
    // [x, z, radius] — a group standing in the surf to the right, loners on the sand
    [10.5, -13, 1.7],
    [12.8, -11.5, 1.1],
    [9.2, -10.8, 0.7],
    [14.5, -14.5, 0.9],
    [-6, -8.5, 0.8],
    [4.5, -2, 0.5],
    [-11.5, 1.5, 0.6],
  ];
  const mesh = new InstancedMesh(geo, material, placements.length);
  const rand = mulberry32(4242);
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  placements.forEach(([x, z, r], i) => {
    const ground = Math.min(sandHeight(x, z), -0.3);
    p.set(x, ground + r * 0.28, z);
    q.setFromAxisAngle(new Vector3(0, 1, 0), rand() * Math.PI * 2);
    s.set(r * (0.85 + rand() * 0.35), r, r * (0.85 + rand() * 0.35));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'rocks';
  return mesh;
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
  ctx.fillStyle = '#111e18'; // a hair above the sky so the crown still reads
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
  // Faint moonlit rim along the trunk's lit side.
  ctx.strokeStyle = 'rgba(150, 180, 220, 0.22)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let t = 0; t <= 1.001; t += 0.05) {
    const p = spine(t);
    const w = (14 - 9 * t) / 2;
    if (t === 0) ctx.moveTo(p.x - w, p.y);
    else ctx.lineTo(p.x - w, p.y);
  }
  ctx.stroke();
  return canvas;
}
