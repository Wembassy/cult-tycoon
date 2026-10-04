/**
 * SceneManager — Three.js scene graph for Cult Tycoon.
 * Dramatic 3D terrain, detailed follower models, environmental decor.
 * Enhanced building rendering with 3D walls, floors, doors, room labels,
 * work stations, and improved follower visuals with tier colors and status.
 */

import * as THREE from 'three';
import type { World } from '../ecs/World';
import type { TileMap } from '../world/TileMap';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { FollowerAI } from '../components/FollowerAI';
import { Job } from '../components/Job';
import type { AssetLoader } from './AssetLoader';
import { FogOfWar } from '../world/FogOfWar';
import type { BuildingSystem } from '../systems/BuildingSystem';
import { TIER_COLORS, getBuildingModel, getWorkStation } from '../data/BuildingModels';
import { findFollowerAnimationClip, type FollowerAnimationState } from '../data/FollowerAnimations';

// Richer terrain colors
const TERRAIN_COLORS: Record<string, number> = {
  grass: 0x4a8c3a,
  water: 0x2a6aaa,
  stone: 0x9a9a92,
  dirt: 0x8a6a4a,
};

// Dramatic height differences — stone is cliffs, water is low
const TERRAIN_HEIGHT: Record<string, number> = {
  grass: 0.5,
  water: 0.05,
  stone: 1.5,
  dirt: 0.35,
};

const TILE_SIZE = 0.9;

// Fine Construction Space uses 10 cells per legacy terrain unit in Alpha.
// Keep architectural dimensions proportional to that fine lattice instead of
// reusing the old 1x1-tile wall heights.
const constructionWallHeight = (cellSize: number) => Math.max(0.22, cellSize * 2.4);
const constructionDoorHeight = (cellSize: number) => Math.max(0.19, cellSize * 2.05);
const constructionRoofLift = (cellSize: number) => constructionWallHeight(cellSize) + Math.max(0.015, cellSize * 0.2);
const constructionObjectScale = (cellSize: number) => Math.max(0.22, cellSize * 2.5);

export type ConstructionVisualKind = 'wall' | 'floor' | 'door' | 'object';

export interface ConstructionBlueprintVisual {
  id: string;
  kind: ConstructionVisualKind;
  x: number;
  y: number;
  orientation?: 'horizontal' | 'vertical';
  space?: 'local' | 'construction';
  rotation?: number;
}

export interface BuildPreviewTile {
  x: number;
  y: number;
  valid: boolean;
  orientation?: 'horizontal' | 'vertical';
  space?: 'local' | 'construction';
}


// Display names for room types (used for floating labels)
const ROOM_TYPE_NAMES: Record<string, string> = {
  lobby: 'Lobby',
  temple: 'Temple',
  kitchen: 'Kitchen',
  canteen: 'Canteen',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  research_office: 'Research',
  recreation_room: 'Recreation',
  generic: 'Room',
};


export class SceneManager {
  private scene: THREE.Scene;
  private tileGroup: THREE.Group;
  private entityGroup: THREE.Group;
  private buildingGroup: THREE.Group;
  private roofGroup: THREE.Group;
  private wallVisuals: THREE.Object3D[] = [];
  private doorVisuals: Array<{
    pivot: THREE.Group;
    x: number;
    y: number;
    orientation: 'horizontal' | 'vertical';
  }> = [];
  private wallsVisible = true;
  private roofsVisible = true;
  private buildPreviewGroup: THREE.Group;
  private blueprintGroup: THREE.Group;
  private harvestDesignationGroup: THREE.Group;
  private logisticsGroup: THREE.Group;
  private highlightMesh: THREE.Mesh | null = null;
  private selectionRing: THREE.Mesh;
  private selectedFollower: number | null = null;
  private followerDisplayOffsets: Map<number, THREE.Vector2> = new Map();
  private tileMeshes: Map<string, THREE.Mesh> = new Map();
  private entityMeshes: Map<number, THREE.Object3D> = new Map();
  private entityMeshIsPlaceholder: Map<number, boolean> = new Map();
  private mixers: Map<number, THREE.AnimationMixer> = new Map();
  private animationActions: Map<number, Map<FollowerAnimationState, THREE.AnimationAction>> = new Map();
  private activeAnimationState: Map<number, FollowerAnimationState> = new Map();
  private lastFollowerPositions: Map<number, THREE.Vector2> = new Map();
  private sharedFollowerAnimations: THREE.AnimationClip[] = [];
  private entityLights: Map<number, THREE.PointLight> = new Map();
  private world: World;
  private map: TileMap;
  private assets: AssetLoader | null = null;
  private fog: FogOfWar | null = null;
  private lastAnimTime: number = 0;
  private buildingSystem: BuildingSystem | null = null;
  private followerNames: Map<number, string> = new Map();
  private buildingFillLight: THREE.DirectionalLight | null = null;

  constructor(scene: THREE.Scene, world: World, map: TileMap, assets?: AssetLoader) {
    this.scene = scene;
    this.world = world;
    this.map = map;
    this.assets = assets ?? null;
    this.tileGroup = new THREE.Group();
    this.tileGroup.name = 'tiles';
    this.entityGroup = new THREE.Group();
    this.entityGroup.name = 'entities';
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 32),
      new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.selectionRing.renderOrder = 30;
    this.entityGroup.add(this.selectionRing);
    this.buildingGroup = new THREE.Group();
    this.buildingGroup.name = 'buildings';
    this.roofGroup = new THREE.Group();
    this.roofGroup.name = 'roofs';
    this.buildPreviewGroup = new THREE.Group();
    this.buildPreviewGroup.name = 'build-preview';
    this.blueprintGroup = new THREE.Group();
    this.blueprintGroup.name = 'construction-blueprints';
    this.harvestDesignationGroup = new THREE.Group();
    this.harvestDesignationGroup.name = 'harvest-designations';
    this.logisticsGroup = new THREE.Group();
    this.logisticsGroup.name = 'logistics';
    this.scene.add(this.tileGroup);
    this.scene.add(this.entityGroup);
    this.scene.add(this.buildingGroup);
    this.scene.add(this.roofGroup);
    this.scene.add(this.blueprintGroup);
    this.scene.add(this.harvestDesignationGroup);
    this.scene.add(this.logisticsGroup);
    this.scene.add(this.buildPreviewGroup);

    // Fill light to enhance isometric view — softens shadows from the front
    this.buildingFillLight = new THREE.DirectionalLight(0x99bbdd, 0.35);
    this.buildingFillLight.position.set(-10, 15, -10);
    this.scene.add(this.buildingFillLight);
  }

  setAssetLoader(assets: AssetLoader): void { this.assets = assets; }

  setFog(fog: FogOfWar): void { this.fog = fog; }

  setBuildingSystem(bs: BuildingSystem): void { this.buildingSystem = bs; }

  setWallsVisible(visible: boolean): void {
    this.wallsVisible = visible;
    for (const visual of this.wallVisuals) visual.visible = visible;
  }

  setRoofsVisible(visible: boolean): void {
    this.roofsVisible = visible;
    this.roofGroup.visible = visible;
  }

  setFollowerNames(names: Map<number, string>): void { this.followerNames = names; }

  setFollowerAnimationLibrary(clips: THREE.AnimationClip[]): void {
    this.sharedFollowerAnimations = clips;
  }

  /** Get the current BuildingSystem reference (if set). */
  getBuildingSystem(): BuildingSystem | null { return this.buildingSystem; }

  setSelectedFollower(entity: number | null): void {
    this.selectedFollower = entity;
    if (entity === null) this.selectionRing.visible = false;
  }

  getFollowerDisplayOffset(entity: number): { x: number; y: number } {
    const offset = this.followerDisplayOffsets.get(entity);
    return offset ? { x: offset.x, y: offset.y } : { x: 0, y: 0 };
  }

  /**
   * Update tile appearance based on fog of war state.
   * Call after FogSystem updates fog state.
   * Only modifies tiles whose visibility changed.
   */
  updateFog(): void {
    if (!this.fog) return;

    // Update tiles that changed visibility
    for (const tileCoord of this.fog.getNewlyVisible()) {
      const mesh = this.tileMeshes.get(`${tileCoord.x},${tileCoord.y}`);
      if (mesh) {
        // Restore original color (recompute from terrain)
        const tile = this.map.getTile(tileCoord.x, tileCoord.y);
        if (tile) {
          const color = TERRAIN_COLORS[tile.terrain] ?? 0x3d6b35;
          const noiseVal = Math.sin(tileCoord.x * 0.5) * Math.cos(tileCoord.y * 0.5) + Math.sin((tileCoord.x + tileCoord.y) * 0.3);
          const variation = noiseVal * 0.06;
          const finalColor = new THREE.Color(color).offsetHSL(0, 0, variation);
          (mesh.material as THREE.MeshStandardMaterial).color.copy(finalColor);
          (mesh.material as THREE.MeshStandardMaterial).opacity = 1;
          (mesh.material as THREE.MeshStandardMaterial).transparent = false;
          mesh.visible = true;
        }
      }
    }

    for (const tileCoord of this.fog.getNewlyHidden()) {
      const mesh = this.tileMeshes.get(`${tileCoord.x},${tileCoord.y}`);
      if (mesh) {
        // Dim explored tiles, hide hidden tiles
        const tile = this.map.getTile(tileCoord.x, tileCoord.y);
        if (tile) {
          const color = TERRAIN_COLORS[tile.terrain] ?? 0x3d6b35;
          const material = mesh.material as THREE.MeshStandardMaterial;
          // Always recompute from the source terrain color. Never multiply the
          // current color repeatedly; that was progressively blackening tiles.
          material.color.setHex(color);
          if (this.fog.isExplored(tileCoord.x, tileCoord.y)) {
            material.color.multiplyScalar(0.72);
          } else {
            material.color.multiplyScalar(0.52);
          }
          material.transparent = false;
          material.opacity = 1;
          mesh.visible = true;
        }
      }
    }
  }

  buildTiles(): void {
    while (this.tileGroup.children.length > 0) {
      const child = this.tileGroup.children[0];
      this.tileGroup.remove(child);
      this.disposeObject(child);
    }
    this.tileMeshes.clear();

    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };

    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const tile = this.map.getTile(x, y);
        if (!tile) continue;

        const color = TERRAIN_COLORS[tile.terrain] ?? 0x3d6b35;
        const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.3;
        const isWater = tile.terrain === 'water';

        // Stronger per-tile noise-based color variation for texture
        const noiseVal = Math.sin(x * 0.5) * Math.cos(y * 0.5) + Math.sin((x + y) * 0.3);
        const variation = noiseVal * 0.06;
        const finalColor = new THREE.Color(color).offsetHSL(0, 0, variation);
        if (tile.roomId !== null) {
          // Designated rooms get a subtle blueprint tint so painted areas are legible.
          finalColor.lerp(new THREE.Color(0x4777aa), 0.22);
        }

        const geom = new THREE.BoxGeometry(TILE_SIZE, height, TILE_SIZE);
        const mat = isWater
          ? new THREE.MeshStandardMaterial({
              color: finalColor, transparent: true, opacity: 0.8,
              flatShading: true, roughness: 0.2, metalness: 0.3,
            })
          : new THREE.MeshStandardMaterial({
              color: finalColor, flatShading: true, roughness: 0.9,
            });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x + offset.x + 0.5, height / 2, y + offset.z + 0.5);
        mesh.castShadow = !isWater;
        mesh.receiveShadow = true;
        mesh.userData = { tileX: x, tileY: y };

        if (tile.occupied && tile.decor === 'none') {
          mat.color.lerp(new THREE.Color(0x222222), 0.5);
        }

        this.tileGroup.add(mesh);
        this.tileMeshes.set(`${x},${y}`, mesh);

        // Add grass blade particles on grass tiles
        if (tile.terrain === 'grass') {
          const bladeCount = 3 + ((x * 3 + y * 7) % 4); // 3-6 blades per tile
          const grassGeom = new THREE.ConeGeometry(0.04, 0.2, 4);
          for (let b = 0; b < bladeCount; b++) {
            const bladeColor = new THREE.Color(0x4a8c3a).offsetHSL(0, 0, ((b * 17 + x * 3) % 5 - 2) * 0.03);
            const bladeMat = new THREE.MeshStandardMaterial({ color: bladeColor, flatShading: true, roughness: 0.95 });
            const blade = new THREE.Mesh(grassGeom, bladeMat);
            const bx = (Math.random() - 0.5) * 0.7;
            const bz = (Math.random() - 0.5) * 0.7;
            blade.position.set(x + offset.x + 0.5 + bx, height + 0.1, y + offset.z + 0.5 + bz);
            blade.rotation.y = Math.random() * Math.PI;
            blade.rotation.x = (Math.random() - 0.5) * 0.2;
            blade.castShadow = false;
            this.tileGroup.add(blade);
          }
        }

        if (tile.decor !== 'none') {
          const decorMesh = this.createDecorMesh(tile.decor);
          if (decorMesh) {
            decorMesh.position.set(x + offset.x + 0.5, height, y + offset.z + 0.5);
            this.tileGroup.add(decorMesh);
          }
        }
      }
    }

    // Ground plane
    const groundGeom = new THREE.PlaneGeometry(this.map.width + 40, this.map.height + 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x202634, roughness: 1 });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    this.tileGroup.add(ground);

    // Apply fog of war if set — hide all tiles initially (fog will reveal them)
    if (this.fog) {
      for (const [key, mesh] of this.tileMeshes) {
        const [tx, ty] = key.split(',').map(Number);
        const state = this.fog.getState(tx, ty);
        if (state === 'hidden') {
          // Unexplored terrain stays readable as a desaturated/dim board state,
          // not a transparent black veil.
          (mesh.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.52);
          (mesh.material as THREE.MeshStandardMaterial).transparent = false;
          (mesh.material as THREE.MeshStandardMaterial).opacity = 1;
          mesh.visible = true;
        } else if (state === 'explored') {
          (mesh.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.72);
          (mesh.material as THREE.MeshStandardMaterial).transparent = false;
          (mesh.material as THREE.MeshStandardMaterial).opacity = 1;
          mesh.visible = true;
        }
      }
    }
  }

  private createDecorMesh(decor: string): THREE.Mesh | null {
    switch (decor) {
      case 'tree': {
        const tree = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));

        // Trunk
        const trunkGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.6, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, flatShading: true, roughness: 0.95 });
        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.y = 0.3;
        trunk.castShadow = true;
        tree.add(trunk);

        // Layered foliage — 3 cones for full look
        const leafColors = [0x1a4a1a, 0x2a5a2a, 0x1a5a2a, 0x2a4a1a];
        const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)] ?? 0x2a5a2a;

        for (let i = 0; i < 3; i++) {
          const radius = 0.6 - i * 0.15;
          const height = 0.55;
          const y = 0.7 + i * 0.4;
          const coneGeom = new THREE.ConeGeometry(radius, height, 8);
          const coneMat = new THREE.MeshStandardMaterial({ color: leafColor, flatShading: true, roughness: 0.9 });
          const cone = new THREE.Mesh(coneGeom, coneMat);
          cone.position.y = y;
          cone.castShadow = true;
          tree.add(cone);
        }
        return tree;
      }
      case 'rock': {
        const rock = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
        // Main rock
        const rockColors = [0x7a7a72, 0x8a8a82, 0x6a6a62];
        const rc = rockColors[Math.floor(Math.random() * 3)] ?? 0x7a7a72;
        const mainGeom = new THREE.DodecahedronGeometry(0.4, 0);
        const mainMat = new THREE.MeshStandardMaterial({ color: rc, flatShading: true, roughness: 0.9 });
        const main = new THREE.Mesh(mainGeom, mainMat);
        main.position.y = 0.2;
        main.castShadow = true;
        main.receiveShadow = true;
        rock.add(main);
        // Small rock beside it
        const smallGeom = new THREE.DodecahedronGeometry(0.2, 0);
        const smallMat = new THREE.MeshStandardMaterial({ color: rc, flatShading: true, roughness: 0.9 });
        const small = new THREE.Mesh(smallGeom, smallMat);
        small.position.set(0.25, 0.1, 0.15);
        small.castShadow = true;
        rock.add(small);
        return rock;
      }
      case 'bush': {
        const bush = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
        const bushColors = [0x2a5a2a, 0x1a4a1a, 0x3a6a3a];
        const bc = bushColors[Math.floor(Math.random() * 3)] ?? 0x2a5a2a;
        // 3 overlapping spheres for organic look
        for (let i = 0; i < 3; i++) {
          const r = 0.22 + Math.random() * 0.08;
          const g = new THREE.SphereGeometry(r, 8, 6);
          const m = new THREE.MeshStandardMaterial({ color: bc, flatShading: true, roughness: 0.9 });
          const s = new THREE.Mesh(g, m);
          s.position.set((Math.random() - 0.5) * 0.3, 0.15 + Math.random() * 0.1, (Math.random() - 0.5) * 0.3);
          s.castShadow = true;
          bush.add(s);
        }
        return bush;
      }
      case 'flower': {
        const flower = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
        // Stem
        const stemGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.2, 4);
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x2a7a2a, flatShading: true });
        const stem = new THREE.Mesh(stemGeom, stemMat);
        stem.position.y = 0.1;
        flower.add(stem);
        // Flower head
        const flowerColors = [0xff5588, 0xffdd33, 0xff8833, 0xdd55ff, 0xff4444, 0xffffff];
        const fc = flowerColors[Math.floor(Math.random() * flowerColors.length)] ?? 0xff5588;
        const headGeom = new THREE.IcosahedronGeometry(0.12, 0);
        const headMat = new THREE.MeshStandardMaterial({ color: fc, flatShading: true, emissive: fc, emissiveIntensity: 0.3 });
        const head = new THREE.Mesh(headGeom, headMat);
        head.position.y = 0.22;
        flower.add(head);
        return flower;
      }
      default:
        return null;
    }
  }

  // ─── Text Sprite Helper ──────────────────────────────────────

  /**
   * Create a floating text label as a THREE.Sprite using CanvasTexture.
   */
  private createTextSprite(text: string, color = '#ffffff', fontSize = 32): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `bold ${fontSize}px Segoe UI, sans-serif`;
    const metrics = ctx.measureText(text);
    canvas.width = Math.ceil(metrics.width + 16);
    canvas.height = fontSize + 12;

    // Re-set font after canvas resize (context resets)
    ctx.font = `bold ${fontSize}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
    return sprite;
  }

  // ─── Building Rendering ──────────────────────────────────────

  /**
   * Sync building visuals — walls, floors, doors, room labels, work stations.
   * Called when BuildingSystem is dirty (after build/demolish).
   */
  syncBuildings(bs: BuildingSystem): void {
    // Clear existing building meshes
    this.wallVisuals = [];
    this.doorVisuals = [];
    this.clearVisualGroup(this.roofGroup);
    while (this.buildingGroup.children.length > 0) {
      const child = this.buildingGroup.children[0];
      this.buildingGroup.remove(child);
      this.disposeObject(child);
    }

    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };

    // Alpha edge-based walls. Construction coordinates are vertices/edges,
    // not occupied floor cells.
    const constructionCellSize = bs.cellSize;
    const edgeThickness = Math.max(0.025, Math.min(0.08, constructionCellSize * 0.35));

    for (const edge of bs.wallEdges) {
      const terrain = bs.toTerrainTile(
        Math.max(0, edge.x - (edge.orientation === 'vertical' ? 1 : 0)),
        Math.max(0, edge.y - (edge.orientation === 'horizontal' ? 1 : 0)),
      );
      const tile = this.map.getTile(terrain.x, terrain.y);
      if (!tile) continue;
      const model = getBuildingModel('generic');
      const length = constructionCellSize;
      const wallHeight = constructionWallHeight(constructionCellSize);
      const wallGeom = edge.orientation === 'horizontal'
        ? new THREE.BoxGeometry(length, wallHeight, edgeThickness)
        : new THREE.BoxGeometry(edgeThickness, wallHeight, length);
      const wallMat = new THREE.MeshStandardMaterial({
        color: model.color,
        flatShading: true,
        roughness: 0.85,
      });
      const wall = new THREE.Mesh(wallGeom, wallMat);
      const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;
      const localX = edge.orientation === 'horizontal'
        ? (edge.x + 0.5) * constructionCellSize
        : edge.x * constructionCellSize;
      const localZ = edge.orientation === 'horizontal'
        ? edge.y * constructionCellSize
        : (edge.y + 0.5) * constructionCellSize;
      wall.position.set(localX + offset.x, height + wallHeight / 2, localZ + offset.z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.userData = { buildKind: 'wall-edge', ...edge };
      wall.visible = this.wallsVisible;
      this.wallVisuals.push(wall);
      this.buildingGroup.add(wall);
    }

    for (const edge of bs.doorEdges) {
      const terrain = bs.toTerrainTile(
        Math.max(0, edge.x - (edge.orientation === 'vertical' ? 1 : 0)),
        Math.max(0, edge.y - (edge.orientation === 'horizontal' ? 1 : 0)),
      );
      const tile = this.map.getTile(terrain.x, terrain.y);
      if (!tile) continue;
      const length = constructionCellSize;
      const doorHeight = constructionDoorHeight(constructionCellSize);
      const doorGeom = edge.orientation === 'horizontal'
        ? new THREE.BoxGeometry(length, doorHeight, edgeThickness * 1.25)
        : new THREE.BoxGeometry(edgeThickness * 1.25, doorHeight, length);
      const doorMat = new THREE.MeshStandardMaterial({
        color: 0x5a3a2a,
        flatShading: true,
        roughness: 0.7,
      });
      const door = new THREE.Mesh(doorGeom, doorMat);
      const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;

      // Pivot at one end so the door visibly swings instead of rotating around
      // its center. Room topology still treats the edge as a closed boundary;
      // traversal is handled separately by NavigationGrid.
      const pivot = new THREE.Group();
      const pivotX = edge.x * constructionCellSize + offset.x;
      const pivotZ = edge.y * constructionCellSize + offset.z;
      pivot.position.set(pivotX, height, pivotZ);

      if (edge.orientation === 'horizontal') {
        door.position.set(length / 2, doorHeight / 2, 0);
      } else {
        door.position.set(0, doorHeight / 2, length / 2);
      }

      door.castShadow = true;
      door.userData = { buildKind: 'door-edge', ...edge };
      pivot.userData = { buildKind: 'door-pivot', ...edge };
      pivot.add(door);
      pivot.visible = this.wallsVisible;
      this.wallVisuals.push(pivot);
      this.doorVisuals.push({ pivot, x: edge.x, y: edge.y, orientation: edge.orientation });
      this.buildingGroup.add(pivot);
    }

    // Render walls as extruded boxes
    for (const tileKey of (bs.subdivisions === 1 ? bs.wallTiles : new Set<string>())) {
      const [x, y] = tileKey.split(',').map(Number);
      const tile = this.map.getTile(x, y);
      if (!tile) continue;

      // Determine room type for color
      const roomId = tile.roomId;
      const room = roomId !== null ? bs.getRoom(roomId) : null;
      const model = room ? getBuildingModel(room.type) : getBuildingModel('generic');

      const wallGeom = new THREE.BoxGeometry(0.95, 1.6, 0.95);
      const wallMat = new THREE.MeshStandardMaterial({
        color: model.color,
        flatShading: true,
        roughness: 0.85,
      });
      const wall = new THREE.Mesh(wallGeom, wallMat);
      const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;
      wall.position.set(x + offset.x + 0.5, height + 0.8, y + offset.z + 0.5);
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.visible = this.wallsVisible;
      this.wallVisuals.push(wall);
      this.buildingGroup.add(wall);
    }

    // Render doors as distinct meshes (shorter, different color, arched top)
    for (const tileKey of (bs.subdivisions === 1 ? bs.doorTiles : new Set<string>())) {
      const [x, y] = tileKey.split(',').map(Number);
      const tile = this.map.getTile(x, y);
      if (!tile) continue;

      const doorGeom = new THREE.BoxGeometry(0.8, 1.2, 0.2);
      const doorMat = new THREE.MeshStandardMaterial({
        color: 0x5a3a2a,
        flatShading: true,
        roughness: 0.7,
        emissive: 0x2a1a0a,
        emissiveIntensity: 0.1,
      });
      const door = new THREE.Mesh(doorGeom, doorMat);
      const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;
      door.position.set(x + offset.x + 0.5, height + 0.6, y + offset.z + 0.5);
      door.castShadow = true;
      door.receiveShadow = true;
      door.visible = this.wallsVisible;
      this.wallVisuals.push(door);
      this.buildingGroup.add(door);

      // Door frame — two small posts
      const postGeom = new THREE.BoxGeometry(0.1, 1.4, 0.1);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, flatShading: true });
      const post1 = new THREE.Mesh(postGeom, postMat);
      post1.position.set(x + offset.x + 0.5 - 0.4, height + 0.7, y + offset.z + 0.5);
      post1.castShadow = true;
      post1.visible = this.wallsVisible;
      this.wallVisuals.push(post1);
      this.buildingGroup.add(post1);
      const post2 = new THREE.Mesh(postGeom, postMat);
      post2.position.set(x + offset.x + 0.5 + 0.4, height + 0.7, y + offset.z + 0.5);
      post2.castShadow = true;
      post2.visible = this.wallsVisible;
      this.wallVisuals.push(post2);
      this.buildingGroup.add(post2);
    }

    // Render floors in Construction Space.
    for (const tileKey of bs.floorTiles) {
      const [x, y] = tileKey.split(',').map(Number);
      const terrain = bs.toTerrainTile(x, y);
      const tile = this.map.getTile(terrain.x, terrain.y);
      if (!tile) continue;

      const roomId = tile.roomId;
      const room = roomId !== null ? bs.getRoom(roomId) : null;
      const model = room ? getBuildingModel(room.type) : getBuildingModel('generic');

      const size = bs.cellSize * 0.96;
      const floorGeom = new THREE.PlaneGeometry(size, size);
      const floorMat = new THREE.MeshStandardMaterial({
        color: model.color,
        flatShading: true,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      const floor = new THREE.Mesh(floorGeom, floorMat);
      floor.rotation.x = -Math.PI / 2;
      const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;
      floor.position.set(
        (x + 0.5) * bs.cellSize + offset.x,
        height + 0.02,
        (y + 0.5) * bs.cellSize + offset.z,
      );
      floor.receiveShadow = true;
      this.buildingGroup.add(floor);
    }

    // Render placed objects using fine Construction Space coordinates.
    for (const obj of bs.getAllObjects()) {
      const terrain = bs.toTerrainTile(obj.x, obj.y);
      const tile = this.map.getTile(terrain.x, terrain.y);
      if (!tile) continue;

      const objMesh = this.createObjectMesh(obj.objectId);
      if (objMesh) {
        const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;
        objMesh.scale.multiplyScalar(constructionObjectScale(bs.cellSize));
        objMesh.position.set(
          (obj.x + 0.5) * bs.cellSize + offset.x,
          height,
          (obj.y + 0.5) * bs.cellSize + offset.z,
        );
        objMesh.rotation.y = obj.rotation ?? 0;
        this.buildingGroup.add(objMesh);
      }
    }

    // Automatic roofs are derived from fine enclosed room cells. Build one
    // indexed geometry per room so even large rooms do not create thousands of meshes.
    for (const room of bs.getAllRooms()) {
      if (!room.roofed || !room.constructionCells?.length) continue;
      const roof = this.createRoomRoofMesh(room.constructionCells, bs, offset);
      if (!roof) continue;
      roof.userData = { roomId: room.id, buildKind: 'roof' };
      this.roofGroup.add(roof);
    }
    this.roofGroup.visible = this.roofsVisible;

    // Render room labels and work stations
    for (const room of bs.getAllRooms()) {
      if (room.tiles.length === 0) continue;

      // Compute room center
      let cx = 0, cy = 0;
      for (const t of room.tiles) { cx += t.x; cy += t.y; }
      cx /= room.tiles.length;
      cy /= room.tiles.length;

      const height = TERRAIN_HEIGHT['grass'] ?? 0.5;
      const labelX = cx + offset.x;
      const labelZ = cy + offset.z;

      // Room label floating above
      const roomTypeDef = ROOM_TYPE_NAMES[room.type] ?? room.type;
      const label = this.createTextSprite(roomTypeDef, '#aaccff', 28);
      label.position.set(labelX, height + 2.5, labelZ);
      this.buildingGroup.add(label);

      // Work station at room center
      const station = this.createWorkStation(room.type);
      if (station) {
        station.position.set(labelX, height, labelZ);
        this.buildingGroup.add(station);
      }
    }
  }

  private createRoomRoofMesh(
    cells: { x: number; y: number }[],
    bs: BuildingSystem,
    offset: { x: number; z: number },
  ): THREE.Mesh | null {
    if (cells.length === 0) return null;

    const cellSize = bs.cellSize;
    const positions: number[] = [];
    const indices: number[] = [];
    let vertex = 0;

    for (const cell of cells) {
      const terrain = bs.toTerrainTile(cell.x, cell.y);
      const tile = this.map.getTile(terrain.x, terrain.y);
      if (!tile) continue;
      const terrainHeight = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;
      const y = terrainHeight + constructionRoofLift(cellSize);
      const x0 = cell.x * cellSize + offset.x;
      const x1 = (cell.x + 1) * cellSize + offset.x;
      const z0 = cell.y * cellSize + offset.z;
      const z1 = (cell.y + 1) * cellSize + offset.z;

      positions.push(
        x0, y, z0,
        x1, y, z0,
        x1, y, z1,
        x0, y, z1,
      );
      indices.push(
        vertex, vertex + 2, vertex + 1,
        vertex, vertex + 3, vertex + 2,
      );
      vertex += 4;
    }

    if (positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x434955,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Create a work station mesh for a room type.
   */
  private createWorkStation(roomType: string): THREE.Object3D | null {
    const config = getWorkStation(roomType);
    if (!config) return null;

    const root = new THREE.Group();
    const color = config.color;

    if (config.geometry === 'cylinder') {
      const geom = new THREE.CylinderGeometry(config.dimensions[0], config.dimensions[0], config.dimensions[1], 12);
      const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = config.yOffset;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);

      // Add a small top detail
      if (roomType === 'bathroom') {
        const lidGeom = new THREE.BoxGeometry(config.dimensions[0] * 1.5, 0.05, config.dimensions[2] * 1.5);
        const lidMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, flatShading: true });
        const lid = new THREE.Mesh(lidGeom, lidMat);
        lid.position.y = config.yOffset + config.dimensions[1] / 2;
        lid.castShadow = true;
        root.add(lid);
      }
    } else if (config.geometry === 'sphere') {
      const r = config.dimensions[0];
      const geom = new THREE.SphereGeometry(r, 12, 8);
      const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = config.yOffset + r;
      mesh.castShadow = true;
      root.add(mesh);
    } else if (config.geometry === 'cone') {
      const geom = new THREE.ConeGeometry(config.dimensions[0], config.dimensions[1], 8);
      const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = config.yOffset;
      mesh.castShadow = true;
      root.add(mesh);
    } else {
      // Box geometry (default)
      const [w, h, d] = config.dimensions;
      const geom = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.y = config.yOffset;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);

      // Add details for specific work stations
      if (roomType === 'temple') {
        // Add candle on top of altar
        const candleGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.15, 6);
        const candleMat = new THREE.MeshStandardMaterial({
          color: 0xffddaa,
          emissive: 0xff8833,
          emissiveIntensity: 0.5,
        });
        const candle = new THREE.Mesh(candleGeom, candleMat);
        candle.position.y = h / 2 + 0.1;
        root.add(candle);

        // Small point light for altar candle
        const light = new THREE.PointLight(0xff9944, 0.5, 3, 2);
        light.position.y = h / 2 + 0.2;
        root.add(light);
      } else if (roomType === 'research_office') {
        // Add book on desk
        const bookGeom = new THREE.BoxGeometry(0.3, 0.06, 0.2);
        const bookMat = new THREE.MeshStandardMaterial({ color: 0xaa3333, flatShading: true });
        const book = new THREE.Mesh(bookGeom, bookMat);
        book.position.y = h / 2 + 0.03;
        book.castShadow = true;
        root.add(book);
      } else if (roomType === 'kitchen') {
        // Add pot on stove
        const potGeom = new THREE.CylinderGeometry(0.15, 0.12, 0.15, 8);
        const potMat = new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true, metalness: 0.3 });
        const pot = new THREE.Mesh(potGeom, potMat);
        pot.position.y = h / 2 + 0.08;
        pot.castShadow = true;
        root.add(pot);
      } else if (roomType === 'recreation_room') {
        // Add game piece (small sphere)
        const pieceGeom = new THREE.SphereGeometry(0.08, 8, 6);
        const pieceMat = new THREE.MeshStandardMaterial({ color: 0xff6644, flatShading: true });
        const piece = new THREE.Mesh(pieceGeom, pieceMat);
        piece.position.y = h / 2 + 0.08;
        piece.castShadow = true;
        root.add(piece);
      }
    }

    return root;
  }

  /**
   * Create an object mesh from a placed object type string.
   * Delegates to createPlaceholderMesh for geometry, but wraps in a group.
   */
  private createObjectMesh(objType: string): THREE.Object3D | null {
    const mesh = this.createPlaceholderMesh(objType, 0);
    if (!mesh) return null;
    return mesh;
  }

  syncEntities(): void {
    const now = performance.now();
    const dt = this.lastAnimTime > 0 ? Math.min((now - this.lastAnimTime) / 1000, 0.1) : 0;
    this.lastAnimTime = now;

    const entities = this.world.query([Transform, Renderable]);
    const seen = new Set<number>();

    // Followers may share a logical grid cell. Give colocated pawns small,
    // render-only offsets so they remain individually visible/selectable without
    // changing pathfinding or simulation coordinates.
    const crowdGroups = new Map<string, number[]>();
    for (const entity of entities) {
      const transform = this.world.getComponent(entity, Transform);
      const renderable = this.world.getComponent(entity, Renderable);
      if (!transform || !renderable?.meshId.startsWith('follower')) continue;
      const key = `${Math.round(transform.x)},${Math.round(transform.y)}`;
      const group = crowdGroups.get(key) ?? [];
      group.push(entity);
      crowdGroups.set(key, group);
    }
    this.followerDisplayOffsets.clear();
    for (const group of crowdGroups.values()) {
      group.sort((a, b) => a - b);
      if (group.length === 1) {
        this.followerDisplayOffsets.set(group[0], new THREE.Vector2(0, 0));
        continue;
      }
      const radius = Math.min(0.24, 0.12 + group.length * 0.018);
      group.forEach((entity, index) => {
        const angle = (index / group.length) * Math.PI * 2 - Math.PI / 2;
        this.followerDisplayOffsets.set(
          entity,
          new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius),
        );
      });
    }

    for (const entity of entities) {
      const transform = this.world.getComponent(entity, Transform)!;
      const renderable = this.world.getComponent(entity, Renderable)!;
      if (!renderable.visible) continue;
      seen.add(entity);

      let obj = this.entityMeshes.get(entity);
      const isPlaceholder = this.entityMeshIsPlaceholder.get(entity) ?? true;

      // Replace placeholder with real asset if loaded
      if (obj && isPlaceholder) {
        const assetPath = this.getAssetPath(renderable.meshId, entity);
        const cached = assetPath && this.assets ? this.assets.get(assetPath) : null;
        if (cached) {
          console.log(`[SceneManager] Replacing placeholder for entity ${entity}, meshId=${renderable.meshId}, path=${assetPath}`);
          this.entityGroup.remove(obj);
          this.disposeObject(obj);
          this.entityMeshes.delete(entity);
          this.entityMeshIsPlaceholder.delete(entity);
          obj = undefined;
        }
        // Don't log "not cached" every frame — only log once per entity
      }

      if (!obj) {
        const assetPath = this.getAssetPath(renderable.meshId, entity);
        if (assetPath && this.assets) {
          const cloned = this.assets.clone(assetPath);
          if (cloned) {
            // Polygon Minis: root Armature node has translation ~[0, 1.0, -0.47].
            // Scale to ~0.06 so they're ~0.12 units tall — small relative to trees/rocks.
            const modelScale = 0.075; // Alpha: 25% larger followers for readability.
            cloned.scale.setScalar(modelScale);
            cloned.updateMatrixWorld(true);

            // Compute bounding box to find the actual feet position.
            // This ensures the model stands on the ground regardless of
            // how the Armature node is offset.
            const bbox = new THREE.Box3().setFromObject(cloned);
            const feetY = bbox.min.y; // lowest point of the model in local space
            // Shift model up so the lowest point (feet) sits at y=0 in the wrapper
            cloned.position.y = -feetY;

            cloned.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Fix frustum culling for skinned meshes (prevents disappearing/glitching)
                child.frustumCulled = false;
              }
            });

            // Wrap in a container group — the sync loop sets position on `obj`,
            // so we need the model's y-offset to be preserved inside the wrapper.
            const wrapper = new THREE.Group();
            wrapper.add(cloned);
            obj = wrapper;
            this.entityGroup.add(obj);
            this.entityMeshes.set(entity, obj);
            this.entityMeshIsPlaceholder.set(entity, false);

            // Build a semantic animation controller only from clips whose names
            // actually identify their purpose. The current Synty exports use generic
            // Take/BaseLayer names, so they intentionally remain in a safe rest pose
            // instead of playing an arbitrary clip that may be a ritual/combat pose.
            const asset = this.assets!.get(assetPath);
            if (asset) {
              const controller = this.createFollowerAnimationController(cloned, asset.animations);
              if (controller) {
                this.mixers.set(entity, controller.mixer);
                this.animationActions.set(entity, controller.actions);
              }
            }

            // No point light — was creating visible beams in the scene.
            // The scene's ambient and directional lighting is sufficient.
          }
        }

        if (!obj) {
          const mesh = this.createPlaceholderMesh(renderable.meshId, entity);
          if (renderable.meshId.startsWith('follower')) mesh.scale.setScalar(1.25);
          obj = mesh;
          this.entityGroup.add(obj);
          this.entityMeshes.set(entity, obj);
          this.entityMeshIsPlaceholder.set(entity, true);
        }
      }

      // Smooth position
      const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
      const displayOffset = renderable.meshId.startsWith('follower')
        ? this.followerDisplayOffsets.get(entity) ?? new THREE.Vector2()
        : new THREE.Vector2();
      const targetX = transform.x + offset.x + 0.5 + displayOffset.x;
      const targetZ = transform.y + offset.z + 0.5 + displayOffset.y;

      // Hide entities in unexplored fog areas
      if (this.fog && !this.fog.isVisible(Math.round(transform.x), Math.round(transform.y))) {
        obj.visible = false;
        continue;
      } else {
        obj.visible = true;
      }

      obj.position.x += (targetX - obj.position.x) * 0.15;
      obj.position.z += (targetZ - obj.position.z) * 0.15;

      // Terrain grass top is at y=0.5. Place model wrapper so feet rest on terrain.
      // The wrapper contains the model shifted up so feet are at y=0 in the wrapper.
      let baseY = transform.z + 0.5;

      if (renderable.meshId.startsWith('follower')) {
        const ai = this.world.getComponent(entity, FollowerAI);
        const job = this.world.getComponent(entity, Job);
        const animState = this.getFollowerAnimationState(ai, job);

        // Cross-fade semantic clips when available. Current generic Synty exports
        // fall back to rest pose plus subtle wrapper motion below.
        this.setFollowerAnimationState(entity, animState);

        const previous = this.lastFollowerPositions.get(entity);
        if (previous) {
          const dx = transform.x - previous.x;
          const dy = transform.y - previous.y;
          if (dx * dx + dy * dy > 0.00001) {
            const targetRot = Math.atan2(dx, dy);
            let rotDiff = targetRot - obj.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            obj.rotation.y += rotDiff * Math.min(1, dt * 12);
          }
        }
        this.lastFollowerPositions.set(entity, new THREE.Vector2(transform.x, transform.y));

        // If skeletal animation is unavailable, keep a stable pose rather than
        // fake vertical bobbing. Bobbing made idle followers look stuck/glitched.
        const hasSemanticAction = this.animationActions.get(entity)?.has(animState) ?? false;
        if (!hasSemanticAction && animState === 'sleep') {
          obj.rotation.z += (0.10 - obj.rotation.z) * 0.08;
        } else if (animState !== 'sleep') {
          obj.rotation.z += (0 - obj.rotation.z) * 0.08;
        }
      } else {
        obj.rotation.y = transform.rotation;
      }

      obj.position.y += (baseY - obj.position.y) * 0.15;

      if (entity === this.selectedFollower) {
        this.selectionRing.visible = obj.visible;
        this.selectionRing.position.set(obj.position.x, baseY + 0.035, obj.position.z);
      }
    }

    if (this.selectedFollower !== null && !seen.has(this.selectedFollower)) {
      this.selectedFollower = null;
      this.selectionRing.visible = false;
    }

    this.updateDoorVisuals(dt);

    // Update animation mixers
    for (const mixer of this.mixers.values()) {
      mixer.update(dt);
    }

    // Cleanup
    for (const [entityId, obj] of this.entityMeshes) {
      if (!seen.has(entityId)) {
        this.entityGroup.remove(obj);
        this.disposeObject(obj);
        this.entityMeshes.delete(entityId);
        this.entityMeshIsPlaceholder.delete(entityId);
        this.mixers.delete(entityId);
        this.animationActions.delete(entityId);
        this.activeAnimationState.delete(entityId);
        this.lastFollowerPositions.delete(entityId);
        this.entityLights.delete(entityId);
      }
    }
  }

  private updateDoorVisuals(dt: number): void {
    const bs = this.buildingSystem;
    if (!bs || this.doorVisuals.length === 0) return;

    const followers = this.world.query([Transform, FollowerAI]);
    const openRadius = Math.max(0.22, bs.cellSize * 2.5);
    const maxStep = Math.min(1, Math.max(0.08, dt * 12));

    for (const visual of this.doorVisuals) {
      const centerX = visual.orientation === 'horizontal'
        ? (visual.x + 0.5) * bs.cellSize - 0.5
        : visual.x * bs.cellSize - 0.5;
      const centerY = visual.orientation === 'horizontal'
        ? visual.y * bs.cellSize - 0.5
        : (visual.y + 0.5) * bs.cellSize - 0.5;

      let shouldOpen = false;
      for (const entity of followers) {
        const transform = this.world.getComponent(entity, Transform);
        if (!transform) continue;
        const dx = transform.x - centerX;
        const dy = transform.y - centerY;
        if (dx * dx + dy * dy <= openRadius * openRadius) {
          shouldOpen = true;
          break;
        }
      }

      const openAngle = visual.orientation === 'horizontal'
        ? -Math.PI * 0.42
        : Math.PI * 0.42;
      const target = shouldOpen ? openAngle : 0;
      visual.pivot.rotation.y += (target - visual.pivot.rotation.y) * maxStep;
    }
  }

  private createFollowerAnimationController(
    root: THREE.Object3D,
    embeddedClips: THREE.AnimationClip[],
  ): { mixer: THREE.AnimationMixer; actions: Map<FollowerAnimationState, THREE.AnimationAction> } | null {
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<FollowerAnimationState, THREE.AnimationAction>();

    for (const state of ['idle', 'walk', 'work', 'pray', 'eat', 'sleep'] as FollowerAnimationState[]) {
      const sharedIndex = findFollowerAnimationClip(this.sharedFollowerAnimations, state);
      const embeddedIndex = findFollowerAnimationClip(embeddedClips, state);
      const clip = sharedIndex >= 0
        ? this.sharedFollowerAnimations[sharedIndex]
        : embeddedIndex >= 0
          ? embeddedClips[embeddedIndex]
          : null;

      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      actions.set(state, action);
    }

    if (actions.size === 0) return null;
    return { mixer, actions };
  }

  private getFollowerAnimationState(ai: FollowerAI | null | undefined, job: Job | null | undefined): FollowerAnimationState {
    if (!ai) return 'idle';
    if (ai.state === 'moving') return 'walk';

    if (ai.state === 'needs') {
      if (ai.needTarget === 'energy') return 'sleep';
      if (ai.needTarget === 'hunger') return 'eat';
      if (ai.needTarget === 'faith') return 'pray';
      return 'idle';
    }

    if (ai.state === 'working') {
      if (job?.type === 'pray') return 'pray';
      if (job?.type === 'cook') return 'work';
      if (job?.type === 'research') return 'work';
      if (
        job?.type === 'build' ||
        job?.type === 'clean' ||
        job?.type === 'haul' ||
        job?.type === 'harvest'
      ) return 'work';
    }

    if (ai.state === 'sleeping') return 'sleep';
    return 'idle';
  }

  private setFollowerAnimationState(entity: number, state: FollowerAnimationState): void {
    const actions = this.animationActions.get(entity);
    if (!actions || actions.size === 0) return;

    const resolved = actions.has(state)
      ? state
      : actions.has('idle')
        ? 'idle'
        : null;
    if (!resolved) return;

    if (this.activeAnimationState.get(entity) === resolved) return;

    const next = actions.get(resolved)!;
    const previousState = this.activeAnimationState.get(entity);
    if (previousState) {
      const previous = actions.get(previousState);
      if (previous && previous !== next) previous.fadeOut(0.18);
    }

    next.reset().fadeIn(0.18).play();
    this.activeAnimationState.set(entity, resolved);
  }

  private getAssetPath(meshId: string, entityId: number = 0): string | null {
    if (meshId.startsWith('follower')) {
      // Real fantasy character GLBs — cult-appropriate variants.
      // Use entityId (not meshId hash) so different followers get different models.
      const variants = [
        './assets/models/followers/fantasy_wizard_01.glb',
        './assets/models/followers/fantasy_sorcerer_01.glb',
        './assets/models/followers/fantasy_witch_01.glb',
        './assets/models/followers/fantasy_druid_01.glb',
        './assets/models/followers/fantasy_bard_01.glb',
        './assets/models/followers/fantasy_gypsy_01.glb',
        './assets/models/followers/fantasy_rougemale_01.glb',
        './assets/models/followers/fantasy_malepeasant_01.glb',
        './assets/models/followers/fantasy_femalepeasant_01.glb',
        './assets/models/followers/dungeon_goblinshaman_01.glb',
        './assets/models/followers/adventure_viking_01.glb',
        './assets/models/followers/adventure_warrior_01.glb',
      ];
      return variants[entityId % variants.length];
    }
    if (meshId.includes('wall')) return './assets/models/buildings/wall_straight.glb';
    if (meshId.includes('door')) return './assets/models/buildings/door.glb';
    if (meshId.includes('bed')) return './assets/models/buildings/bed.glb';
    if (meshId.includes('altar') || meshId.includes('prayer')) return './assets/models/buildings/prayer_mat.glb';
    if (meshId.includes('cookpot') || meshId.includes('cooking')) return './assets/models/buildings/cooking_pot.glb';
    if (meshId.includes('desk') || meshId.includes('research')) return './assets/models/buildings/research_desk.glb';
    if (meshId.includes('ritual')) return './assets/models/buildings/ritual_circle.glb';
    return null;
  }

  private createPlaceholderMesh(meshId: string, entityId: number = 0): THREE.Mesh {
    if (meshId.startsWith('follower')) {
      // Enhanced follower: capsule body with tier color + head + status indicator + name label
      const root = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ visible: false }));

      // Determine tier color from FollowerAI component
      let tierColor = TIER_COLORS['average'] ?? 0x4a7fc1;
      let aiState: string = 'idle';
      if (entityId > 0) {
        const ai = this.world.getComponent(entityId, FollowerAI);
        if (ai) {
          tierColor = TIER_COLORS[ai.tier] ?? TIER_COLORS['average'] ?? 0x4a7fc1;
          aiState = ai.state;
        }
      }

      // Body — capsule geometry colored by tier
      const bodyGeom = new THREE.CapsuleGeometry(0.28, 0.6, 6, 12);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: tierColor,
        flatShading: true,
        roughness: 0.7,
        emissive: tierColor,
        emissiveIntensity: 0.1,
      });
      const body = new THREE.Mesh(bodyGeom, bodyMat);
      body.position.y = 0.65;
      body.castShadow = true;
      root.add(body);

      // Head (sphere)
      const headGeom = new THREE.SphereGeometry(0.2, 10, 8);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xe0c0a0, flatShading: true, roughness: 0.6 });
      const head = new THREE.Mesh(headGeom, headMat);
      head.position.y = 1.25;
      head.castShadow = true;
      root.add(head);

      // Hood (cone, same color as body)
      const hoodGeom = new THREE.ConeGeometry(0.26, 0.35, 6);
      const hoodMat = new THREE.MeshStandardMaterial({ color: tierColor, flatShading: true, roughness: 0.8 });
      const hood = new THREE.Mesh(hoodGeom, hoodMat);
      hood.position.y = 1.38;
      hood.castShadow = true;
      root.add(hood);

      // Status indicator — small sphere above head
      let statusColor = 0x000000;
      let showStatus = false;
      if (aiState === 'working') { statusColor = 0x00ff00; showStatus = true; }
      else if (aiState === 'sleeping') { statusColor = 0x4444ff; showStatus = true; }
      else if (aiState === 'needs') { statusColor = 0xff0000; showStatus = true; }

      if (showStatus) {
        const dotGeom = new THREE.SphereGeometry(0.06, 8, 6);
        const dotMat = new THREE.MeshStandardMaterial({
          color: statusColor,
          emissive: statusColor,
          emissiveIntensity: 0.8,
        });
        const dot = new THREE.Mesh(dotGeom, dotMat);
        dot.position.y = 1.7;
        root.add(dot);
      }

      // Name label floating above
      if (entityId > 0) {
        const name = this.followerNames.get(entityId);
        if (name) {
          const label = this.createTextSprite(name, '#dddddd', 24);
          label.position.y = 1.95;
          root.add(label);
        }
      }

      return root;
    }

    let geom: THREE.BufferGeometry;
    let color: number;

    if (meshId.includes('wall')) {
      geom = new THREE.BoxGeometry(0.85, 1.5, 0.85);
      color = 0x8a8a7a;
    } else if (meshId.includes('floor')) {
      geom = new THREE.BoxGeometry(0.95, 0.15, 0.95);
      color = 0x6a5a4a;
    } else if (meshId.includes('door')) {
      geom = new THREE.BoxGeometry(0.8, 1.2, 0.15);
      color = 0x5a3a2a;
    } else if (meshId.includes('bed')) {
      geom = new THREE.BoxGeometry(0.75, 0.4, 0.5);
      color = 0x8b6c5a;
    } else if (meshId.includes('altar')) {
      geom = new THREE.BoxGeometry(0.7, 0.5, 0.4);
      color = 0x6b4e8e;
    } else if (meshId.includes('cookpot')) {
      geom = new THREE.CylinderGeometry(0.3, 0.25, 0.35, 8);
      color = 0x3a3a3a;
    } else if (meshId.includes('desk')) {
      geom = new THREE.BoxGeometry(0.65, 0.45, 0.4);
      color = 0x6a5a3a;
    } else if (meshId.includes('box') || meshId.includes('storage')) {
      geom = new THREE.BoxGeometry(0.55, 0.45, 0.55);
      color = 0x8a6a4a;
    } else if (meshId.includes('torch')) {
      geom = new THREE.CylinderGeometry(0.08, 0.06, 0.6, 6);
      color = 0x5a3a1a;
    } else if (meshId.includes('bowl')) {
      geom = new THREE.CylinderGeometry(0.2, 0.15, 0.12, 8);
      color = 0xaa8855;
    } else if (meshId.includes('mat')) {
      geom = new THREE.BoxGeometry(0.65, 0.08, 0.4);
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

  clearBuildPreview(): void {
    this.clearVisualGroup(this.buildPreviewGroup);
  }

  showBuildPreview(tiles: BuildPreviewTile[], kind: ConstructionVisualKind | 'room'): void {
    this.clearBuildPreview();
    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
    const bs = this.buildingSystem;
    const cellSize = bs?.cellSize ?? 1;

    for (const pos of tiles) {
      const constructionSpace = pos.space === 'construction' ||
        (pos.space === undefined && kind !== 'room');
      const terrainCoord = constructionSpace && bs
        ? bs.toTerrainTile(pos.x, pos.y)
        : { x: pos.x, y: pos.y };
      const mapTile = this.map.getTile(terrainCoord.x, terrainCoord.y);
      if (!mapTile) continue;

      const terrainHeight = TERRAIN_HEIGHT[mapTile.terrain] ?? 0.3;
      const color = pos.valid ? 0x4ade80 : 0xef4444;
      const orientation = pos.orientation ?? 'horizontal';

      let geometry: THREE.BufferGeometry;
      let worldX: number;
      let worldZ: number;
      let y = terrainHeight + 0.04;

      if (constructionSpace) {
        if (kind === 'wall') {
          const thickness = Math.max(0.025, Math.min(0.08, cellSize * 0.35));
          const wallHeight = constructionWallHeight(cellSize);
          geometry = orientation === 'horizontal'
            ? new THREE.BoxGeometry(cellSize, wallHeight, thickness)
            : new THREE.BoxGeometry(thickness, wallHeight, cellSize);
          worldX = (orientation === 'horizontal' ? pos.x + 0.5 : pos.x) * cellSize + offset.x;
          worldZ = (orientation === 'horizontal' ? pos.y : pos.y + 0.5) * cellSize + offset.z;
          y = terrainHeight + constructionWallHeight(cellSize) / 2;
        } else if (kind === 'door') {
          const thickness = Math.max(0.025, Math.min(0.08, cellSize * 0.42));
          const doorHeight = constructionDoorHeight(cellSize);
          geometry = orientation === 'horizontal'
            ? new THREE.BoxGeometry(cellSize, doorHeight, thickness)
            : new THREE.BoxGeometry(thickness, doorHeight, cellSize);
          worldX = (orientation === 'horizontal' ? pos.x + 0.5 : pos.x) * cellSize + offset.x;
          worldZ = (orientation === 'horizontal' ? pos.y : pos.y + 0.5) * cellSize + offset.z;
          y = terrainHeight + constructionDoorHeight(cellSize) / 2;
        } else if (kind === 'object') {
          const objectSize = constructionObjectScale(cellSize);
          geometry = new THREE.BoxGeometry(objectSize, objectSize * 0.7, objectSize);
          worldX = (pos.x + 0.5) * cellSize + offset.x;
          worldZ = (pos.y + 0.5) * cellSize + offset.z;
          y = terrainHeight + constructionObjectScale(cellSize) * 0.35;
        } else {
          geometry = new THREE.BoxGeometry(cellSize * 0.96, 0.06, cellSize * 0.96);
          worldX = (pos.x + 0.5) * cellSize + offset.x;
          worldZ = (pos.y + 0.5) * cellSize + offset.z;
        }
      } else {
        geometry = new THREE.BoxGeometry(0.92, 0.08, 0.92);
        worldX = pos.x + offset.x + 0.5;
        worldZ = pos.y + offset.z + 0.5;
      }

      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: pos.valid ? 0.42 : 0.5,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(worldX, y, worldZ);
      this.buildPreviewGroup.add(mesh);
    }
  }

  setConstructionBlueprints(blueprints: ConstructionBlueprintVisual[]): void {
    this.clearVisualGroup(this.blueprintGroup);
    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
    const bs = this.buildingSystem;
    const cellSize = bs?.cellSize ?? 1;

    for (const blueprint of blueprints) {
      const constructionSpace = blueprint.space === 'construction';
      const terrainCoord = constructionSpace && bs
        ? bs.toTerrainTile(blueprint.x, blueprint.y)
        : { x: blueprint.x, y: blueprint.y };
      const mapTile = this.map.getTile(terrainCoord.x, terrainCoord.y);
      if (!mapTile) continue;
      const terrainHeight = TERRAIN_HEIGHT[mapTile.terrain] ?? 0.3;
      const orientation = blueprint.orientation ?? 'horizontal';

      let geometry: THREE.BufferGeometry;
      let worldX: number;
      let worldZ: number;
      let y = terrainHeight + 0.04;

      if (constructionSpace) {
        if (blueprint.kind === 'wall') {
          const thickness = Math.max(0.025, Math.min(0.08, cellSize * 0.35));
          const wallHeight = constructionWallHeight(cellSize);
          geometry = orientation === 'horizontal'
            ? new THREE.BoxGeometry(cellSize, wallHeight, thickness)
            : new THREE.BoxGeometry(thickness, wallHeight, cellSize);
          worldX = (orientation === 'horizontal' ? blueprint.x + 0.5 : blueprint.x) * cellSize + offset.x;
          worldZ = (orientation === 'horizontal' ? blueprint.y : blueprint.y + 0.5) * cellSize + offset.z;
          y = terrainHeight + constructionWallHeight(cellSize) / 2;
        } else if (blueprint.kind === 'door') {
          const thickness = Math.max(0.025, Math.min(0.08, cellSize * 0.42));
          const doorHeight = constructionDoorHeight(cellSize);
          geometry = orientation === 'horizontal'
            ? new THREE.BoxGeometry(cellSize, doorHeight, thickness)
            : new THREE.BoxGeometry(thickness, doorHeight, cellSize);
          worldX = (orientation === 'horizontal' ? blueprint.x + 0.5 : blueprint.x) * cellSize + offset.x;
          worldZ = (orientation === 'horizontal' ? blueprint.y : blueprint.y + 0.5) * cellSize + offset.z;
          y = terrainHeight + constructionDoorHeight(cellSize) / 2;
        } else if (blueprint.kind === 'object') {
          const objectSize = constructionObjectScale(cellSize);
          geometry = new THREE.BoxGeometry(objectSize, objectSize * 0.7, objectSize);
          worldX = (blueprint.x + 0.5) * cellSize + offset.x;
          worldZ = (blueprint.y + 0.5) * cellSize + offset.z;
          y = terrainHeight + constructionObjectScale(cellSize) * 0.35;
        } else {
          geometry = new THREE.BoxGeometry(cellSize * 0.96, 0.05, cellSize * 0.96);
          worldX = (blueprint.x + 0.5) * cellSize + offset.x;
          worldZ = (blueprint.y + 0.5) * cellSize + offset.z;
        }
      } else {
        geometry = new THREE.BoxGeometry(0.9, 0.06, 0.9);
        worldX = blueprint.x + offset.x + 0.5;
        worldZ = blueprint.y + offset.z + 0.5;
      }

      const material = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.34,
        wireframe: blueprint.kind !== 'floor',
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(worldX, y, worldZ);
      mesh.rotation.y = blueprint.rotation ?? 0;
      mesh.userData.blueprintId = blueprint.id;
      this.blueprintGroup.add(mesh);
    }
  }

  setHarvestDesignations(orders: { id: string; kind: 'tree' | 'rock' | 'food'; x: number; y: number }[]): void {
    this.clearVisualGroup(this.harvestDesignationGroup);
    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };

    for (const order of orders) {
      const tile = this.map.getTile(order.x, order.y);
      if (!tile) continue;
      const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.3;
      const geometry = new THREE.RingGeometry(0.24, 0.34, 20);
      const material = new THREE.MeshBasicMaterial({
        color: order.kind === 'food' ? 0x84cc16 : 0xf59e0b,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(order.x + offset.x + 0.5, height + 0.045, order.y + offset.z + 0.5);
      marker.userData.harvestOrderId = order.id;
      this.harvestDesignationGroup.add(marker);
    }
  }

  setLogisticsVisuals(
    stacks: Array<{ id: string; kind: string; quantity: number; x: number; y: number; state: string }>,
    stockpiles: Array<{ id: string; cells: { x: number; y: number }[] }>,
    constructionSubdivisions: number,
  ): void {
    this.clearVisualGroup(this.logisticsGroup);
    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
    const cellSize = 1 / Math.max(1, constructionSubdivisions);

    // Stockpile zones are intentionally subtle so furnishings remain readable.
    const zoneMaterial = new THREE.MeshBasicMaterial({
      color: 0x4f8f68,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const zoneGeometry = new THREE.PlaneGeometry(cellSize * 0.94, cellSize * 0.94);
    for (const zone of stockpiles) {
      for (const cell of zone.cells) {
        const terrainX = Math.floor(cell.x / constructionSubdivisions);
        const terrainY = Math.floor(cell.y / constructionSubdivisions);
        const tile = this.map.getTile(terrainX, terrainY);
        if (!tile) continue;
        const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.3;
        const mesh = new THREE.Mesh(zoneGeometry.clone(), zoneMaterial.clone());
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(
          (cell.x + 0.5) * cellSize + offset.x,
          height + 0.035,
          (cell.y + 0.5) * cellSize + offset.z,
        );
        mesh.userData = { stockpileId: zone.id };
        this.logisticsGroup.add(mesh);
      }
    }
    zoneGeometry.dispose();
    zoneMaterial.dispose();

    const colors: Record<string, number> = {
      wood: 0x8b5a2b,
      stone: 0x8a9199,
      food: 0x76a94f,
      crop: 0xc7a94a,
      meal: 0xd9833b,
    };

    for (const stack of stacks) {
      if (stack.state === 'carried') continue;
      const terrainX = Math.max(0, Math.min(this.map.width - 1, Math.round(stack.x)));
      const terrainY = Math.max(0, Math.min(this.map.height - 1, Math.round(stack.y)));
      const tile = this.map.getTile(terrainX, terrainY);
      if (!tile) continue;
      const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.3;
      const size = Math.min(0.28, 0.12 + Math.log2(Math.max(1, stack.quantity)) * 0.025);
      const geometry = stack.kind === 'stone'
        ? new THREE.DodecahedronGeometry(size * 0.75, 0)
        : new THREE.BoxGeometry(size, size * 0.55, size);
      const material = new THREE.MeshStandardMaterial({
        color: colors[stack.kind] ?? 0xd1d5db,
        roughness: 0.85,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        stack.x + offset.x + 0.5,
        height + size * 0.35,
        stack.y + offset.z + 0.5,
      );
      mesh.castShadow = true;
      mesh.userData = { itemStackId: stack.id, itemKind: stack.kind, quantity: stack.quantity };
      this.logisticsGroup.add(mesh);
    }
  }

  private clearVisualGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      this.disposeObject(child);
    }
  }

  highlightTile(x: number, y: number): void {
    if (this.highlightMesh) {
      this.tileGroup.remove(this.highlightMesh);
      this.highlightMesh.geometry.dispose();
      (this.highlightMesh.material as THREE.Material).dispose();
      this.highlightMesh = null;
    }

    const tile = this.map.getTile(x, y);
    if (!tile) return;

    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
    const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.3;
    const geom = new THREE.BoxGeometry(0.94, height + 0.05, 0.94);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffff44, transparent: true, opacity: 0.35, depthWrite: false,
    });
    this.highlightMesh = new THREE.Mesh(geom, mat);
    this.highlightMesh.position.set(x + offset.x + 0.5, height + 0.02, y + offset.z + 0.5);
    this.tileGroup.add(this.highlightMesh);
  }

  getTileMesh(x: number, y: number): THREE.Mesh | null {
    return this.tileMeshes.get(`${x},${y}`) ?? null;
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  dispose(): void {
    this.selectionRing.geometry.dispose();
    (this.selectionRing.material as THREE.Material).dispose();
    this.followerDisplayOffsets.clear();
    this.tileMeshes.clear();
    this.entityMeshes.clear();
    this.mixers.clear();
    this.entityLights.clear();
    this.scene.remove(this.tileGroup);
    this.scene.remove(this.entityGroup);
    this.scene.remove(this.buildingGroup);
    this.clearVisualGroup(this.roofGroup);
    this.scene.remove(this.roofGroup);
    this.clearVisualGroup(this.buildPreviewGroup);
    this.clearVisualGroup(this.blueprintGroup);
    this.clearVisualGroup(this.harvestDesignationGroup);
    this.clearVisualGroup(this.logisticsGroup);
    this.scene.remove(this.buildPreviewGroup);
    this.scene.remove(this.blueprintGroup);
    this.scene.remove(this.harvestDesignationGroup);
    this.scene.remove(this.logisticsGroup);
    if (this.buildingFillLight) this.scene.remove(this.buildingFillLight);
  }
}