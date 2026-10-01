/**
 * Renderer — Three.js renderer wrapper with scene and camera management.
 * Includes lighting, fog, and day/night support.
 */

import * as THREE from 'three';
import { IsoCamera } from './IsoCamera';

export class Renderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private isoCamera: IsoCamera;
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 40, 100);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Lighting — brighter for visibility
    this.ambientLight = new THREE.AmbientLight(0x8899bb, 0.6);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4dd, 1.0);
    this.dirLight.position.set(15, 25, 10);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 80;
    this.dirLight.shadow.camera.left = -30;
    this.dirLight.shadow.camera.right = 30;
    this.dirLight.shadow.camera.top = 30;
    this.dirLight.shadow.camera.bottom = -30;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    // Hemisphere light for natural ambient — brighter
    const hemiLight = new THREE.HemisphereLight(0xaabbdd, 0x443322, 0.5);
    this.scene.add(hemiLight);

    this.isoCamera = new IsoCamera(canvas);

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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

  render(): void {
    this.renderer.render(this.scene, this.isoCamera.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}