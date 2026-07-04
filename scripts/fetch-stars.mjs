// Downloads the HYG v4.1 star database CSV into data-src/ (gitignored).
// The compiled outputs (public/data/stars.bin, stars-index.json) are committed,
// so this only needs to run when regenerating the catalog.
// HYG database: https://github.com/astronexus/HYG-Database (CC BY-SA 4.0)
import { mkdirSync, createWriteStream } from 'node:fs';
import { get } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'data-src', 'hyg.csv');
const URLS = [
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
  'https://raw.githubusercontent.com/astronexus/HYG-Database/master/hyg/CURRENT/hygdata_v41.csv',
];

mkdirSync(join(root, 'data-src'), { recursive: true });

function download(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const file = createWriteStream(outPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

for (const url of URLS) {
  try {
    console.log(`Downloading ${url} ...`);
    await download(url);
    console.log(`Saved to ${outPath}`);
    process.exit(0);
  } catch (err) {
    console.warn(`Failed: ${err.message}`);
  }
}
console.error('All download URLs failed.');
process.exit(1);
