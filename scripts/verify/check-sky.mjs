// Closes the loop between the rendered sky and the astronomy oracle:
// the in-browser alt/az of named stars must match astronomy-engine's
// Horizon() (same J2000 coords, no refraction) within 0.2 degrees.
import * as Astronomy from 'astronomy-engine';
import { FIXED, FIXED_QS, launchBrowser, openScene, startDevServer } from './browser.mjs';

const STARS = ['Arcturus', 'Vega', 'Polaris', 'Altair', 'Deneb'];
const TOLERANCE_DEG = 0.2;

const { proc, url } = await startDevServer();
const browser = await launchBrowser();
let failed = false;

try {
  const page = await openScene(browser, url, `scene=beach&${FIXED_QS}`);
  const observer = new Astronomy.Observer(FIXED.lat, FIXED.lon, 0);
  const date = new Date(FIXED.time);

  for (const name of STARS) {
    const inPage = await page.evaluate((n) => {
      const alt = window.__debug.getStarAltAz(n);
      const cat = alt ? { alt } : null;
      return cat;
    }, name);
    if (!inPage) {
      console.error(`MISSING in catalog: ${name}`);
      failed = true;
      continue;
    }
    const star = await page.evaluate((n) => {
      // Read the raw J2000 coords the app uses, to feed the oracle identically.
      return fetch('data/stars-index.json')
        .then((r) => r.json())
        .then((idx) => idx.named.find((s) => s.name === n));
    }, name);
    const oracle = Astronomy.Horizon(
      date,
      observer,
      (star.raRad * 12) / Math.PI,
      (star.decRad * 180) / Math.PI,
    );
    const dAlt = Math.abs(inPage.alt.altDeg - oracle.altitude);
    let dAz = Math.abs(inPage.alt.azDeg - oracle.azimuth) % 360;
    dAz = Math.min(dAz, 360 - dAz);
    const ok = dAlt < TOLERANCE_DEG && dAz < TOLERANCE_DEG;
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(10)} app alt=${inPage.alt.altDeg.toFixed(3)} az=${inPage.alt.azDeg.toFixed(3)} | oracle alt=${oracle.altitude.toFixed(3)} az=${oracle.azimuth.toFixed(3)} | d=${dAlt.toFixed(4)}/${dAz.toFixed(4)}`,
    );
    if (!ok) failed = true;
  }
  await page.close();
} catch (err) {
  failed = true;
  console.error('CHECK-SKY FAILED:', err);
} finally {
  await browser.close();
  proc.kill();
}
process.exit(failed ? 1 : 0);
