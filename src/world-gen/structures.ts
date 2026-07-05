import {
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StructureParams, TerrainParams } from '../data/schema';
import { mulberry32 } from './noise';
import { terrainHeight } from './terrain';

const MIN_DIST = 14; // keep the spawn clearing open

/** One spire plus leaning satellite shards — reads as a grown formation. */
function makeClusterGeometry(rand: () => number): BufferGeometry {
  const shards: BufferGeometry[] = [];
  const main = new OctahedronGeometry(1, 1);
  main.scale(0.22, 1, 0.22);
  main.translate(0, 1, 0);
  shards.push(main);
  const satellites = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < satellites; i++) {
    const shard = new OctahedronGeometry(1, 1);
    const h = 0.3 + rand() * 0.45;
    shard.scale(0.10 + rand() * 0.08, h, 0.10 + rand() * 0.08);
    shard.translate(0, h, 0);
    const ang = rand() * Math.PI * 2;
    const lean = 0.25 + rand() * 0.5;
    shard.rotateZ(Math.cos(ang) * lean);
    shard.rotateX(Math.sin(ang) * lean);
    shard.translate(Math.cos(ang) * (0.2 + rand() * 0.25), 0, Math.sin(ang) * (0.2 + rand() * 0.25));
    shards.push(shard);
  }
  return mergeGeometries(shards);
}

/** Seeded field of glowing crystal formations as ONE InstancedMesh draw call. */
export function buildCrystals(
  s: StructureParams,
  terrain: TerrainParams,
): InstancedMesh | null {
  if (s.kind !== 'crystals' || s.count <= 0) return null;
  const geo = makeClusterGeometry(mulberry32(terrain.seed * 31 + 5));
  const material = new MeshStandardMaterial({
    color: new Color(s.color ?? '#2a4a7a'),
    emissive: new Color(s.emissive ?? '#00e5ff'),
    emissiveIntensity: s.emissiveIntensity ?? 0.5,
    roughness: 0.35,
    metalness: 0.15,
    flatShading: true,
  });
  const mesh = new InstancedMesh(geo, material, s.count);
  const rand = mulberry32(terrain.seed * 7919 + 17);
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scale = new Vector3();
  const axis = new Vector3();
  const half = terrain.size * 0.45;
  for (let i = 0; i < s.count; i++) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 8; tries++) {
      x = (rand() * 2 - 1) * half;
      z = (rand() * 2 - 1) * half;
      if (Math.hypot(x, z) > MIN_DIST) break;
    }
    const h = s.minH + rand() * (s.maxH - s.minH);
    const y = terrainHeight(x, z, terrain) - 0.4;
    pos.set(x, y, z);
    axis.set(rand() - 0.5, 0, rand() - 0.5).normalize();
    q.setFromAxisAngle(axis, (rand() - 0.5) * 0.3);
    const footprint = h * (0.3 + rand() * 0.2);
    scale.set(footprint, h * 0.5, footprint);
    m.compose(pos, q, scale);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'crystals';
  return mesh;
}
