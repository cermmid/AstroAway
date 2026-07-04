import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWorld } from '../src/data/schema';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

describe('knowledge base data', () => {
  it('index.json lists existing world files', () => {
    const index = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8'));
    expect(Array.isArray(index.worlds)).toBe(true);
    expect(index.worlds.length).toBeGreaterThan(0);
    for (const rel of index.worlds) {
      expect(() => readFileSync(join(dataDir, rel))).not.toThrow();
    }
  });

  it('every world file validates against the schema', () => {
    for (const file of readdirSync(join(dataDir, 'worlds'))) {
      const world = JSON.parse(readFileSync(join(dataDir, 'worlds', file), 'utf8'));
      expect(validateWorld(world), `${file}: ${validateWorld(world).join('; ')}`).toEqual([]);
    }
  });

  it('arcturus world matches the catalog star position', () => {
    const world = JSON.parse(readFileSync(join(dataDir, 'worlds', 'arcturus.json'), 'utf8'));
    const index = JSON.parse(readFileSync(join(dataDir, 'stars-index.json'), 'utf8'));
    const star = index.named.find((n: { name: string }) => n.name === 'Arcturus');
    expect(star).toBeTruthy();
    expect(Math.abs((world.star.raHours * Math.PI) / 12 - star.raRad)).toBeLessThan(0.001);
    expect(Math.abs((world.star.decDeg * Math.PI) / 180 - star.decRad)).toBeLessThan(0.001);
  });
});
