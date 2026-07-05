// A real 3D palm (no billboards): tube trunk along a leaning curve with baked
// bark textures, a crown of bent feathered fronds (alpha-cut leaf texture,
// merged into one geometry per palm) and a coconut cluster.
import {
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeBarkTextures } from './bakeTextures';
import { mulberry32 } from './noise';

let barkMaterial: MeshStandardMaterial | null = null;
let frondMaterial: MeshStandardMaterial | null = null;

function getBarkMaterial(): MeshStandardMaterial {
  if (!barkMaterial) {
    const maps = bakeBarkTextures();
    maps.map.repeat.set(2, 5);
    maps.normalMap.repeat.set(2, 5);
    maps.roughnessMap.repeat.set(2, 5);
    barkMaterial = new MeshStandardMaterial({ ...maps, roughness: 0.9 });
  }
  return barkMaterial;
}

function getFrondMaterial(): MeshStandardMaterial {
  if (!frondMaterial) {
    const tex = new CanvasTexture(makeFrondTexture());
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    frondMaterial = new MeshStandardMaterial({
      map: tex,
      alphaTest: 0.4,
      side: DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
  }
  return frondMaterial;
}

export function buildPalm(seed: number, height: number): Group {
  const rand = mulberry32(seed);
  const group = new Group();

  // Trunk along a leaning, slightly wobbly curve.
  const lean = 0.16 + rand() * 0.14;
  const points: Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    points.push(
      new Vector3(
        lean * height * t * t + (rand() - 0.5) * 0.12,
        height * t,
        (rand() - 0.5) * 0.1,
      ),
    );
  }
  const curve = new CatmullRomCurve3(points);
  const trunk = new Mesh(
    new TubeGeometry(curve, 20, 0.09 + height * 0.008, 10, false),
    getBarkMaterial(),
  );
  group.add(trunk);
  const crown = points[points.length - 1];

  // Crown of fronds, merged into one draw call.
  const frondGeos = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const len = height * (0.42 + rand() * 0.14);
    const width = len * 0.24;
    const geo = new PlaneGeometry(len, width, 12, 2);
    geo.translate(len / 2, 0, 0);
    geo.rotateX(-Math.PI / 2); // frond lies in XZ, normal up
    const pos = geo.attributes.position;
    const droop = len * (0.5 + rand() * 0.25);
    for (let v = 0; v < pos.count; v++) {
      const t = pos.getX(v) / len;
      const fold = Math.abs(pos.getZ(v)) * 0.5;
      pos.setY(v, pos.getY(v) - droop * t * t - fold);
    }
    geo.computeVertexNormals();
    const yaw = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const pitch = 0.5 - (i % 3) * 0.22 + (rand() - 0.5) * 0.12;
    geo.rotateZ(pitch);
    geo.rotateY(yaw);
    geo.translate(crown.x, crown.y, crown.z);
    frondGeos.push(geo);
  }
  const fronds = new Mesh(mergeGeometries(frondGeos), getFrondMaterial());
  group.add(fronds);

  // Coconuts.
  const nuts = new Mesh(
    new SphereGeometry(0.11, 8, 6),
    new MeshStandardMaterial({ color: 0x2b2013, roughness: 0.95 }),
  );
  nuts.position.set(crown.x, crown.y - 0.15, crown.z);
  const nuts2 = nuts.clone();
  nuts2.position.x += 0.18;
  const nuts3 = nuts.clone();
  nuts3.position.z += 0.16;
  group.add(nuts, nuts2, nuts3);

  return group;
}

/** Feathered palm leaf, drawn horizontally (length = U axis). */
function makeFrondTexture(): HTMLCanvasElement {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(55);
  const midY = H / 2;

  // Leaflets: paired angled blades with gaps, shrinking toward the tip.
  for (let x = 10; x < W - 6; x += 7) {
    const t = x / W;
    const leafLen = (1 - t * 0.75) * 105;
    const back = 26 + t * 26; // sweep toward the tip
    for (const s of [1, -1]) {
      const g = ctx.createLinearGradient(x, midY, x + back, midY + s * leafLen);
      g.addColorStop(0, '#3d5f45');
      g.addColorStop(1, '#22402c');
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.92 + rand() * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x + back, midY + s * leafLen);
      ctx.lineTo(x + back + 6.5, midY + s * (leafLen - 7));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // Central rib.
  const rib = ctx.createLinearGradient(0, 0, W, 0);
  rib.addColorStop(0, '#57614a');
  rib.addColorStop(1, '#31452f');
  ctx.strokeStyle = rib;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(W, midY);
  ctx.stroke();
  return canvas;
}
