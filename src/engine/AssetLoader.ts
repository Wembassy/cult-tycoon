/**
 * AssetLoader — Loads and caches GLB/glTF assets with Draco compression.
 * Falls back to primitive geometries when assets aren't available.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface LoadedAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class AssetLoader {
  private loader: GLTFLoader;
  private cache: Map<string, LoadedAsset> = new Map();
  private pending: Map<string, Promise<LoadedAsset | null>> = new Map();

  constructor() {
    this.loader = new GLTFLoader();
  }

  async load(url: string): Promise<LoadedAsset | null> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    if (this.pending.has(url)) {
      return this.pending.get(url)!;
    }

    const promise = new Promise<LoadedAsset | null>((resolve) => {
      this.loader.load(
        url,
        (gltf) => {
          const asset: LoadedAsset = {
            scene: gltf.scene,
            animations: gltf.animations,
          };
          this.cache.set(url, asset);
          this.pending.delete(url);
          resolve(asset);
        },
        undefined,
        (err) => {
          console.warn(`Failed to load asset: ${url}`, err);
          this.pending.delete(url);
          resolve(null);
        },
      );
    });

    this.pending.set(url, promise);
    return promise;
  }

  async loadAll(urls: string[]): Promise<Map<string, LoadedAsset>> {
    const results = new Map<string, LoadedAsset>();
    const promises = urls.map(async (url) => {
      const asset = await this.load(url);
      if (asset) results.set(url, asset);
    });
    await Promise.all(promises);
    return results;
  }

  get(url: string): LoadedAsset | null {
    return this.cache.get(url) ?? null;
  }

  clone(url: string): THREE.Group | null {
    const asset = this.cache.get(url);
    if (!asset) return null;
    const clone = asset.scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = (child.material as THREE.Material).clone();
      }
    });
    return clone;
  }

  dispose(): void {
    this.cache.clear();
    this.pending.clear();
  }
}