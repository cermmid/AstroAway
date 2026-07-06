import { AnimationMixer, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { resolveModelUrl } from './assetUrls';

export interface LoadedModel {
  object: Group;
  /** Present when the glb carries animation clips (all clips autoplay). */
  mixer: AnimationMixer | null;
}

const loader = new GLTFLoader();

/**
 * Shared glTF/GLB loading for user content (Blender exports): returns the
 * scene graph plus a running AnimationMixer when the file has clips.
 * Callers must advance mixers in their update loop.
 */
export async function loadModel(url: string): Promise<LoadedModel> {
  const gltf = await loader.loadAsync(resolveModelUrl(url));
  const object = gltf.scene;
  let mixer: AnimationMixer | null = null;
  if (gltf.animations.length > 0) {
    mixer = new AnimationMixer(object);
    for (const clip of gltf.animations) mixer.clipAction(clip).play();
  }
  return { object, mixer };
}
