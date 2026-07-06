// Scatters a loaded glTF model across the terrain as InstancedMeshes — one
// per sub-mesh of the source model — so hundreds of copies cost only a
// handful of draw calls. Used to place a user-supplied crystal asset in
// place of the procedural spires.
import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { loadGLTF } from '../core/gltf';
import type { StructureParams, TerrainParams } from '../data/schema';
import { mulberry32 } from './noise';
import { terrainHeight } from './terrain';

const MIN_DIST = 6;

export interface InstancedModel {
  group: Group;
  /** Materials whose emissive should pulse (for bloom). */
  glowMaterials: MeshStandardMaterial[];
  baseEmissive: number;
  /** World placements (for framing/debug). */
  placements: Vector3[];
}

export async function buildModelClusters(
  url: string,
  s: StructureParams,
  terrain: TerrainParams,
): Promise<InstancedModel> {
  const gltf = await loadGLTF(url);

  // Collect every sub-mesh with its geometry baked into the model's root frame.
  gltf.scene.updateWorldMatrix(true, true);
  const rootInv = new Matrix4().copy(gltf.scene.matrixWorld).invert();
  const parts: { geometry: BufferGeometry; material: MeshStandardMaterial }[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(new Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld));
    const mat = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ) as MeshStandardMaterial;
    parts.push({ geometry: geo, material: mat.clone() });
  });

  // Optional up-axis correction for Z-up (Blender) exports. Most models
  // (including our crystal) are already Y-up and need none.
  if (s.modelUpAxis === 'z') {
    const rot = new Matrix4().makeRotationX(-Math.PI / 2);
    for (const p of parts) p.geometry.applyMatrix4(rot);
  }

  // Drop flat display bases (a thin wide slab the crystal sits on): they
  // dominate the bounding box and turn into giant plates when scaled up.
  // Keep only the chunky part(s) — unless that would drop everything.
  if (parts.length > 1) {
    const chunky = parts.filter((p) => {
      p.geometry.computeBoundingBox();
      const sz = p.geometry.boundingBox!.getSize(new Vector3());
      return sz.y >= 0.22 * Math.max(sz.x, sz.z);
    });
    if (chunky.length > 0 && chunky.length < parts.length) {
      parts.length = 0;
      parts.push(...chunky);
    }
  }

  // Normalise so the model's base sits at y=0, it's centred in x/z, and its
  // largest extent is one unit — preserving the model's real proportions so
  // a placement scale of N gives an ~N-across formation (a flat crystal stays
  // flat, a tall one stays tall).
  const box = new Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const unit = new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
  unit.premultiply(new Matrix4().makeScale(1 / maxDim, 1 / maxDim, 1 / maxDim));
  for (const p of parts) p.geometry.applyMatrix4(unit);

  // Seeded placements (same distribution as the procedural spires).
  const rand = mulberry32(terrain.seed * 7919 + 17);
  const half = terrain.size * 0.45;
  const matrices: Matrix4[] = [];
  const placements: Vector3[] = [];
  const m = new Matrix4();
  const q = new Quaternion();
  const pos = new Vector3();
  const scl = new Vector3();
  const tiltAxis = new Vector3();
  // A few large hero formations flanking the spawn so the crystals read
  // immediately; the rest scatter across the plain.
  const heroes: Array<[number, number]> = [
    [-7, -11],
    [9, -13],
    [-11, -3],
    [11, 1],
  ];
  for (let i = 0; i < s.count; i++) {
    let x = 0;
    let z = 0;
    let h: number;
    if (i < heroes.length) {
      [x, z] = heroes[i];
      h = s.maxH * (0.8 + rand() * 0.2);
    } else {
      for (let tries = 0; tries < 8; tries++) {
        x = (rand() * 2 - 1) * half;
        z = (rand() * 2 - 1) * half;
        if (Math.hypot(x, z) > MIN_DIST) break;
      }
      // Bias toward smaller outcrops with a few large hero formations.
      const t = rand() * rand();
      h = s.minH + t * (s.maxH - s.minH);
    }
    // Native upright orientation with only a slight random lean and a random
    // spin around vertical, so the crystal stands as designed (not on its side).
    tiltAxis.set(rand() - 0.5, 0, rand() - 0.5).normalize();
    q.setFromAxisAngle(new Vector3(0, 1, 0), rand() * Math.PI * 2);
    q.premultiply(new Quaternion().setFromAxisAngle(tiltAxis, (rand() - 0.5) * 0.25));
    pos.set(x, terrainHeight(x, z, terrain) - 0.08 * h, z);
    scl.setScalar(h);
    matrices.push(m.clone().compose(pos, q, scl));
    placements.push(pos.clone());
  }

  const group = new Group();
  const glowMaterials: MeshStandardMaterial[] = [];
  const baseEmissive = s.emissiveIntensity ?? 0.5;
  for (const part of parts) {
    // Preserve the model's own textures; make it self-illuminate THROUGH its
    // texture (emissiveMap = the colour map) so the crystal reads even when
    // IBL is unavailable, without flattening the surface into solid glow.
    const mat = part.material;
    if (baseEmissive > 0 && mat.map) {
      mat.emissiveMap = mat.map;
      mat.emissive = new Color(0xffffff);
      mat.emissiveIntensity = baseEmissive;
      glowMaterials.push(mat);
    } else {
      // No glow: kill any emissive baked into the model's own materials
      // (e.g. this asset's Stone material ships with emissive white).
      mat.emissive = new Color(0x000000);
      mat.emissiveIntensity = 0;
    }
    const inst = new InstancedMesh(part.geometry, mat, matrices.length);
    matrices.forEach((m2, i) => inst.setMatrixAt(i, m2));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
  }

  // Cheap contact shadows: a soft dark disc under each crystal so it reads as
  // planted rather than floating (no real shadow maps on Quest).
  group.add(buildContactShadows(matrices, terrain));

  return { group, glowMaterials, baseEmissive, placements };
}

let shadowTexture: CanvasTexture | null = null;
function getShadowTexture(): CanvasTexture {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowTexture = new CanvasTexture(c);
  return shadowTexture;
}

function buildContactShadows(matrices: Matrix4[], terrain: TerrainParams): InstancedMesh {
  const geo = new CircleGeometry(1, 20);
  geo.rotateX(-Math.PI / 2);
  const mesh = new InstancedMesh(
    geo,
    new MeshBasicMaterial({
      map: getShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
    matrices.length,
  );
  const pos = new Vector3();
  const q = new Quaternion();
  const scl = new Vector3();
  const m = new Matrix4();
  for (let i = 0; i < matrices.length; i++) {
    matrices[i].decompose(pos, q, scl);
    const r = scl.y * 0.5; // footprint scales with crystal size
    m.compose(
      new Vector3(pos.x, terrainHeight(pos.x, pos.z, terrain) + 0.05, pos.z),
      new Quaternion(),
      new Vector3(r, 1, r),
    );
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}
