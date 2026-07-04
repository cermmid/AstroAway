// Shared helpers: boot the Vite dev server and a headless Chromium
// (SwiftShader WebGL) for screenshot/verification scripts.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export async function startDevServer(port = 5173) {
  const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: new URL('../..', import.meta.url).pathname,
  });
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return { proc, url };
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  proc.kill();
  throw new Error('Vite dev server did not start within 30s');
}

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  for (const dir of existsSync(base) ? readdirSync(base) : []) {
    if (dir.startsWith('chromium') && !dir.includes('headless_shell')) {
      const exe = join(base, dir, 'chrome-linux', 'chrome');
      if (existsSync(exe)) return exe;
    }
  }
  return undefined; // let playwright-core resolve its own revision
}

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    executablePath: findChromium(),
    args: [
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--disable-gpu-sandbox',
      '--no-sandbox',
    ],
  });
}

export async function openScene(browser, baseUrl, query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('CONSOLE:', msg.text());
  });
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__appReady === true, { timeout: 30000 });
  await page.waitForTimeout(600); // settle transition fade
  return page;
}

// A clear northern-summer night over Warsaw with Arcturus high in the SW.
export const FIXED = {
  lat: 52.23,
  lon: 21.01,
  time: '2026-07-03T22:00:00Z',
};
export const FIXED_QS = `lat=${FIXED.lat}&lon=${FIXED.lon}&time=${encodeURIComponent(FIXED.time)}`;
