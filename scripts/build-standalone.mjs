// Produces dist/standalone.html: the whole app in ONE self-contained file —
// the built JS bundle inlined and all runtime-fetched data (star catalog,
// knowledge base) embedded, with a fetch() shim serving it. Lets AstroAway
// run where only a single HTML file can be hosted (previews, artifacts).
// Run `npm run build` first.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const dataDir = join(root, 'public', 'data');

const assetDir = join(dist, 'assets');
// The entry chunk only — lazy chunks (e.g. the optional HDRI) are skipped;
// their dynamic imports fail gracefully in the standalone build.
const jsFile = readdirSync(assetDir).find((f) => f.startsWith('index-') && f.endsWith('.js'));
if (!jsFile) throw new Error('No entry bundle in dist/assets — run `npm run build` first.');
let bundle = readFileSync(join(assetDir, jsFile), 'utf8');
// </script> inside string literals would terminate the inline script tag.
bundle = bundle.replaceAll('</script>', '<\\/script>');

const embedJson = {
  'data/index.json': JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8')),
  'data/worlds/arcturus.json': JSON.parse(
    readFileSync(join(dataDir, 'worlds', 'arcturus.json'), 'utf8'),
  ),
  'data/stars-index.json': JSON.parse(readFileSync(join(dataDir, 'stars-index.json'), 'utf8')),
};
const starsB64 = readFileSync(join(dataDir, 'stars.bin')).toString('base64');

// Inline any .glb models referenced by worlds so GLTFLoader (which fetches
// via XHR, bypassing the fetch shim) can load them from Blob URLs.
const modelsDir = join(root, 'public', 'models');
const inlineModels = {};
for (const file of readdirSync(modelsDir)) {
  if (file.endsWith('.glb') && !file.startsWith('_')) {
    inlineModels[`models/${file}`] = readFileSync(join(modelsDir, file)).toString('base64');
  }
}

// Reuse the styles from the real index.html so the HUD looks identical.
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
const style = indexHtml.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';

const html = `<title>AstroAway</title>
${style}
<script>
  (function () {
    var EMBED_JSON = ${JSON.stringify(embedJson)};
    var STARS_B64 = ${JSON.stringify(starsB64)};
    window.__INLINE_MODELS__ = ${JSON.stringify(inlineModels)};
    var origFetch = window.fetch.bind(window);
    window.fetch = function (url, opts) {
      var key = String(url);
      if (key === 'data/stars.bin') {
        var bin = atob(STARS_B64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return Promise.resolve(new Response(bytes.buffer));
      }
      if (key in EMBED_JSON) {
        return Promise.resolve(
          new Response(JSON.stringify(EMBED_JSON[key]), {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return origFetch(url, opts);
    };
  })();
</script>
<script type="module">
${bundle}
</script>
`;

const out = join(dist, 'standalone.html');
writeFileSync(out, html);
console.log(`dist/standalone.html: ${(html.length / 1024).toFixed(0)} KB`);
