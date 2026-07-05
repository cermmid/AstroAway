import { PMREMGenerator, Texture, WebGLRenderer } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

/**
 * Night-sky IBL environment (CC0 HDRI from @pmndrs/assets) so PBR materials
 * get believable ambient reflections. Returns null when unavailable (the
 * scenes still have analytic lights).
 */
export async function loadNightEnvironment(
  renderer: WebGLRenderer,
): Promise<Texture | null> {
  try {
    const { default: dataUrl } = await import('@pmndrs/assets/hdri/night.exr.js');
    const exr = await new EXRLoader().loadAsync(dataUrl as string);
    const pmrem = new PMREMGenerator(renderer);
    const envMap = pmrem.fromEquirectangular(exr).texture;
    exr.dispose();
    pmrem.dispose();
    return envMap;
  } catch (err) {
    console.warn('Night environment unavailable, using analytic lights only:', err);
    return null;
  }
}
