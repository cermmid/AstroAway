import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Single glTF entry point. For models the standalone build inlines
// (window.__INLINE_MODELS__ = { path: base64 }) we decode the base64 in JS
// and hand GLTFLoader a ready ArrayBuffer via parse() — no fetch(), so it
// works under the artifact's strict CSP (connect-src 'none' blocks fetch to
// http/blob/data alike). Otherwise we load from the path normally.

declare global {
  interface Window {
    __INLINE_MODELS__?: Record<string, string>;
  }
}

const loader = new GLTFLoader();

export async function loadGLTF(url: string): Promise<GLTF> {
  const inlined = window.__INLINE_MODELS__?.[url];
  if (inlined) {
    const bin = atob(inlined);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return loader.parseAsync(bytes.buffer, '');
  }
  return loader.loadAsync(url);
}
