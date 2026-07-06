import { AnimationMixer, Group } from 'three';
import { loadGLTF } from './gltf';

export interface LoadedModel {
  object: Group;
  /** Present when the glb carries animation clips (all clips autoplay). */
  mixer: AnimationMixer | null;
}

/**
 * Shared glTF/GLB loading for user content (Blender exports): returns the
 * scene graph plus a running AnimationMixer when the file has clips.
 * Callers must advance mixers in their update loop.
 */
export async function loadModel(url: string): Promise<LoadedModel> {
  const gltf = await loadGLTF(url);
  const object = gltf.scene;
  let mixer: AnimationMixer | null = null;
  if (gltf.animations.length > 0) {
    mixer = new AnimationMixer(object);
    for (const clip of gltf.animations) mixer.clipAction(clip).play();
  }
  return { object, mixer };
}
