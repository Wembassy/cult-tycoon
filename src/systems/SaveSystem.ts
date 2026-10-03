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
import type { TileMap } from '../world/TileMap';
import { OnMission } from '../components/OnMission';
import type { RitualSystem } from './RitualSystem';
import type { MissionSystem } from './MissionSystem';
import type { HeatSystem } from './HeatSystem';
import type { FogOfWar } from '../world/FogOfWar';
import type { GameState } from '../game/GameState';
import type { BuildingSnapshot } from './BuildingSystem';

export interface SaveData {
  version: string;
  timestamp: number;
  world: SerializedWorld;
  tileMap: SerializedTileMap;
  cult: SerializedCult;
  time: { hour: number; day: number };
  settings: GameSettings;
  building?: BuildingSnapshot;
  session?: {
    rituals?: ReturnType<RitualSystem['snapshot']>;
    elapsed: number;
    resources: GameState['resources'];
    tech: string[];
    names: [number, string][];
    missions: ReturnType<MissionSystem['snapshot']>;
    heat: ReturnType<HeatSystem['snapshot']>;
    fog: ReturnType<FogOfWar['snapshot']>;
    camera: { x: number; y: number; zoom: number };
  };
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
  tiles: {
    terrain: string;
    occupied: boolean;
    buildable: boolean;
    roomId: number | null;
    decor?: string;
  }[];
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

const SAVE_VERSION = '0.5.0';
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
  ): SaveData {
    const entities = world.allEntities();
    const serializedEntities: SerializedEntity[] = [];

    for (const entityId of entities) {
      const components: Record<string, any> = {};

      const transform = world.getComponent(entityId, Transform);
      if (transform)
        components.Transform = {
          x: transform.x,
          y: transform.y,
          z: transform.z,
          rotation: transform.rotation,
          scale: transform.scale,
        };

      const renderable = world.getComponent(entityId, Renderable);
      if (renderable)
        components.Renderable = {
          meshId: renderable.meshId,
          visible: renderable.visible,
          tint: renderable.tint,
        };

      const needs = world.getComponent(entityId, Needs);
      if (needs)
        components.Needs = {
          hunger: needs.hunger,
          faith: needs.faith,
          fun: needs.fun,
          health: needs.health,
          sanity: needs.sanity,
          energy: needs.energy,
          bladder: needs.bladder,
          hygiene: needs.hygiene,
        };

      const job = world.getComponent(entityId, Job);
      if (job)
        components.Job = {
          jobId: job.jobId,
          type: job.type,
          priority: job.priority,
          targetTile: job.targetTile,
          workProgress: job.workProgress,
        };

      const skills = world.getComponent(entityId, Skills);
      if (skills)
        components.Skills = {
          cooking: skills.cooking,
          research: skills.research,
          construction: skills.construction,
          faith: skills.faith,
          combat: skills.combat,
          social: skills.social,
        };

      const traits = world.getComponent(entityId, Traits);
      if (traits) components.Traits = { traits: traits.traits };

      const health = world.getComponent(entityId, Health);
      if (health)
        components.Health = {
          hp: health.hp,
          maxHp: health.maxHp,
          statusEffects: health.statusEffects,
        };

      const inventory = world.getComponent(entityId, Inventory);
      if (inventory)
        components.Inventory = { items: inventory.items, capacity: inventory.capacity };

      const schedule = world.getComponent(entityId, Schedule);
      if (schedule)
        components.Schedule = {
          shift: schedule.shift,
          sleepStartHour: schedule.sleepStartHour,
          sleepDuration: schedule.sleepDuration,
        };

      const workPreferences = world.getComponent(entityId, WorkPreferences);
      if (workPreferences)
        components.WorkPreferences = {
          role: workPreferences.role,
          priorities: { ...workPreferences.priorities },
        };

      const mission = world.getComponent(entityId, OnMission);
      if (mission) components.OnMission = { missionId: mission.missionId };

      const ai = world.getComponent(entityId, FollowerAI);
      if (ai)
        components.FollowerAI = {
          state: ai.state,
          path: ai.path,
          pathIndex: ai.pathIndex,
          stateTimer: ai.stateTimer,
          tier: ai.tier,
          roomEntityId: ai.roomEntityId,
          needTarget: ai.needTarget,
          needTargetTile: ai.needTargetTile,
          needFacilityId: ai.needFacilityId,
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
      if (
        !data ||
        !data.world ||
        !Array.isArray(data.world.entities) ||
        !data.tileMap ||
        !Array.isArray(data.tileMap.tiles) ||
        !data.cult ||
        !data.time
      )
        return null;
      if (
        ![
          data.cult.wealth,
          data.cult.influence,
          data.cult.notoriety,
          data.time.hour,
          data.time.day,
        ].every(Number.isFinite)
      )
        return null;
      if (
        !Number.isInteger(data.tileMap.width) ||
        !Number.isInteger(data.tileMap.height) ||
        data.tileMap.width < 1 ||
        data.tileMap.height < 1 ||
        data.tileMap.width > 256 ||
        data.tileMap.height > 256
      )
        return null;
      if (data.tileMap.tiles.length !== data.tileMap.width * data.tileMap.height) return null;
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
  getSaveSlots(): {
    slot: number;
    exists: boolean;
    timestamp: number;
    day: number;
    cultName: string;
  }[] {
    return Array.from({ length: MAX_SLOTS }, (_, slot) => {
      const data = this.load(slot);
      return {
        slot,
        exists: !!data,
        timestamp: data?.timestamp ?? 0,
        day: data?.time.day ?? 0,
        cultName: data?.cult.leaderName ?? '',
      };
    });
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

  get maxSlots(): number {
    return MAX_SLOTS;
  }

  /**
   * Deserialize world from save data
   */
  deserializeWorld(data: SaveData, world: World): void {
    world.clear();

    for (const serialized of data.world.entities) {
      const entity = world.createEntity(serialized.id);

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

      if (serialized.components.WorkPreferences) {
        const prefs = new WorkPreferences(entity);
        Object.assign(prefs, serialized.components.WorkPreferences);
        world.addComponent(entity, prefs);
      }

      if (serialized.components.OnMission) {
        const mission = new OnMission(entity);
        Object.assign(mission, serialized.components.OnMission);
        world.addComponent(entity, mission);
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
