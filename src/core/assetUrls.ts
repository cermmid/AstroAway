// Lets the single-file standalone build serve .glb models that GLTFLoader
// fetches via XHR (which our fetch() shim can't intercept). The build injects
// window.__INLINE_MODELS__ = { path: base64 }; here we turn those into Blob
// URLs on first use. In the normal app the map is absent and paths pass through.

declare global {
  interface Window {
    __INLINE_MODELS__?: Record<string, string>;
  }
}

const blobCache = new Map<string, string>();

export function resolveModelUrl(path: string): string {
  const inlined = window.__INLINE_MODELS__?.[path];
  if (!inlined) return path;
  let url = blobCache.get(path);
  if (!url) {
    const bin = atob(inlined);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
    blobCache.set(path, url);
  }
  return url;
}
