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

// In the single-file build, GLTFLoader decodes a GLB's embedded textures into
// blob: URLs and loads them via ImageBitmapLoader, which uses fetch() —
// blocked by the artifact CSP (connect-src 'none'). Disabling createImageBitmap
// forces the <img src=blob> path instead, which is governed by img-src blob:
// (allowed). Only done when models are inlined (i.e. the standalone build);
// nothing else there relies on createImageBitmap.
if (typeof window !== 'undefined' && window.__INLINE_MODELS__) {
  (window as unknown as { createImageBitmap?: unknown }).createImageBitmap = undefined;
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
