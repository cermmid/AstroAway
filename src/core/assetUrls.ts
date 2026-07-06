// Lets the single-file standalone build serve .glb models that GLTFLoader
// fetches via XHR (which our fetch() shim can't intercept). The build injects
// window.__INLINE_MODELS__ = { path: base64 }; here we hand GLTFLoader a
// data: URI, which three's FileLoader decodes in-memory with no network
// request — so it works even under the artifact's strict CSP (a blob: URL
// would be fetched over connect-src and blocked). In the normal app the map
// is absent and paths pass through unchanged.

declare global {
  interface Window {
    __INLINE_MODELS__?: Record<string, string>;
  }
}

export function resolveModelUrl(path: string): string {
  const inlined = window.__INLINE_MODELS__?.[path];
  if (!inlined) return path;
  return `data:model/gltf-binary;base64,${inlined}`;
}
