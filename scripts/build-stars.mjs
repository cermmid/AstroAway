// Compiles data-src/hyg.csv into:
//   public/data/stars.bin        Float32Array [raRad, decRad, mag, colorIndex] x N
//   public/data/stars-index.json named stars for labels/destinations/debug hooks
// Filter: apparent magnitude <= MAG_LIMIT (naked-eye sky), excluding the Sun.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAG_LIMIT = 5.5;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = join(root, 'data-src', 'hyg.csv');
const outDir = join(root, 'public', 'data');
mkdirSync(outDir, { recursive: true });

// Minimal CSV line parser handling quoted fields.
function parseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const text = readFileSync(csvPath, 'utf8');
const lines = text.split('\n');
const header = parseLine(lines[0]);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
for (const req of ['id', 'proper', 'mag', 'ci', 'rarad', 'decrad', 'con']) {
  if (!(req in col)) throw new Error(`Missing column '${req}' in HYG CSV`);
}

const stars = [];
const named = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const f = parseLine(line);
  const id = Number(f[col.id]);
  if (id === 0) continue; // the Sun
  const mag = Number(f[col.mag]);
  if (!Number.isFinite(mag) || mag > MAG_LIMIT) continue;
  const ra = Number(f[col.rarad]);
  const dec = Number(f[col.decrad]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
  const ci = Number(f[col.ci]);
  stars.push([ra, dec, mag, Number.isFinite(ci) ? ci : 0.5]);
  const proper = f[col.proper].trim();
  if (proper) {
    named.push({
      name: proper,
      hyg: id,
      raRad: ra,
      decRad: dec,
      mag,
      con: f[col.con].trim(),
    });
  }
}

stars.sort((a, b) => a[2] - b[2]); // brightest first (nicer for any future LOD cut)
const buf = new Float32Array(stars.length * 4);
stars.forEach((s, i) => buf.set(s, i * 4));
writeFileSync(join(outDir, 'stars.bin'), Buffer.from(buf.buffer));

named.sort((a, b) => a.mag - b.mag);
writeFileSync(
  join(outDir, 'stars-index.json'),
  JSON.stringify({ count: stars.length, magLimit: MAG_LIMIT, named }, null, 1),
);

const arcturus = named.find((n) => n.name === 'Arcturus');
console.log(`stars.bin: ${stars.length} stars (mag <= ${MAG_LIMIT}), ${buf.byteLength} bytes`);
console.log(`stars-index.json: ${named.length} named stars`);
console.log(
  arcturus
    ? `Arcturus OK: ra=${arcturus.raRad.toFixed(5)} dec=${arcturus.decRad.toFixed(5)} mag=${arcturus.mag}`
    : 'WARNING: Arcturus not found!',
);
