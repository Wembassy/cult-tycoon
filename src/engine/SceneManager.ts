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
  water: 0x2a6a9a,
  stone: 0x9a9a9a,
  dirt: 0x8a6a4a,
};

const TERRAIN_HEIGHT: Record<string, number> = {
  grass: 0.12,
  water: 0.04,
  stone: 0.18,
  dirt: 0.10,
};

const TILE_SIZE = 1;

export class SceneManager {
  private scene: THREE.Scene;
  private tileGroup: THREE.Group;
  private entityGroup: THREE.Group;
  private highlightMesh: THREE.Mesh | null = null;
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
   * Build tile meshes from the TileMap with per-terrain heights
   */
  buildTiles(): void {
    // Clear existing
    while (this.tileGroup.children.length > 0) {
      const child = this.tileGroup.children[0];
      this.tileGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    this.tileMeshes.clear();

    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.getTile(x, y);
        if (!tile) continue;

        const color = TERRAIN_COLORS[tile.terrain] ?? 0x4a7c3a;
        const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.1;

        // Water tiles are flat and slightly transparent
        const isWater = tile.terrain === 'water';
        const geom = new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE);
        const mat = isWater
          ? new THREE.MeshStandardMaterial({
              color, transparent: true, opacity: 0.75,
              flatShading: true, roughness: 0.3, metalness: 0.1,
            })
          : new THREE.MeshStandardMaterial({
              color, flatShading: true, roughness: 0.85,
            });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x + offset.x + 0.5, height / 2, y + offset.z + 0.5);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.userData = { tileX: x, tileY: y };

        // Darken occupied tiles
        if (tile.occupied) {
          mat.color.lerp(new THREE.Color(0x333333), 0.4);
        }

        this.tileGroup.add(mesh);
        this.tileMeshes.set(`${x},${y}`, mesh);
      }
    }

    // Add a ground plane underneath for shadows
    const groundGeom = new THREE.PlaneGeometry(this.map.width + 20, this.map.height + 20);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 1 });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.tileGroup.add(ground);
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
        mesh = this.createPlaceholderMesh(renderable.meshId);
        this.entityGroup.add(mesh);
        this.entityMeshes.set(entity, mesh);
      }

      // Smooth position interpolation
      const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
      const targetX = transform.x + offset.x + 0.5;
      const targetZ = transform.y + offset.z + 0.5;
      mesh.position.x += (targetX - mesh.position.x) * 0.15;
      mesh.position.z += (targetZ - mesh.position.z) * 0.15;
      mesh.position.y = transform.z + 0.3;
      mesh.rotation.y = transform.rotation;

      // Bob animation for followers
      if (renderable.meshId.startsWith('follower')) {
        const time = performance.now() * 0.003;
        mesh.position.y += Math.sin(time + entity) * 0.05;
      }
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
      // Follower: capsule body + sphere head
      const group = new THREE.Group() as any;
      const bodyGeom = new THREE.CapsuleGeometry(0.25, 0.35, 4, 8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8c8a0, flatShading: true, roughness: 0.7 });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      body.castShadow = true;
      group.add(body);

      // Add a simple "robe" color variation
      const robeColors = [0x6b4e8e, 0x4e6b8e, 0x8e6b4e, 0x4e8e6b];
      const robeColor = robeColors[Math.floor(Math.random() * robeColors.length)];
      const robeGeom = new THREE.ConeGeometry(0.35, 0.3, 6);
      const robeMat = new THREE.MeshStandardMaterial({ color: robeColor, flatShading: true });
      const robe = new THREE.Mesh(robeGeom, robeMat);
      robe.position.y = -0.15;
      robe.castShadow = true;
      group.add(robe);

      // Return the group as a mesh-like object
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
      mesh.add(body);
      mesh.add(robe);
      mesh.castShadow = true;
      return mesh;
    } else if (meshId.includes('wall')) {
      geom = new THREE.BoxGeometry(0.9, 1.2, 0.9);
      color = 0x8a8a7a;
    } else if (meshId.includes('floor')) {
      geom = new THREE.BoxGeometry(0.95, 0.06, 0.95);
      color = 0x6a5a4a;
    } else if (meshId.includes('door')) {
      geom = new THREE.BoxGeometry(0.9, 0.9, 0.15);
      color = 0x5a3a2a;
    } else if (meshId.includes('tree') || meshId.includes('plant')) {
      geom = new THREE.ConeGeometry(0.4, 0.8, 6);
      color = 0x3a6a2a;
    } else if (meshId.includes('bed')) {
      geom = new THREE.BoxGeometry(0.8, 0.25, 0.5);
      color = 0x8b6c5a;
    } else if (meshId.includes('altar')) {
      geom = new THREE.BoxGeometry(0.8, 0.6, 0.4);
      color = 0x6b4e8e;
    } else if (meshId.includes('cookpot')) {
      geom = new THREE.CylinderGeometry(0.3, 0.25, 0.35, 8);
      color = 0x4a4a4a;
    } else if (meshId.includes('desk')) {
      geom = new THREE.BoxGeometry(0.7, 0.5, 0.4);
      color = 0x6a5a3a;
    } else if (meshId.includes('box') || meshId.includes('storage')) {
      geom = new THREE.BoxGeometry(0.6, 0.5, 0.6);
      color = 0x8a6a4a;
    } else if (meshId.includes('torch')) {
      geom = new THREE.CylinderGeometry(0.08, 0.06, 0.6, 6);
      color = 0x5a3a1a;
    } else if (meshId.includes('bowl')) {
      geom = new THREE.CylinderGeometry(0.2, 0.15, 0.12, 8);
      color = 0xaa8855;
    } else if (meshId.includes('mat')) {
      geom = new THREE.BoxGeometry(0.7, 0.05, 0.4);
      color = 0x4a8a6a;
    } else {
      geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      color = 0x888888;
    }

    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Highlight a tile (for cursor hover) — uses a dedicated highlight mesh
   */
  highlightTile(x: number, y: number): void {
    // Remove previous highlight
    if (this.highlightMesh) {
      this.tileGroup.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      (this.highlightMesh.material as THREE.Material).dispose();
      this.highlightMesh = null;
    }

    const tile = this.map.getTile(x, y);
    if (!tile) return;

    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
    const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.1;
    const geom = new THREE.BoxGeometry(1.02, height + 0.02, 1.02);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffff88,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.highlightMesh = new THREE.Mesh(geom, mat);
    this.highlightMesh.position.set(x + offset.x + 0.5, height + 0.01, y + offset.z + 0.5);
    this.tileGroup.add(this.highlightMesh);
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