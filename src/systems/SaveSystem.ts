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
import { Schedule } from '../components/Schedule';
import { WorkPreferences } from '../components/WorkPreferences';
import { SocialState } from '../components/SocialState';
import { BeliefState } from '../components/BeliefState';
import type { TileMap } from '../world/TileMap';
import type { BuildingSnapshot } from './BuildingSystem';
import type { LogisticsSnapshot } from './LogisticsSystem';
import { ALPHA_SPATIAL_CONFIG } from '../world/Spatial';
import type { FarmingSnapshot } from './FarmingSystem';
import type { IdeologySnapshot } from './IdeologySystem';
import type { GlobalRegion } from '../world/GlobalWorld';
import { Outsider } from '../components/Outsider';
import type { OutsiderSnapshot } from './OutsiderSystem';

export interface SaveData {
  version: string;
  timestamp: number;
  world: SerializedWorld;
  tileMap: SerializedTileMap;
  cult: SerializedCult;
  time: { hour: number; day: number };
  settings: GameSettings;
  building?: BuildingSnapshot;
  construction?: SerializedConstructionBlueprint[];
  harvestOrders?: SerializedHarvestOrder[];
  logistics?: LogisticsSnapshot;
  farming?: FarmingSnapshot;
  ideology?: IdeologySnapshot;
  outsiders?: OutsiderSnapshot;
  worldStart?: {
    globalSeed: number;
    region: GlobalRegion;
    settlementPoint: { x: number; y: number };
  };
  spatial?: {
    constructionSubdivisions: number;
    navigationSubdivisions: number;
  };
}

export interface SerializedHarvestOrder {
  id: string;
  kind: 'tree' | 'rock' | 'food';
  x: number;
  y: number;
}

export type ConstructionOrientation = 'horizontal' | 'vertical';
export type ConstructionCoordinateSpace = 'local' | 'construction';

export interface SerializedConstructionBlueprint {
  id: string;
  kind: 'wall' | 'floor' | 'door' | 'object';
  x: number;
  y: number;
  /** Architecture uses the fine construction lattice; legacy/free objects use local tiles. */
  space?: ConstructionCoordinateSpace;
  /** Required for edge-based walls/doors. */
  orientation?: ConstructionOrientation;
  objectId?: string;
  rotation?: number;
  cost: number;
  /** Legacy aggregate material cost retained for older Alpha saves. */
  materialCost?: number;
  materialKind?: 'wood' | 'stone';
  requiredMaterials?: number;
  deliveredMaterials?: number;
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
  tiles: { terrain: string; occupied: boolean; buildable: boolean; roomId: number | null; decor?: string }[];
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
  materials?: number;
  food?: number;
}

export interface GameSettings {
  volume: number;
  autoSaveInterval: number;
  showTutorial: boolean;
}

const SAVE_VERSION = '0.8.0';
const SAVE_KEY_PREFIX = 'cult_tycoon_save_';
const AUTOSAVE_KEY = 'cult_tycoon_autosave';
const MAX_SLOTS = 6;

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
  serialize(
    world: World,
    tileMap: TileMap,
    cult: SerializedCult,
    time: { hour: number; day: number },
    building?: BuildingSnapshot,
    construction: SerializedConstructionBlueprint[] = [],
    harvestOrders: SerializedHarvestOrder[] = [],
    logistics?: LogisticsSnapshot,
    farming?: FarmingSnapshot,
    ideology?: IdeologySnapshot,
    outsiders?: OutsiderSnapshot,
    worldStart?: {
      globalSeed: number;
      region: GlobalRegion;
      settlementPoint: { x: number; y: number };
    },
  ): SaveData {
    const entities = world.allEntities();
    const serializedEntities: SerializedEntity[] = [];

    for (const entityId of entities) {
      const components: Record<string, any> = {};

      const transform = world.getComponent(entityId, Transform);
      if (transform) components.Transform = { x: transform.x, y: transform.y, z: transform.z, rotation: transform.rotation, scale: transform.scale };

      const renderable = world.getComponent(entityId, Renderable);
      if (renderable) components.Renderable = { meshId: renderable.meshId, visible: renderable.visible, tint: renderable.tint };

      const needs = world.getComponent(entityId, Needs);
      if (needs) components.Needs = { hunger: needs.hunger, faith: needs.faith, fun: needs.fun, health: needs.health, sanity: needs.sanity, energy: needs.energy, bladder: needs.bladder, hygiene: needs.hygiene, comfort: needs.comfort, social: needs.social };

      const job = world.getComponent(entityId, Job);
      if (job) components.Job = { jobId: job.jobId, type: job.type, priority: job.priority, targetTile: job.targetTile, workProgress: job.workProgress };

      const skills = world.getComponent(entityId, Skills);
      if (skills) components.Skills = { cooking: skills.cooking, research: skills.research, construction: skills.construction, growing: skills.growing, faith: skills.faith, combat: skills.combat, social: skills.social, xp: { ...skills.xp }, passions: { ...skills.passions } };

      const traits = world.getComponent(entityId, Traits);
      if (traits) components.Traits = { traits: traits.traits };

      const health = world.getComponent(entityId, Health);
      if (health) components.Health = { hp: health.hp, maxHp: health.maxHp, statusEffects: health.statusEffects };

      const inventory = world.getComponent(entityId, Inventory);
      if (inventory) components.Inventory = { items: inventory.items, capacity: inventory.capacity };

      const schedule = world.getComponent(entityId, Schedule);
      if (schedule) components.Schedule = {
        shift: schedule.shift,
        sleepStartHour: schedule.sleepStartHour,
        sleepDuration: schedule.sleepDuration,
        hours: [...schedule.hours],
      };

      const outsider = world.getComponent(entityId, Outsider);
      if (outsider) components.Outsider = {
        name: outsider.name,
        state: outsider.state,
        stayRemaining: outsider.stayRemaining,
        recruitmentProgress: outsider.recruitmentProgress,
        recruitmentCooldown: outsider.recruitmentCooldown,
        path: outsider.path.map(point => ({ ...point })),
        pathIndex: outsider.pathIndex,
        exitTarget: outsider.exitTarget ? { ...outsider.exitTarget } : null,
      };

      const beliefState = world.getComponent(entityId, BeliefState);
      if (beliefState) components.BeliefState = {
        strength: beliefState.strength,
        values: { ...beliefState.values },
        assignedRole: beliefState.assignedRole,
        conversionProgress: beliefState.conversionProgress,
      };

      const socialState = world.getComponent(entityId, SocialState);
      if (socialState) components.SocialState = {
        mood: socialState.mood,
        memories: socialState.memories.map(memory => ({ ...memory })),
        relationships: Object.fromEntries(
          Object.entries(socialState.relationships).map(([key, value]) => [key, { ...value }]),
        ),
        activeBreak: socialState.activeBreak ? { ...socialState.activeBreak } : null,
        interactionCooldown: socialState.interactionCooldown,
        breakCooldown: socialState.breakCooldown,
      };

      const workPreferences = world.getComponent(entityId, WorkPreferences);
      if (workPreferences) components.WorkPreferences = {
        role: workPreferences.role,
        priorities: { ...workPreferences.priorities },
      };

      const ai = world.getComponent(entityId, FollowerAI);
      if (ai) components.FollowerAI = {
        state: ai.state,
        path: ai.path,
        pathIndex: ai.pathIndex,
        stateTimer: ai.stateTimer,
        tier: ai.tier,
        roomEntityId: ai.roomEntityId,
        needTarget: ai.needTarget,
        needTargetTile: ai.needTargetTile,
      };

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
          decor: tile?.decor ?? 'none',
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
      building,
      construction: construction.map(blueprint => ({ ...blueprint })),
      harvestOrders: harvestOrders.map(order => ({ ...order })),
      logistics,
      farming,
      ideology,
      outsiders,
      worldStart,
      spatial: {
        constructionSubdivisions: ALPHA_SPATIAL_CONFIG.constructionSubdivisions,
        navigationSubdivisions: ALPHA_SPATIAL_CONFIG.navigationSubdivisions,
      },
    };
  }

  /**
   * Save to a specific slot (0-5). Slot -1 = autosave.
   */
  save(data: SaveData, slot: number = 0): boolean {
    try {
      const json = JSON.stringify(data);
      const key = slot === -1 ? AUTOSAVE_KEY : `${SAVE_KEY_PREFIX}${slot}`;
      localStorage.setItem(key, json);
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  /**
   * Load from a specific slot. Slot -1 = autosave.
   */
  load(slot: number = 0): SaveData | null {
    try {
      const key = slot === -1 ? AUTOSAVE_KEY : `${SAVE_KEY_PREFIX}${slot}`;
      const json = localStorage.getItem(key);
      if (!json) return null;
      const data = JSON.parse(json) as SaveData;
      if (data.version !== SAVE_VERSION) {
        // Alpha 8 introduced fine Construction/Navigation Space. Pre-0.8 saves
        // contain ambiguous building coordinates and are unsafe to migrate
        // implicitly; reject them rather than loading corrupted settlements.
        console.warn(`Incompatible save version: ${data.version} vs ${SAVE_VERSION}`);
        return null;
      }

      const spatial = data.spatial;
      if (
        !spatial ||
        spatial.constructionSubdivisions !== ALPHA_SPATIAL_CONFIG.constructionSubdivisions ||
        spatial.navigationSubdivisions !== ALPHA_SPATIAL_CONFIG.navigationSubdivisions
      ) {
        console.warn('Incompatible save spatial configuration; refusing to load.');
        return null;
      }

      return data;
    } catch (e) {
      console.error('Load failed:', e);
      return null;
    }
  }

  /**
   * Delete save in a specific slot.
   */
  deleteSave(slot: number = 0): boolean {
    try {
      const key = slot === -1 ? AUTOSAVE_KEY : `${SAVE_KEY_PREFIX}${slot}`;
      localStorage.removeItem(key);
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Check if a save exists in a specific slot.
   */
  hasSave(slot: number = 0): boolean {
    const key = slot === -1 ? AUTOSAVE_KEY : `${SAVE_KEY_PREFIX}${slot}`;
    return localStorage.getItem(key) !== null;
  }

  /**
   * Get info for all save slots (for save/load UI).
   */
  getSaveSlots(): { slot: number; exists: boolean; timestamp: number; day: number; cultName: string }[] {
    const slots: { slot: number; exists: boolean; timestamp: number; day: number; cultName: string }[] = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const json = localStorage.getItem(`${SAVE_KEY_PREFIX}${i}`);
      if (json) {
        try {
          const data = JSON.parse(json) as SaveData;
          slots.push({
            slot: i,
            exists: true,
            timestamp: data.timestamp,
            day: data.cult.day,
            cultName: data.cult.leaderName,
          });
        } catch {
          slots.push({ slot: i, exists: false, timestamp: 0, day: 0, cultName: '' });
        }
      } else {
        slots.push({ slot: i, exists: false, timestamp: 0, day: 0, cultName: '' });
      }
    }
    return slots;
  }

  /**
   * Autosave — saves to the autosave slot without overwriting manual saves.
   */
  autosave(data: SaveData): boolean {
    return this.save(data, -1);
  }

  /**
   * Check if autosave exists.
   */
  hasAutosave(): boolean {
    return localStorage.getItem(AUTOSAVE_KEY) !== null;
  }

  /**
   * Load autosave.
   */
  loadAutosave(): SaveData | null {
    return this.load(-1);
  }

  get maxSlots(): number { return MAX_SLOTS; }

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

      if (serialized.components.Schedule) {
        const schedule = new Schedule(entity);
        Object.assign(schedule, serialized.components.Schedule);
        world.addComponent(entity, schedule);
      }

      if (serialized.components.Outsider) {
        const outsider = new Outsider(entity);
        Object.assign(outsider, serialized.components.Outsider);
        world.addComponent(entity, outsider);
      }

      if (serialized.components.BeliefState) {
        const belief = new BeliefState(entity);
        Object.assign(belief, serialized.components.BeliefState);
        world.addComponent(entity, belief);
      }

      if (serialized.components.SocialState) {
        const social = new SocialState(entity);
        Object.assign(social, serialized.components.SocialState);
        world.addComponent(entity, social);
      }

      if (serialized.components.WorkPreferences) {
        const prefs = new WorkPreferences(entity);
        Object.assign(prefs, serialized.components.WorkPreferences);
        world.addComponent(entity, prefs);
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