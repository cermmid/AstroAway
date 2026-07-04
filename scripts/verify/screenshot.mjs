// Screenshots every scene at a fixed time/location, then drives the full
// user flow with real mouse clicks: beach -> select Arcturus -> confirm ->
// warp -> Arcturian world -> return to beach.
import { mkdirSync } from 'node:fs';
import { FIXED_QS, launchBrowser, openScene, startDevServer } from './browser.mjs';

const outDir = new URL('../../shots/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const { proc, url } = await startDevServer();
const browser = await launchBrowser();
let failed = false;

try {
  // 1) Static shots of each scene.
  for (const [name, query] of [
    ['beach-north', `scene=beach&${FIXED_QS}`],
    ['beach-arcturus', `scene=beach&${FIXED_QS}&yaw=245&pitch=35`],
    ['beach-shore', `scene=beach&${FIXED_QS}&yaw=0&pitch=-9`],
    ['beach-west', `scene=beach&${FIXED_QS}&yaw=290&pitch=6`],
    ['beach-milkyway', `scene=beach&${FIXED_QS}&yaw=170&pitch=42`],
    ['travel', `scene=travel&${FIXED_QS}`],
    ['world-arcturus', `scene=arcturus&${FIXED_QS}`],
  ]) {
    const page = await openScene(browser, url, query);
    if (name === 'travel') await page.waitForTimeout(3500); // mid-warp
    await page.screenshot({ path: `${outDir}${name}.png` });
    console.log(`shot: ${name}.png`);
    await page.close();
  }

  // 2) Full interactive flow.
  const page = await openScene(browser, url, `scene=beach&${FIXED_QS}`);
  const star = await page.evaluate(() => window.__debug.getStarAltAz('Arcturus'));
  console.log(`Arcturus alt/az: ${star.altDeg.toFixed(1)} / ${star.azDeg.toFixed(1)}`);
  if (star.altDeg < 5) throw new Error('Arcturus below horizon at the fixed epoch?!');

  // Aim the camera at the star, then click its actual screen position.
  await page.goto(
    `${url}/?scene=beach&${FIXED_QS}&yaw=${star.azDeg.toFixed(1)}&pitch=${star.altDeg.toFixed(1)}`,
  );
  await page.waitForFunction(() => window.__appReady === true, { timeout: 30000 });
  await page.waitForTimeout(400);
  const pos = await page.evaluate(() => window.__debug.getStarScreenPos('Arcturus'));
  console.log(`Arcturus on screen: ${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}`);
  await page.mouse.click(pos.x, pos.y);
  await page.waitForFunction(() => window.__debug.getConfirmButtonScreenPos?.('go') !== null, {
    timeout: 5000,
  });
  await page.screenshot({ path: `${outDir}flow-confirm.png` });
  console.log('shot: flow-confirm.png (dialog open)');

  const go = await page.evaluate(() => window.__debug.getConfirmButtonScreenPos('go'));
  await page.mouse.click(go.x, go.y);
  await page.waitForFunction(() => window.__debug.state === 'travel', { timeout: 8000 });
  console.log('state: travel');
  await page.waitForFunction(() => window.__debug.state === 'world:arcturus', {
    timeout: 20000,
  });
  console.log('state: world:arcturus');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}flow-world.png` });
  console.log('shot: flow-world.png');

  const ret = await page.evaluate(() => window.__debug.getPanelButtonScreenPos('return'));
  await page.mouse.click(ret.x, ret.y);
  await page.waitForFunction(() => window.__debug.state === 'beach', { timeout: 8000 });
  console.log('state: beach (returned) — full flow OK');
  await page.close();
} catch (err) {
  failed = true;
  console.error('VERIFY FAILED:', err);
} finally {
  await browser.close();
  proc.kill();
}
process.exit(failed ? 1 : 0);
