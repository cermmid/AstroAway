// Scatters a loaded glTF model across the terrain as InstancedMeshes — one
// per sub-mesh of the source model — so hundreds of copies cost only a
// handful of draw calls. Used to place a user-supplied crystal asset in
// place of the procedural spires.
import {
  Box3,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveModelUrl } from '../core/assetUrls';
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

const loader = new GLTFLoader();

export async function buildModelClusters(
  url: string,
  s: StructureParams,
  terrain: TerrainParams,
): Promise<InstancedModel> {
  const gltf = await loader.loadAsync(resolveModelUrl(url));

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

  // Normalise so the model's base sits at y=0, it's centred in x/z, and its
  // footprint is one unit — so a placement scale of N gives an ~N-wide
  // outcrop regardless of the source model's native units.
  const box = new Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const footprint = Math.max(size.x, size.z);
  const unit = new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
  unit.premultiply(new Matrix4().makeScale(1 / footprint, 1 / footprint, 1 / footprint));
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
    pos.set(x, terrainHeight(x, z, terrain) - 0.15 * h, z);
    tiltAxis.set(rand() - 0.5, 0, rand() - 0.5).normalize();
    q.setFromAxisAngle(tiltAxis, (rand() - 0.5) * 0.35);
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rand() * Math.PI * 2));
    scl.setScalar(h);
    matrices.push(m.clone().compose(pos, q, scl));
    placements.push(pos.clone());
  }

  // The crystalline part = the brightest material; the rest is dark rock.
  const lum = (mat: MeshStandardMaterial) => {
    const c = mat.color;
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  const brightest = Math.max(...parts.map((p) => lum(p.material)));
  const glowColor = new Color(s.emissive ?? '#00e5ff');

  const group = new Group();
  const glowMaterials: MeshStandardMaterial[] = [];
  const baseEmissive = s.emissiveIntensity ?? 0.5;
  for (const part of parts) {
    if (lum(part.material) >= brightest - 0.001) {
      // Tint the crystal toward the world's signature colour and make it glow.
      part.material.color.lerp(glowColor, 0.5);
      part.material.emissive = glowColor.clone();
      part.material.emissiveIntensity = baseEmissive;
      glowMaterials.push(part.material);
    }
    const inst = new InstancedMesh(part.geometry, part.material, matrices.length);
    matrices.forEach((mat, i) => inst.setMatrixAt(i, mat));
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
  }
  return { group, glowMaterials, baseEmissive, placements };
}
