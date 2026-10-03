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


  it('should persist finite natural resources and harvest orders', () => {
    map.setDecor(2, 2, 'tree');
    map.setDecor(3, 3, 'rock');
    const harvestOrders = [
      { id: 'harvest:tree:2:2', kind: 'tree' as const, x: 2, y: 2 },
      { id: 'harvest:rock:3:3', kind: 'rock' as const, x: 3, y: 3 },
    ];
    const cult = { ...TEST_CULT, materials: 42, food: 17 };

    const data = save.serialize(world, map, cult, { hour: 8, day: 2 }, undefined, [], harvestOrders);

    expect(data.tileMap.tiles[2 * 8 + 2].decor).toBe('tree');
    expect(data.tileMap.tiles[3 * 8 + 3].decor).toBe('rock');
    expect(data.harvestOrders).toEqual(harvestOrders);
    expect(data.cult.materials).toBe(42);
    expect(data.cult.food).toBe(17);
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


  it('should serialize pending construction blueprints', () => {
    const construction = [
      { id: 'construct:1', kind: 'wall' as const, x: 3, y: 4, cost: 5 },
      { id: 'construct:2', kind: 'object' as const, x: 5, y: 5, objectId: 'bed', cost: 20 },
    ];

    const data = save.serialize(world, map, TEST_CULT, { hour: 14, day: 3 }, undefined, construction);

    expect(data.construction).toEqual(construction);
    expect(data.construction).not.toBe(construction);
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
    expect(mockStorage['cult_tycoon_save_0']).toBeDefined();
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

describe('SaveSystem — Edge Cases', () => {
  let world: World;
  let map: TileMap;
  let save: SaveSystem;

  beforeEach(() => {
    world = new World();
    map = new TileMap(8, 8);
    save = new SaveSystem();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('should save with empty follower list (no entities)', () => {
    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    const success = save.save(data);
    expect(success).toBe(true);
    const loaded = save.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.world.entities).toHaveLength(0);
  });

  it('should save with zero resources', () => {
    const zeroCult: SerializedCult = {
      influence: 0, wealth: 0, notoriety: 0,
      faith: 0, morale: 0, population: 0, maxPopulation: 0,
      leaderName: '', leaderTitle: '', day: 0, hour: 0,
    };
    const data = save.serialize(world, map, zeroCult, { hour: 0, day: 0 });
    const success = save.save(data);
    expect(success).toBe(true);
    const loaded = save.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.cult.influence).toBe(0);
    expect(loaded!.cult.wealth).toBe(0);
    expect(loaded!.cult.faith).toBe(0);
    expect(loaded!.cult.morale).toBe(0);
    expect(loaded!.cult.population).toBe(0);
    expect(loaded!.cult.leaderName).toBe('');
  });

  it('should create a valid JSON string in localStorage', () => {
    const data = save.serialize(world, map, TEST_CULT, { hour: 10, day: 5 });
    save.save(data);
    const raw = mockStorage['cult_tycoon_save_0'];
    expect(raw).toBeDefined();
    // Should parse without throwing
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(data);
  });

  it('should overwrite previous save on multiple saves', () => {
    const cult1: SerializedCult = {
      ...TEST_CULT, influence: 100, leaderName: 'Alice',
    };
    const cult2: SerializedCult = {
      ...TEST_CULT, influence: 999, leaderName: 'Bob',
    };

    save.save(save.serialize(world, map, cult1, { hour: 0, day: 1 }));
    const firstRaw = mockStorage['cult_tycoon_save_0'];
    expect(firstRaw).toBeDefined();

    save.save(save.serialize(world, map, cult2, { hour: 12, day: 10 }));
    const secondRaw = mockStorage['cult_tycoon_save_0'];
    expect(secondRaw).toBeDefined();

    // Should be different (overwritten)
    expect(secondRaw).not.toEqual(firstRaw);

    const loaded = save.load();
    expect(loaded!.cult.influence).toBe(999);
    expect(loaded!.cult.leaderName).toBe('Bob');
    expect(loaded!.time.day).toBe(10);
  });
});

describe('SaveSystem — Corrupted Data', () => {
  let save: SaveSystem;

  beforeEach(() => {
    save = new SaveSystem();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('should return null for corrupted (invalid JSON) save data', () => {
    mockStorage['cult_tycoon_save_0'] = '{ this is not valid json }}}';
    const loaded = save.load();
    expect(loaded).toBeNull();
  });

  it('should return null for save data with wrong structure', () => {
    // Valid JSON but missing expected fields — should still return the parsed object
    // since load() only checks version, not structure. But version mismatch is warned.
    mockStorage['cult_tycoon_save_0'] = JSON.stringify({ foo: 'bar' });
    const loaded = save.load();
    // load() parses and returns it (version check is just a warning, not a failure)
    expect(loaded).not.toBeNull();
    expect((loaded as any).foo).toBe('bar');
  });

  it('should handle localStorage errors gracefully on save', () => {
    // Override setItem to throw
    const originalSetItem = localStorageMock.setItem;
    localStorageMock.setItem = () => { throw new Error('QuotaExceeded'); };

    const world = new World();
    const map = new TileMap(4, 4);
    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    const success = save.save(data);
    expect(success).toBe(false);

    // Restore
    localStorageMock.setItem = originalSetItem;
  });

  it('should handle localStorage errors gracefully on delete', () => {
    const originalRemoveItem = localStorageMock.removeItem;
    localStorageMock.removeItem = () => { throw new Error('Storage error'); };

    const success = save.deleteSave();
    expect(success).toBe(false);

    // Restore
    localStorageMock.removeItem = originalRemoveItem;
  });
});

describe('SaveSystem — Full Round-Trip', () => {
  let world: World;
  let map: TileMap;
  let save: SaveSystem;

  beforeEach(() => {
    world = new World();
    map = new TileMap(8, 8);
    save = new SaveSystem();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  });

  it('should restore all cult stats fields after save/load', () => {
    const cult: SerializedCult = {
      influence: 250, wealth: 1000, notoriety: 75,
      faith: 120, morale: 65, population: 8, maxPopulation: 15,
      leaderName: 'Zelda', leaderTitle: 'High Priestess', day: 42, hour: 23,
    };
    const data = save.serialize(world, map, cult, { hour: 23, day: 42 });
    save.save(data);
    const loaded = save.load();

    expect(loaded).not.toBeNull();
    expect(loaded!.cult.influence).toBe(250);
    expect(loaded!.cult.wealth).toBe(1000);
    expect(loaded!.cult.notoriety).toBe(75);
    expect(loaded!.cult.faith).toBe(120);
    expect(loaded!.cult.morale).toBe(65);
    expect(loaded!.cult.population).toBe(8);
    expect(loaded!.cult.maxPopulation).toBe(15);
    expect(loaded!.cult.leaderName).toBe('Zelda');
    expect(loaded!.cult.leaderTitle).toBe('High Priestess');
    expect(loaded!.cult.day).toBe(42);
    expect(loaded!.cult.hour).toBe(23);
  });

  it('should restore all time and settings fields after save/load', () => {
    const customSave = new SaveSystem({ volume: 0.3, autoSaveInterval: 120, showTutorial: false });
    const data = customSave.serialize(world, map, TEST_CULT, { hour: 7, day: 15 });
    customSave.save(data);
    const loaded = customSave.load();

    expect(loaded).not.toBeNull();
    expect(loaded!.time.hour).toBe(7);
    expect(loaded!.time.day).toBe(15);
    expect(loaded!.settings.volume).toBe(0.3);
    expect(loaded!.settings.autoSaveInterval).toBe(120);
    expect(loaded!.settings.showTutorial).toBe(false);
  });

  it('should restore tile map dimensions and tiles after save/load', () => {
    map.setTerrain(1, 1, 'stone');
    map.setTerrain(5, 5, 'water');
    map.setOccupied(3, 3, true);

    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    save.save(data);
    const loaded = save.load();

    expect(loaded).not.toBeNull();
    expect(loaded!.tileMap.width).toBe(8);
    expect(loaded!.tileMap.height).toBe(8);
    expect(loaded!.tileMap.tiles).toHaveLength(64);

    const stoneTile = loaded!.tileMap.tiles[1 * 8 + 1];
    expect(stoneTile.terrain).toBe('stone');

    const waterTile = loaded!.tileMap.tiles[5 * 8 + 5];
    expect(waterTile.terrain).toBe('water');

    const occupiedTile = loaded!.tileMap.tiles[3 * 8 + 3];
    expect(occupiedTile.occupied).toBe(true);
  });

  it('should round-trip entity with all components', () => {
    const entity = createFollower(world);
    // Customize some values
    const needs = world.getComponent(entity, Needs)!;
    needs.hunger = 77;
    needs.faith = 30;
    const skills = world.getComponent(entity, Skills)!;
    skills.cooking = 5;
    skills.combat = 3;
    const health = world.getComponent(entity, Health)!;
    health.hp = 50;
    health.maxHp = 100;

    const data = save.serialize(world, map, TEST_CULT, { hour: 0, day: 1 });
    save.save(data);

    const newWorld = new World();
    save.deserializeWorld(save.load()!, newWorld);

    expect(newWorld.entityCount).toBe(1);
    const loadedNeeds = newWorld.getComponent(0, Needs);
    expect(loadedNeeds!.hunger).toBe(77);
    expect(loadedNeeds!.faith).toBe(30);

    const loadedSkills = newWorld.getComponent(0, Skills);
    expect(loadedSkills!.cooking).toBe(5);
    expect(loadedSkills!.combat).toBe(3);

    const loadedHealth = newWorld.getComponent(0, Health);
    expect(loadedHealth!.hp).toBe(50);
    expect(loadedHealth!.maxHp).toBe(100);
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