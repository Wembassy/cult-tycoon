import { describe, it, expect, beforeEach, vi } from 'vitest';
import { World } from '@ecs/World';
import { Needs } from '@components/Needs';
import { Job } from '@components/Job';
import { Skills } from '@components/Skills';
import { Traits } from '@components/Traits';
import { Health } from '@components/Health';
import { FollowerAI } from '@components/FollowerAI';
import { Transform } from '@components/Transform';
import { Renderable } from '@components/Renderable';
import { Inventory } from '@components/Inventory';
import { TileMap } from '@world/TileMap';
import { SaveSystem, SerializedCult } from '@systems/SaveSystem';

function createFollower(world: World): number {
  const entity = world.createEntity();
  const transform = new Transform(entity);
  transform.x = 5; transform.y = 5;
  world.addComponent(entity, transform);
  world.addComponent(entity, new Renderable(entity));
  world.addComponent(entity, new Needs(entity));
  world.addComponent(entity, new Job(entity));
  world.addComponent(entity, new Skills(entity));
  world.addComponent(entity, new Traits(entity));
  world.addComponent(entity, new Health(entity));
  world.addComponent(entity, new Inventory(entity));
  world.addComponent(entity, new FollowerAI(entity));
  return entity;
}

const TEST_CULT: SerializedCult = {
  influence: 150, wealth: 300, notoriety: 20,
  faith: 75, morale: 80, population: 5, maxPopulation: 10,
  leaderName: 'Chris', leaderTitle: 'Founder', day: 3, hour: 14,
};

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
};

vi.stubGlobal('localStorage', localStorageMock);

describe('SaveSystem — Serialization', () => {
  let world: World;
  let map: TileMap;
  let save: SaveSystem;

  beforeEach(() => {
    world = new World();
    map = new TileMap(8, 8);
    save = new SaveSystem();
    // Clear mock
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('should serialize world state', () => {
    createFollower(world);
    createFollower(world);
    const data = save.serialize(world, map, TEST_CULT, { hour: 10, day: 2 });

    expect(data.version).toBeTruthy();
    expect(data.world.entities).toHaveLength(2);
    expect(data.world.entities[0].components.Transform).toBeDefined();
    expect(data.world.entities[0].components.Needs).toBeDefined();
  });

  it('should serialize tile map', () => {
    map.setTerrain(3, 3, 'water');
    map.setOccupied(2, 2, true);
    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    expect(data.tileMap.width).toBe(8);
    expect(data.tileMap.tiles).toHaveLength(64);
    // Check water tile
    const waterTile = data.tileMap.tiles[3 * 8 + 3];
    expect(waterTile.terrain).toBe('water');
  });

  it('should serialize cult stats', () => {
    const data = save.serialize(world, map, TEST_CULT, { hour: 14, day: 3 });
    expect(data.cult.influence).toBe(150);
    expect(data.cult.wealth).toBe(300);
    expect(data.cult.leaderName).toBe('Chris');
  });

  it('should serialize time', () => {
    const data = save.serialize(world, map, TEST_CULT, { hour: 14, day: 3 });
    expect(data.time.hour).toBe(14);
    expect(data.time.day).toBe(3);
  });
});

describe('SaveSystem — Save/Load', () => {
  let world: World;
  let map: TileMap;
  let save: SaveSystem;

  beforeEach(() => {
    world = new World();
    map = new TileMap(8, 8);
    save = new SaveSystem();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('should save to localStorage', () => {
    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    const success = save.save(data);
    expect(success).toBe(true);
    expect(mockStorage['cult_tycoon_save']).toBeDefined();
  });

  it('should load from localStorage', () => {
    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    save.save(data);
    const loaded = save.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.cult.influence).toBe(150);
  });

  it('should return null when no save exists', () => {
    const loaded = save.load();
    expect(loaded).toBeNull();
  });

  it('should delete save', () => {
    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    save.save(data);
    expect(save.hasSave()).toBe(true);
    save.deleteSave();
    expect(save.hasSave()).toBe(false);
  });

  it('should detect existing save', () => {
    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    save.save(data);
    expect(save.hasSave()).toBe(true);
  });
});

describe('SaveSystem — Deserialization', () => {
  let world: World;
  let map: TileMap;
  let save: SaveSystem;

  beforeEach(() => {
    world = new World();
    map = new TileMap(8, 8);
    save = new SaveSystem();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('should restore entities and components', () => {
    const entity = createFollower(world);
    world.getComponent(entity, Needs)!.hunger = 42;

    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    save.save(data);

    // Create fresh world and load
    const newWorld = new World();
    save.deserializeWorld(save.load()!, newWorld);

    expect(newWorld.entityCount).toBe(1);
    const loadedNeeds = newWorld.getComponent(0, Needs);
    expect(loadedNeeds).toBeDefined();
    expect(loadedNeeds!.hunger).toBe(42);
  });

  it('should restore multiple entities', () => {
    createFollower(world);
    createFollower(world);
    createFollower(world);

    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    const newWorld = new World();
    save.deserializeWorld(data, newWorld);

    expect(newWorld.entityCount).toBe(3);
  });

  it('should clear world before deserializing', () => {
    createFollower(world);
    createFollower(world);

    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    const newWorld = new World();
    newWorld.createEntity(); // pre-existing entity
    save.deserializeWorld(data, newWorld);

    // Should have only the deserialized entities, not the pre-existing one
    expect(newWorld.entityCount).toBe(2);
  });
});

describe('SaveSystem — Settings', () => {
  it('should have default settings', () => {
    const save = new SaveSystem();
    const settings = save.getSettings();
    expect(settings.volume).toBe(0.7);
    expect(settings.autoSaveInterval).toBe(300);
    expect(settings.showTutorial).toBe(true);
  });

  it('should update settings', () => {
    const save = new SaveSystem();
    save.updateSettings({ volume: 0.5, showTutorial: false });
    const settings = save.getSettings();
    expect(settings.volume).toBe(0.5);
    expect(settings.showTutorial).toBe(false);
  });

  it('should accept custom initial settings', () => {
    const save = new SaveSystem({ volume: 0.3, autoSaveInterval: 60 });
    const settings = save.getSettings();
    expect(settings.volume).toBe(0.3);
    expect(settings.autoSaveInterval).toBe(60);
  });
});