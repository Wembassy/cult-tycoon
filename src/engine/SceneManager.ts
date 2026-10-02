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
import { Needs } from '../components/Needs';
import type { AssetLoader } from './AssetLoader';
import { FogOfWar } from '../world/FogOfWar';
import type { BuildingSystem } from '../systems/BuildingSystem';
import { TIER_COLORS, getBuildingModel, getWorkStation, type WorkStationConfig } from '../data/BuildingModels';

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

const TILE_SIZE = 1;

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
  private highlightMesh: THREE.Mesh | null = null;
  private tileMeshes: Map<string, THREE.Mesh> = new Map();
  private entityMeshes: Map<number, THREE.Object3D> = new Map();
  private entityMeshIsPlaceholder: Map<number, boolean> = new Map();
  private mixers: Map<number, THREE.AnimationMixer> = new Map();
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
    this.buildingGroup = new THREE.Group();
    this.buildingGroup.name = 'buildings';
    this.scene.add(this.tileGroup);
    this.scene.add(this.entityGroup);
    this.scene.add(this.buildingGroup);

    // Fill light to enhance isometric view — softens shadows from the front
    this.buildingFillLight = new THREE.DirectionalLight(0x99bbdd, 0.35);
    this.buildingFillLight.position.set(-10, 15, -10);
    this.scene.add(this.buildingFillLight);
  }

  setAssetLoader(assets: AssetLoader): void { this.assets = assets; }

  setFog(fog: FogOfWar): void { this.fog = fog; }

  setBuildingSystem(bs: BuildingSystem): void { this.buildingSystem = bs; }

  setFollowerNames(names: Map<number, string>): void { this.followerNames = names; }

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
        if (this.fog.isExplored(tileCoord.x, tileCoord.y)) {
          (mesh.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.3);
          (mesh.material as THREE.MeshStandardMaterial).transparent = true;
          (mesh.material as THREE.MeshStandardMaterial).opacity = 0.5;
        } else {
          mesh.visible = false;
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
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 1 });
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
          mesh.visible = false;
        } else if (state === 'explored') {
          (mesh.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.3);
          (mesh.material as THREE.MeshStandardMaterial).transparent = true;
          (mesh.material as THREE.MeshStandardMaterial).opacity = 0.5;
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
    while (this.buildingGroup.children.length > 0) {
      const child = this.buildingGroup.children[0];
      this.buildingGroup.remove(child);
      this.disposeObject(child);
    }

    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };

    // Render walls as extruded boxes
    for (const tileKey of bs.wallTiles) {
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
      this.buildingGroup.add(wall);
    }

    // Render doors as distinct meshes (shorter, different color, arched top)
    for (const tileKey of bs.doorTiles) {
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
      this.buildingGroup.add(door);

      // Door frame — two small posts
      const postGeom = new THREE.BoxGeometry(0.1, 1.4, 0.1);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, flatShading: true });
      const post1 = new THREE.Mesh(postGeom, postMat);
      post1.position.set(x + offset.x + 0.5 - 0.4, height + 0.7, y + offset.z + 0.5);
      post1.castShadow = true;
      this.buildingGroup.add(post1);
      const post2 = new THREE.Mesh(postGeom, postMat);
      post2.position.set(x + offset.x + 0.5 + 0.4, height + 0.7, y + offset.z + 0.5);
      post2.castShadow = true;
      this.buildingGroup.add(post2);
    }

    // Render floors as flat planes with slight color variation
    for (const tileKey of bs.floorTiles) {
      const [x, y] = tileKey.split(',').map(Number);
      const tile = this.map.getTile(x, y);
      if (!tile) continue;

      const roomId = tile.roomId;
      const room = roomId !== null ? bs.getRoom(roomId) : null;
      const model = room ? getBuildingModel(room.type) : getBuildingModel('generic');

      const floorGeom = new THREE.PlaneGeometry(0.95, 0.95);
      const floorMat = new THREE.MeshStandardMaterial({
        color: model.color,
        flatShading: true,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      const floor = new THREE.Mesh(floorGeom, floorMat);
      floor.rotation.x = -Math.PI / 2;
      const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;
      floor.position.set(x + offset.x + 0.5, height + 0.02, y + offset.z + 0.5);
      floor.receiveShadow = true;
      this.buildingGroup.add(floor);
    }

    // Render placed objects (beds, altars, etc.)
    for (const obj of bs.getAllObjects()) {
      const tile = this.map.getTile(obj.x, obj.y);
      if (!tile) continue;

      const objMesh = this.createObjectMesh(obj.type);
      if (objMesh) {
        const height = TERRAIN_HEIGHT[tile.terrain] ?? 0.5;
        objMesh.position.set(obj.x + offset.x + 0.5, height, obj.y + offset.z + 0.5);
        this.buildingGroup.add(objMesh);
      }
    }

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
    const entities = this.world.query([Transform, Renderable]);
    const seen = new Set<number>();

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
            const modelScale = 0.06;
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

            // Animation: Polygon Minis models often have T-pose/worship animations
            // that make characters stand with arms outstretched. If the rest pose
            // looks better, we skip animations. For now, use rest pose (no mixer)
            // since the available animations all appear to be worship/ritual poses.
            const asset = this.assets!.get(assetPath);
            if (asset && asset.animations.length > 0) {
              // Check if any animation has "idle" or "walk" in its name
              const idleAnim = asset.animations.find(a =>
                a.name.toLowerCase().includes('idle') ||
                a.name.toLowerCase().includes('walk') ||
                a.name.toLowerCase().includes('stand')
              );
              if (idleAnim) {
                const mixer = new THREE.AnimationMixer(cloned);
                const action = mixer.clipAction(idleAnim);
                action.play();
                this.mixers.set(entity, mixer);
              }
              // Otherwise, use rest pose — no animation mixer needed.
            }

            // No point light — was creating visible beams in the scene.
            // The scene's ambient and directional lighting is sufficient.
          }
        }

        if (!obj) {
          const mesh = this.createPlaceholderMesh(renderable.meshId, entity);
          obj = mesh;
          this.entityGroup.add(obj);
          this.entityMeshes.set(entity, obj);
          this.entityMeshIsPlaceholder.set(entity, true);
        }
      }

      // Smooth position
      const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
      const targetX = transform.x + offset.x + 0.5;
      const targetZ = transform.y + offset.z + 0.5;

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

      // Rotate followers to face outward from center, with per-entity variation.
      // Non-followers use transform.rotation directly.
      if (renderable.meshId.startsWith('follower')) {
        // Face toward camera-ish direction with slight per-entity variation
        const mapCenterX = this.map.width / 2;
        const mapCenterY = this.map.height / 2;
        const dx = transform.x - mapCenterX;
        const dy = transform.y - mapCenterY;
        const angleToCenter = Math.atan2(dx, -dy);
        // Add per-entity offset so they don't all face exactly the same way
        const variation = ((entity * 73) % 360) * (Math.PI / 180) * 0.3;
        const targetRot = angleToCenter + Math.PI + variation;
        // Smooth rotation
        let rotDiff = targetRot - obj.rotation.y;
        // Normalize to [-PI, PI]
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        obj.rotation.y += rotDiff * 0.1;
      } else {
        obj.rotation.y = transform.rotation;
      }

      obj.position.y += (baseY - obj.position.y) * 0.15;
    }

    // Update animation mixers
    const now = performance.now();
    const dt = this.lastAnimTime > 0 ? (now - this.lastAnimTime) / 1000 : 0;
    this.lastAnimTime = now;
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
        this.entityLights.delete(entityId);
      }
    }
  }

  private getAssetPath(meshId: string, entityId: number = 0): string | null {
    if (meshId.startsWith('follower')) {
      // Real fantasy character GLBs — cult-appropriate variants.
      // Use entityId (not meshId hash) so different followers get different models.
      const variants = [
        '/assets/models/followers/fantasy_wizard_01.glb',
        '/assets/models/followers/fantasy_sorcerer_01.glb',
        '/assets/models/followers/fantasy_witch_01.glb',
        '/assets/models/followers/fantasy_druid_01.glb',
        '/assets/models/followers/fantasy_bard_01.glb',
        '/assets/models/followers/fantasy_gypsy_01.glb',
        '/assets/models/followers/fantasy_rougemale_01.glb',
        '/assets/models/followers/fantasy_malepeasant_01.glb',
        '/assets/models/followers/fantasy_femalepeasant_01.glb',
        '/assets/models/followers/dungeon_goblinshaman_01.glb',
        '/assets/models/followers/adventure_viking_01.glb',
        '/assets/models/followers/adventure_warrior_01.glb',
      ];
      return variants[entityId % variants.length];
    }
    if (meshId.includes('wall')) return '/assets/models/buildings/wall_straight.glb';
    if (meshId.includes('door')) return '/assets/models/buildings/door.glb';
    if (meshId.includes('bed')) return '/assets/models/buildings/bed.glb';
    if (meshId.includes('altar') || meshId.includes('prayer')) return '/assets/models/buildings/prayer_mat.glb';
    if (meshId.includes('cookpot') || meshId.includes('cooking')) return '/assets/models/buildings/cooking_pot.glb';
    if (meshId.includes('desk') || meshId.includes('research')) return '/assets/models/buildings/research_desk.glb';
    if (meshId.includes('ritual')) return '/assets/models/buildings/ritual_circle.glb';
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
    const geom = new THREE.BoxGeometry(1.02, height + 0.05, 1.02);
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
    this.tileMeshes.clear();
    this.entityMeshes.clear();
    this.mixers.clear();
    this.entityLights.clear();
    this.scene.remove(this.tileGroup);
    this.scene.remove(this.entityGroup);
  }
}