/**
 * Renderer — Three.js renderer with post-processing pipeline.
 * EffectComposer chain: Render → Bloom → Vignette → Output
 * Lighting: ambient + directional (shadows) + hemisphere.
 * Fog and day/night support built in.
 */

import * as THREE from 'three';
import { IsoCamera } from './IsoCamera';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Custom vignette shader for cinematic darkened edges
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    offset: { value: 1.0 },
    darkness: { value: 1.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset);
      float vignette = clamp(1.0 - dot(uv, uv), 0.0, 1.0);
      vignette = pow(vignette, darkness);
      gl_FragColor = vec4(texel.rgb * vignette, texel.a);
    }
  `,
};

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private isoCamera: IsoCamera;
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private vignettePass: ShaderPass;
  private postProcessingEnabled = false;
  private qualityRatio = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x647882, 110, 230);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    // Lighting — brighter for visibility
    this.ambientLight = new THREE.AmbientLight(0xaabbd8, 0.9);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4dd, 1.15);
    this.dirLight.position.set(15, 25, 10);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 80;
    this.dirLight.shadow.camera.left = -30;
    this.dirLight.shadow.camera.right = 50;
    this.dirLight.shadow.camera.top = 50;
    this.dirLight.shadow.camera.bottom = -50;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    // Hemisphere light for natural ambient — brighter
    const hemiLight = new THREE.HemisphereLight(0xc7d8f0, 0x554433, 0.8);
    this.scene.add(hemiLight);

    this.isoCamera = new IsoCamera(canvas);

    // Post-processing pipeline
    this.composer = new EffectComposer(this.renderer);
    // Match the renderer's pixel ratio for crisp output
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.qualityRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    const renderPass = new RenderPass(this.scene, this.isoCamera.camera);
    this.composer.addPass(renderPass);

    // Bloom — subtle glow only for very bright emissive materials
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.18,
      0.25,
      0.9,
    );
    this.composer.addPass(this.bloomPass);

    // Vignette — cinematic darkened edges
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms.offset.value = 1.1;
    this.vignettePass.uniforms.darkness.value = 0.35;
    this.composer.addPass(this.vignettePass);

    // Output — applies tone mapping and color space
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.qualityRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };

  get three(): THREE.WebGLRenderer {
    return this.renderer;
  }

  get threeScene(): THREE.Scene {
    return this.scene;
  }

  get camera(): IsoCamera {
    return this.isoCamera;
  }

  get ambient(): THREE.AmbientLight {
    return this.ambientLight;
  }

  get directional(): THREE.DirectionalLight {
    return this.dirLight;
  }

  /** Bloom intensity (0 = off, 1 = default, 2 = strong glow). */
  setBloomStrength(strength: number): void {
    this.bloomPass.strength = Math.max(0, Math.min(strength, 0.4));
  }

  /** Vignette darkness (0 = none, 1 = default, 2 = heavy). */
  setVignetteDarkness(darkness: number): void {
    this.vignettePass.uniforms.darkness.value = darkness;
  }

  /** Enable/disable post-processing (for low-quality mode). */
  setPostProcessingEnabled(enabled: boolean): void {
    this.postProcessingEnabled = enabled;
  }

  render(): void {
    if (this.postProcessingEnabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.isoCamera.camera);
    }
  }

  /**
   * Set the renderer pixel ratio (for graphics quality scaling).
   */
  setPixelRatio(ratio: number): void {
    this.qualityRatio = ratio;
    const pixelRatio = Math.min(window.devicePixelRatio, 2) * ratio;
    this.renderer.setPixelRatio(pixelRatio);
    this.composer.setPixelRatio(pixelRatio);
  }

  /**
   * Set the shadow map size (for graphics quality scaling).
   */
  setShadowMapSize(size: number): void {
    this.dirLight.shadow.mapSize.width = size;
    this.dirLight.shadow.mapSize.height = size;
    this.dirLight.shadow.map?.dispose();
    this.dirLight.shadow.map = null as unknown as THREE.WebGLRenderTarget;
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
