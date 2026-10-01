/**
 * AssetLoader — Loads and caches GLB/glTF assets.
 * Uses SkeletonUtils for proper skinned mesh cloning.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

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
          console.log(`[AssetLoader] Loaded ${url}: ${asset.scene.children.length} children, ${asset.animations.length} animations`);
          resolve(asset);
        },
        (progress) => {
          if (progress.total) {
            console.log(`[AssetLoader] Loading ${url}: ${Math.round(progress.loaded / progress.total * 100)}%`);
          }
        },
        (err) => {
          console.warn(`[AssetLoader] Failed to load ${url}:`, err);
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
    console.log(`[AssetLoader] loadAll complete: ${results.size}/${urls.length} assets cached`);
    return results;
  }

  get(url: string): LoadedAsset | null {
    return this.cache.get(url) ?? null;
  }

  get cachedCount(): number {
    return this.cache.size;
  }

  clone(url: string): THREE.Group | null {
    const asset = this.cache.get(url);
    if (!asset) {
      console.warn(`[AssetLoader] clone() — asset not in cache: ${url}`);
      return null;
    }
    // Use SkeletonUtils.clone for proper skinned mesh support.
    // This preserves the original inverse bind matrices (IBM) from the GLB file.
    const clone = SkeletonUtils.clone(asset.scene) as THREE.Group;

    // Update world matrices so bone world transforms are current.
    // This ensures the skeleton's boneMatrices are correct without
    // overwriting the IBM (which calculateInverses() would do).
    clone.updateMatrixWorld(true);

    // Recompute the bone texture and update the skeleton in rest pose.
    // We do NOT call calculateInverses() — the IBM from the GLB file
    // is already correct and recalculating from potentially-stale bone
    // transforms can cause distortion (e.g., neck stretching).
    clone.traverse((child) => {
      if (child instanceof THREE.SkinnedMesh && child.skeleton) {
        child.skeleton.computeBoneTexture();
        child.skeleton.update();
      }
    });

    return clone;
  }

  dispose(): void {
    this.cache.clear();
    this.pending.clear();
  }
}