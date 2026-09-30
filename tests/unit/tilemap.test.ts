import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap } from '@world/TileMap';
import { WorldGen } from '@world/WorldGen';

describe('TileMap — Basic Operations', () => {
  let map: TileMap;

  beforeEach(() => {
    map = new TileMap(16, 16);
  });

  it('should create a map with correct dimensions', () => {
    expect(map.width).toBe(16);
    expect(map.height).toBe(16);
  });

  it('should initialize all tiles as grass', () => {
    const tile = map.getTile(0, 0);
    expect(tile).not.toBeNull();
    expect(tile!.terrain).toBe('grass');
    expect(tile!.buildable).toBe(true);
    expect(tile!.occupied).toBe(false);
    expect(tile!.roomId).toBeNull();
  });

  it('should return null for out-of-bounds tiles', () => {
    expect(map.getTile(-1, 0)).toBeNull();
    expect(map.getTile(0, -1)).toBeNull();
    expect(map.getTile(16, 0)).toBeNull();
    expect(map.getTile(0, 16)).toBeNull();
  });

  it('should set terrain types correctly', () => {
    map.setTerrain(5, 5, 'water');
    const tile = map.getTile(5, 5);
    expect(tile!.terrain).toBe('water');
    expect(tile!.buildable).toBe(false);
  });

  it('should track occupancy', () => {
    expect(map.isOccupied(3, 3)).toBe(false);
    map.setOccupied(3, 3, true);
    expect(map.isOccupied(3, 3)).toBe(true);
    expect(map.isBuildable(3, 3)).toBe(false);
  });

  it('should track room IDs', () => {
    map.setRoomId(2, 2, 1);
    map.setRoomId(2, 3, 1);
    map.setRoomId(3, 2, 1);
    const roomTiles = map.getRoomTiles(1);
    expect(roomTiles).toHaveLength(3);
  });

  it('should get all tiles', () => {
    const all = map.getAllTiles();
    expect(all).toHaveLength(256);
  });
});

describe('TileMap — Flood Fill', () => {
  let map: TileMap;

  beforeEach(() => {
    map = new TileMap(10, 10);
  });

  it('should flood fill connected tiles', () => {
    const result = map.floodFill(5, 5, (tile) => tile.terrain === 'grass');
    expect(result.length).toBe(100); // all tiles are grass
  });

  it('should stop at water boundaries', () => {
    // Create a water wall
    for (let y = 0; y < 10; y++) {
      map.setTerrain(5, y, 'water');
    }
    const result = map.floodFill(2, 5, (tile) => tile.terrain === 'grass');
    expect(result.length).toBe(50); // only left half
  });

  it('should handle isolated tiles', () => {
    map.setTerrain(0, 0, 'water');
    map.setTerrain(1, 0, 'water');
    map.setTerrain(0, 1, 'water');
    const result = map.floodFill(0, 0, (tile) => tile.terrain === 'water');
    expect(result.length).toBe(3);
  });
});

describe('WorldGen — Terrain Generation', () => {
  it('should generate a map with correct dimensions', () => {
    const gen = new WorldGen(42);
    const map = gen.generate({ width: 32, height: 32, seed: 42 });
    expect(map.width).toBe(32);
    expect(map.height).toBe(32);
  });

  it('should be mostly grass', () => {
    const gen = new WorldGen(42);
    const map = gen.generate({ width: 32, height: 32, seed: 42, waterPools: 0, stonePatches: 0, dirtPatches: 0 });
    const all = map.getAllTiles();
    const grassCount = all.filter(t => t.terrain === 'grass').length;
    expect(grassCount).toBe(1024); // all grass
  });

  it('should generate water pools', () => {
    const gen = new WorldGen(42);
    const map = gen.generate({ width: 32, height: 32, seed: 42, waterPools: 3, stonePatches: 0, dirtPatches: 0 });
    const all = map.getAllTiles();
    const waterCount = all.filter(t => t.terrain === 'water').length;
    expect(waterCount).toBeGreaterThan(0);
  });

  it('should be deterministic with same seed', () => {
    const gen1 = new WorldGen(123);
    const map1 = gen1.generate({ width: 16, height: 16, seed: 123 });
    const gen2 = new WorldGen(123);
    const map2 = gen2.generate({ width: 16, height: 16, seed: 123 });

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        expect(map1.getTile(x, y)!.terrain).toBe(map2.getTile(x, y)!.terrain);
      }
    }
  });

  it('should handle minimum size map', () => {
    const gen = new WorldGen(1);
    const map = gen.generate({ width: 4, height: 4, seed: 1 });
    expect(map.width).toBe(4);
    expect(map.height).toBe(4);
    expect(map.getAllTiles().length).toBe(16);
  });
});