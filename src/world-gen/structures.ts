import {
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { StructureParams, TerrainParams } from '../data/schema';
import { mulberry32 } from './noise';
import { terrainHeight } from './terrain';

const MIN_DIST = 14; // keep the spawn clearing open

/** Seeded field of glowing crystal spires as ONE InstancedMesh draw call. */
export function buildCrystals(
  s: StructureParams,
  terrain: TerrainParams,
): InstancedMesh | null {
  if (s.kind !== 'crystals' || s.count <= 0) return null;
  const geo = new OctahedronGeometry(1, 0);
  geo.translate(0, 1, 0); // pivot at the base
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
    q.setFromAxisAngle(axis, (rand() - 0.5) * 0.35);
    scale.set(h * (0.12 + rand() * 0.1), h * 0.5, h * (0.12 + rand() * 0.1));
    m.compose(pos, q, scale);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'crystals';
  return mesh;
}
