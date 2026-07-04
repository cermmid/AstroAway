// Knowledge-base data model. Worlds/races live in public/data/worlds/*.json;
// adding a new world (e.g. Tjehoobe) means adding a JSON file and listing it
// in public/data/index.json — no code changes.

export interface StarRef {
  name: string;
  /** HYG database id, used to match the catalog for sky markers. */
  hyg?: number;
  raHours: number;
  decDeg: number;
  distanceLy: number;
  spectral?: string;
  constellation?: string;
}

export interface LoreSection {
  heading: string;
  text: string;
}

export interface RaceInfo {
  name: string;
  dimension?: string;
  appearance?: string;
  traits?: string[];
  lore: LoreSection[];
  sources?: string[];
}

export interface SkyParams {
  zenith: string;
  horizon: string;
  sunColor?: string;
  sunElevationDeg?: number;
  sunAzimuthDeg?: number;
  sunAngularDeg?: number;
}

export interface TerrainParams {
  seed: number;
  amplitude: number;
  frequency: number;
  size: number;
  color: string;
  colorHigh?: string;
}

export interface StructureParams {
  kind: 'crystals' | 'none';
  count: number;
  minH: number;
  maxH: number;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
}

export interface AtmosphereParams {
  fogColor: string;
  fogDensity: number;
  particles?: 'motes' | 'none';
}

/** User-supplied glTF/GLB model dropped into public/models/. */
export interface ModelPlacement {
  file: string;
  position?: [number, number, number];
  rotationYDeg?: number;
  scale?: number;
}

export interface WorldSceneParams {
  palette: { primary: string; secondary: string; emissive: string };
  sky: SkyParams;
  terrain: TerrainParams;
  structures: StructureParams;
  atmosphere: AtmosphereParams;
  models?: ModelPlacement[];
  ambience?: 'drone' | 'none';
}

export interface World {
  id: string;
  type: 'world';
  name: string;
  star: StarRef;
  race: RaceInfo;
  scene: WorldSceneParams;
  panel?: { title?: string; showStarFacts?: boolean };
}

export interface KnowledgeIndex {
  worlds: string[];
}

/** Returns a list of human-readable problems; empty list = valid. */
export function validateWorld(w: unknown): string[] {
  const errors: string[] = [];
  const o = w as Partial<World>;
  if (!o || typeof o !== 'object') return ['world is not an object'];
  if (!o.id) errors.push('missing id');
  if (o.type !== 'world') errors.push(`type must be 'world'`);
  if (!o.name) errors.push('missing name');
  const star = o.star as Partial<StarRef> | undefined;
  if (!star) errors.push('missing star');
  else {
    if (typeof star.raHours !== 'number') errors.push('star.raHours must be a number');
    if (typeof star.decDeg !== 'number') errors.push('star.decDeg must be a number');
    if (!star.name) errors.push('star.name missing');
  }
  const race = o.race as Partial<RaceInfo> | undefined;
  if (!race) errors.push('missing race');
  else if (!Array.isArray(race.lore) || race.lore.length === 0)
    errors.push('race.lore must be a non-empty array');
  const scene = o.scene as Partial<WorldSceneParams> | undefined;
  if (!scene) errors.push('missing scene');
  else {
    for (const key of ['palette', 'sky', 'terrain', 'structures', 'atmosphere'] as const) {
      if (!scene[key]) errors.push(`missing scene.${key}`);
    }
  }
  return errors;
}
