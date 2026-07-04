import {
  BufferAttribute,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { TerrainParams } from '../data/schema';
import { fbm2 } from './noise';

const SPAWN_FLAT_RADIUS = 9;

/** Sample the same height field used by buildTerrain (for placing objects). */
export function terrainHeight(x: number, z: number, p: TerrainParams): number {
  const h = fbm2(x * p.frequency, z * p.frequency, p.seed) * p.amplitude;
  const d = Math.hypot(x, z);
  const flatten = Math.min(1, Math.max(0, (d - SPAWN_FLAT_RADIUS) / SPAWN_FLAT_RADIUS));
  return h * flatten * flatten;
}

/** Noise-displaced, vertex-colored ground plane; spawn area flattened. */
export function buildTerrain(p: TerrainParams): Mesh {
  const segments = 128;
  const geo = new PlaneGeometry(p.size, p.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const low = new Color(p.color);
  const high = new Color(p.colorHigh ?? p.color).multiplyScalar(1.25);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z, p);
    pos.setY(i, h);
    const t = Math.min(1, Math.max(0, h / (p.amplitude * 0.8) + 0.25));
    c.copy(low).lerp(high, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
  );
  mesh.name = 'terrain';
  return mesh;
}
