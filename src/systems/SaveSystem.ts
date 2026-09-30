/**
 * SaveSystem — localStorage + JSON serialization for game state.
 * Saves: world entities/components, cult stats, tile map, time, settings.
 */

import type { World } from '../ecs/World';
import { Needs } from '../components/Needs';
import { Job } from '../components/Job';
import { Skills } from '../components/Skills';
import { Traits } from '../components/Traits';
import { Health } from '../components/Health';
import { FollowerAI } from '../components/FollowerAI';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { Inventory } from '../components/Inventory';
import type { TileMap } from '../world/TileMap';

export interface SaveData {
  version: string;
  timestamp: number;
  world: SerializedWorld;
  tileMap: SerializedTileMap;
  cult: SerializedCult;
  time: { hour: number; day: number };
  settings: GameSettings;
}

export interface SerializedWorld {
  nextEntityId: number;
  entities: SerializedEntity[];
}

export interface SerializedEntity {
  id: number;
  components: Record<string, any>;
}

export interface SerializedTileMap {
  width: number;
  height: number;
  tiles: { terrain: string; occupied: boolean; buildable: boolean; roomId: number | null }[];
}

export interface SerializedCult {
  influence: number;
  wealth: number;
  notoriety: number;
  faith: number;
  morale: number;
  population: number;
  maxPopulation: number;
  leaderName: string;
  leaderTitle: string;
  day: number;
  hour: number;
}

export interface GameSettings {
  volume: number;
  autoSaveInterval: number;
  showTutorial: boolean;
}

const SAVE_VERSION = '0.1.0';
const SAVE_KEY = 'cult_tycoon_save';

const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.7,
  autoSaveInterval: 300, // 5 minutes in seconds
  showTutorial: true,
};

export class SaveSystem {
  private settings: GameSettings;

  constructor(settings: Partial<GameSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  /**
   * Serialize the entire game state
   */
  serialize(world: World, tileMap: TileMap, cult: SerializedCult, time: { hour: number; day: number }): SaveData {
    const entities = world.allEntities();
    const serializedEntities: SerializedEntity[] = [];

    for (const entityId of entities) {
      const components: Record<string, any> = {};

      const transform = world.getComponent(entityId, Transform);
      if (transform) components.Transform = { x: transform.x, y: transform.y, z: transform.z, rotation: transform.rotation, scale: transform.scale };

      const renderable = world.getComponent(entityId, Renderable);
      if (renderable) components.Renderable = { meshId: renderable.meshId, visible: renderable.visible, tint: renderable.tint };

      const needs = world.getComponent(entityId, Needs);
      if (needs) components.Needs = { hunger: needs.hunger, faith: needs.faith, fun: needs.fun, health: needs.health, sanity: needs.sanity };

      const job = world.getComponent(entityId, Job);
      if (job) components.Job = { jobId: job.jobId, type: job.type, priority: job.priority, targetTile: job.targetTile, workProgress: job.workProgress };

      const skills = world.getComponent(entityId, Skills);
      if (skills) components.Skills = { cooking: skills.cooking, research: skills.research, construction: skills.construction, faith: skills.faith, combat: skills.combat, social: skills.social };

      const traits = world.getComponent(entityId, Traits);
      if (traits) components.Traits = { traits: traits.traits };

      const health = world.getComponent(entityId, Health);
      if (health) components.Health = { hp: health.hp, maxHp: health.maxHp, statusEffects: health.statusEffects };

      const inventory = world.getComponent(entityId, Inventory);
      if (inventory) components.Inventory = { items: inventory.items, capacity: inventory.capacity };

      const ai = world.getComponent(entityId, FollowerAI);
      if (ai) components.FollowerAI = { state: ai.state, path: ai.path, pathIndex: ai.pathIndex, stateTimer: ai.stateTimer };

      serializedEntities.push({ id: entityId, components });
    }

    // Serialize tile map
    const tiles: SerializedTileMap['tiles'] = [];
    for (let y = 0; y < tileMap.height; y++) {
      for (let x = 0; x < tileMap.width; x++) {
        const tile = tileMap.getTile(x, y);
        tiles.push({
          terrain: tile?.terrain ?? 'grass',
          occupied: tile?.occupied ?? false,
          buildable: tile?.buildable ?? true,
          roomId: tile?.roomId ?? null,
        });
      }
    }

    return {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      world: { nextEntityId: entities.length, entities: serializedEntities },
      tileMap: { width: tileMap.width, height: tileMap.height, tiles },
      cult,
      time,
      settings: this.settings,
    };
  }

  /**
   * Save to localStorage
   */
  save(data: SaveData): boolean {
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(SAVE_KEY, json);
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  /**
   * Load from localStorage
   */
  load(): SaveData | null {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return null;
      const data = JSON.parse(json) as SaveData;
      if (data.version !== SAVE_VERSION) {
        console.warn(`Save version mismatch: ${data.version} vs ${SAVE_VERSION}`);
      }
      return data;
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  }

  /**
   * Delete save file
   */
  deleteSave(): boolean {
    try {
      localStorage.removeItem(SAVE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if a save exists
   */
  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  /**
   * Deserialize world from save data
   */
  deserializeWorld(data: SaveData, world: World): void {
    world.clear();

    for (const serialized of data.world.entities) {
      const entity = world.createEntity();

      if (serialized.components.Transform) {
        const t = new Transform(entity);
        Object.assign(t, serialized.components.Transform);
        world.addComponent(entity, t);
      }

      if (serialized.components.Renderable) {
        const r = new Renderable(entity);
        Object.assign(r, serialized.components.Renderable);
        world.addComponent(entity, r);
      }

      if (serialized.components.Needs) {
        const n = new Needs(entity);
        Object.assign(n, serialized.components.Needs);
        world.addComponent(entity, n);
      }

      if (serialized.components.Job) {
        const j = new Job(entity);
        Object.assign(j, serialized.components.Job);
        world.addComponent(entity, j);
      }

      if (serialized.components.Skills) {
        const s = new Skills(entity);
        Object.assign(s, serialized.components.Skills);
        world.addComponent(entity, s);
      }

      if (serialized.components.Traits) {
        const tr = new Traits(entity);
        Object.assign(tr, serialized.components.Traits);
        world.addComponent(entity, tr);
      }

      if (serialized.components.Health) {
        const h = new Health(entity);
        Object.assign(h, serialized.components.Health);
        world.addComponent(entity, h);
      }

      if (serialized.components.Inventory) {
        const inv = new Inventory(entity);
        Object.assign(inv, serialized.components.Inventory);
        world.addComponent(entity, inv);
      }

      if (serialized.components.FollowerAI) {
        const ai = new FollowerAI(entity);
        Object.assign(ai, serialized.components.FollowerAI);
        world.addComponent(entity, ai);
      }
    }
  }

  /**
   * Get settings
   */
  getSettings(): GameSettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   */
  updateSettings(partial: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...partial };
  }

  /**
   * Get save version
   */
  get version(): string {
    return SAVE_VERSION;
  }
}