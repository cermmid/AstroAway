// Determinism/introspection hooks for Playwright verification. The page
// exposes window.__debug and flips window.__appReady after the first rendered
// frame of the requested scene.

type DebugApi = Record<string, unknown>;

declare global {
  interface Window {
    __appReady?: boolean;
    __debug?: DebugApi;
  }
}

function api(): DebugApi {
  if (!window.__debug) window.__debug = {};
  return window.__debug;
}

export function registerDebug(key: string, value: unknown): void {
  api()[key] = value;
}

export function markAppReady(): void {
  window.__appReady = true;
}
