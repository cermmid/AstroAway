import { PerspectiveCamera, Scene, Vector2, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Desktop post-processing: bloom + tone-mapped output. Inside an XR session
 * the caller must render directly (EffectComposer does not support WebXR,
 * and Quest-class GPUs shouldn't pay for bloom anyway).
 */
export class PostFX {
  private composer: EffectComposer;
  private renderPass: RenderPass;

  constructor(renderer: WebGLRenderer, camera: PerspectiveCamera, scene: Scene) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    const size = renderer.getSize(new Vector2());
    const bloom = new UnrealBloomPass(size, 0.65, 0.45, 0.8);
    this.composer.addPass(bloom);
    this.composer.addPass(new OutputPass());
  }

  setScene(scene: Scene): void {
    this.renderPass.scene = scene;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }
}
