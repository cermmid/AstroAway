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
import { bakeRockTextures } from '../../world-gen/bakeTextures';
import { mulberry32, noise2 } from '../../world-gen/noise';
import { buildPalm } from '../../world-gen/palm';
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

  // Real 3D palms replacing the old billboards.
  const palms: Array<[number, number, number, number]> = [
    // [x, z, height, seed] — one right overhead, the rest layering depth
    [-8.5, -3, 9.5, 101],
    [-15, 5, 7.5, 202],
    [-26, -9, 6.5, 303],
  ];
  for (const [x, z, h, seed] of palms) {
    const palm = buildPalm(seed, h);
    palm.position.set(x, sandHeight(x, z) - 0.15, z);
    palm.rotation.y = seed * 0.7;
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
  const maps = bakeRockTextures();
  for (const tex of [maps.map, maps.normalMap, maps.roughnessMap]) tex.repeat.set(2, 2);
  const material = new MeshStandardMaterial({
    ...maps,
    roughness: 0.85,
    metalness: 0.05,
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

