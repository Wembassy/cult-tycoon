/**
 * SceneManager — Manages the Three.js scene graph for game objects.
 * Creates and updates meshes for tiles, buildings, and followers.
 * Syncs ECS Renderable components to Three.js meshes.
 */

import * as THREE from 'three';
import type { World } from '../ecs/World';
import type { TileMap } from '../world/TileMap';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';

const TERRAIN_COLORS: Record<string, number> = {
  grass: 0x4a7c3a,
  water: 0x2a5a8a,
  stone: 0x8a8a8a,
  dirt: 0x8a6a4a,
};

const TILE_SIZE = 1;
const TILE_HEIGHT = 0.1;

export class SceneManager {
  private scene: THREE.Scene;
  private tileGroup: THREE.Group;
  private entityGroup: THREE.Group;
  private tileMeshes: Map<string, THREE.Mesh> = new Map();
  private entityMeshes: Map<number, THREE.Mesh> = new Map();
  private world: World;
  private map: TileMap;

  constructor(scene: THREE.Scene, world: World, map: TileMap) {
    this.scene = scene;
    this.world = world;
    this.map = map;
    this.tileGroup = new THREE.Group();
    this.tileGroup.name = 'tiles';
    this.entityGroup = new THREE.Group();
    this.entityGroup.name = 'entities';
    this.scene.add(this.tileGroup);
    this.scene.add(this.entityGroup);
  }

  /**
   * Build tile meshes from the TileMap
   */
  buildTiles(): void {
    // Clear existing
    while (this.tileGroup.children.length > 0) {
      this.tileGroup.remove(this.tileGroup.children[0]);
    }
    this.tileMeshes.clear();

    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.getTile(x, y);
        if (!tile) continue;

        const color = TERRAIN_COLORS[tile.terrain] ?? 0x4a7c3a;
        const geom = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
        const mat = new THREE.MeshStandardMaterial({ color, flatShading: true });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x + offset.x + 0.5, 0, y + offset.z + 0.5);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.userData = { tileX: x, tileY: y };

        // Highlight occupied tiles
        if (tile.occupied) {
          mat.color.lerp(new THREE.Color(0x333333), 0.5);
        }

        this.tileGroup.add(mesh);
        this.tileMeshes.set(`${x},${y}`, mesh);
      }
    }
  }

  /**
   * Sync entity meshes from ECS Renderable components
   */
  syncEntities(): void {
    const entities = this.world.query([Transform, Renderable]);
    const seen = new Set<number>();

    for (const entity of entities) {
      const transform = this.world.getComponent(entity, Transform)!;
      const renderable = this.world.getComponent(entity, Renderable)!;

      if (!renderable.visible) continue;
      seen.add(entity);

      let mesh = this.entityMeshes.get(entity);

      if (!mesh) {
        // Create a placeholder mesh based on meshId
        mesh = this.createPlaceholderMesh(renderable.meshId);
        this.entityGroup.add(mesh);
        this.entityMeshes.set(entity, mesh);
      }

      // Update position (isometric: x -> world X, y -> world Z)
      const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
      mesh.position.set(
        transform.x + offset.x + 0.5,
        transform.z + 0.3,
        transform.y + offset.z + 0.5,
      );
      mesh.rotation.y = transform.rotation;
    }

    // Remove meshes for deleted entities
    for (const [entityId, mesh] of this.entityMeshes) {
      if (!seen.has(entityId)) {
        this.entityGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.entityMeshes.delete(entityId);
      }
    }
  }

  private createPlaceholderMesh(meshId: string): THREE.Mesh {
    let geom: THREE.BufferGeometry;
    let color = 0xcccccc;

    if (meshId.startsWith('follower')) {
      geom = new THREE.CapsuleGeometry(0.3, 0.4, 4, 8);
      color = 0xe8c8a0;
    } else if (meshId.includes('wall')) {
      geom = new THREE.BoxGeometry(0.9, 1.0, 0.9);
      color = 0x8a8a7a;
    } else if (meshId.includes('floor')) {
      geom = new THREE.BoxGeometry(0.95, 0.05, 0.95);
      color = 0x6a5a4a;
    } else if (meshId.includes('door')) {
      geom = new THREE.BoxGeometry(0.9, 0.8, 0.15);
      color = 0x5a3a2a;
    } else if (meshId.includes('tree') || meshId.includes('plant')) {
      geom = new THREE.ConeGeometry(0.4, 0.8, 6);
      color = 0x3a6a2a;
    } else {
      geom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    }

    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Highlight a tile (for cursor hover)
   */
  highlightTile(x: number, y: number): void {
    // Remove previous highlight
    for (const mesh of this.tileMeshes.values()) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0x000000);
    }

    const mesh = this.tileMeshes.get(`${x},${y}`);
    if (mesh) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(0x333322);
    }
  }

  /**
   * Get the tile mesh at a position
   */
  getTileMesh(x: number, y: number): THREE.Mesh | null {
    return this.tileMeshes.get(`${x},${y}`) ?? null;
  }

  /**
   * Clear all meshes
   */
  dispose(): void {
    this.tileMeshes.clear();
    this.entityMeshes.clear();
    this.scene.remove(this.tileGroup);
    this.scene.remove(this.entityGroup);
  }
}