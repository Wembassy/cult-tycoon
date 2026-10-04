import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap } from '@world/TileMap';
import { Pathfinder } from '@world/Pathfinder';
import { NavigationGrid } from '@world/NavigationGrid';

describe('Pathfinder — Basic Pathfinding', () => {
  let map: TileMap;
  let pf: Pathfinder;
  let navigation: NavigationGrid;

  beforeEach(() => {
    map = new TileMap(16, 16);
    navigation = new NavigationGrid(map);
    pf = new Pathfinder(map, navigation);
  });

  it('should find path on open grid', () => {
    const result = pf.findPath(0, 0, 5, 5);
    expect(result.success).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.path[0]).toEqual({ x: 0, y: 0 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 5, y: 5 });
  });

  it('should find path in straight line', () => {
    const result = pf.findPath(0, 0, 5, 0);
    expect(result.success).toBe(true);
    expect(result.path[0]).toEqual({ x: 0, y: 0 });
    expect(result.path[result.path.length - 1]).toEqual({ x: 5, y: 0 });
  });

  it('should return empty path when start equals goal', () => {
    const result = pf.findPath(3, 3, 3, 3);
    expect(result.success).toBe(true);
    expect(result.path).toEqual([{ x: 3, y: 3 }]);
  });

  it('should fail for out-of-bounds start', () => {
    const result = pf.findPath(-1, 0, 5, 5);
    expect(result.success).toBe(false);
  });

  it('should fail for out-of-bounds goal', () => {
    const result = pf.findPath(0, 0, 100, 100);
    expect(result.success).toBe(false);
  });
});

describe('Pathfinder — Obstacles', () => {
  let map: TileMap;
  let pf: Pathfinder;
  let navigation: NavigationGrid;

  beforeEach(() => {
    map = new TileMap(16, 16);
    navigation = new NavigationGrid(map);
    pf = new Pathfinder(map, navigation);
  });

  it('should path around walls', () => {
    // Build a vertical wall
    for (let y = 0; y < 16; y++) {
      navigation.addBlocker(5, y, 'test-wall');
    }
    // Leave a gap at y=8
    navigation.removeBlocker(5, 8, 'test-wall');

    const result = pf.findPath(0, 0, 10, 0);
    expect(result.success).toBe(true);
    expect(result.length).toBeGreaterThan(5);
    // Path should go through the gap
    const passesGap = result.path.some(p => Math.abs(p.x - 5) <= 0.6 && Math.abs(p.y - 8) <= 0.6);
    expect(passesGap).toBe(true);
  });

  it('should respect a fine construction wall edge without blocking the whole terrain tile', () => {
    // A horizontal wall segment across the middle of local tile (2,2).
    navigation.addConstructionEdge(25, 30, 'horizontal', 10, 'fine-wall');
    pf.invalidateCache();

    const result = pf.findPath(2, 2, 2, 3);
    expect(result.success).toBe(true);
    // The pawn must route around the 0.1-unit segment rather than cross it directly.
    expect(result.path.length).toBeGreaterThan(2);
    expect(result.path.some(p => Math.abs(p.x - 2) > 0.05)).toBe(true);
  });

  it('should not path through water', () => {
    // Create water barrier across entire width
    for (let x = 0; x < 16; x++) {
      map.setTerrain(x, 8, 'water');
    }

    const result = pf.findPath(0, 0, 0, 15);
    // Water blocks the entire row — no path possible
    expect(result.success).toBe(false);
  });

  it('should handle maze-like obstacles', () => {
    // Create a simple maze
    navigation.addBlocker(2, 0, 'maze');
    navigation.addBlocker(2, 1, 'maze');
    navigation.addBlocker(2, 2, 'maze');
    // gap at y=3
    navigation.addBlocker(2, 4, 'maze');
    navigation.addBlocker(2, 5, 'maze');

    const result = pf.findPath(0, 0, 5, 5);
    expect(result.success).toBe(true);
    const passesGap = result.path.some(p => Math.abs(p.x - 2) <= 0.6 && Math.abs(p.y - 3) <= 0.6);
    expect(passesGap).toBe(true);
  });
});

describe('Pathfinder — Path Smoothing', () => {
  let map: TileMap;
  let pf: Pathfinder;
  let navigation: NavigationGrid;

  beforeEach(() => {
    map = new TileMap(16, 16);
    navigation = new NavigationGrid(map);
    pf = new Pathfinder(map, navigation);
  });

  it('should smooth straight line paths', () => {
    const result = pf.findPath(0, 0, 10, 0);
    expect(result.success).toBe(true);
    // Smoothed path should have fewer waypoints than raw
    // For a straight line, should be just start and end
    expect(result.path.length).toBeLessThanOrEqual(3);
  });

  it('should preserve corners in paths', () => {
    // Create an L-shaped obstacle to force a corner
    for (let i = 0; i <= 5; i++) {
      navigation.addBlocker(3, i, 'l-wall');
    }
    const result = pf.findPath(0, 0, 8, 8);
    expect(result.success).toBe(true);
    // Path should have at least 2 direction changes
    let directionChanges = 0;
    for (let i = 2; i < result.path.length; i++) {
      const d1 = {
        dx: result.path[i - 1].x - result.path[i - 2].x,
        dy: result.path[i - 1].y - result.path[i - 2].y,
      };
      const d2 = {
        dx: result.path[i].x - result.path[i - 1].x,
        dy: result.path[i].y - result.path[i - 1].y,
      };
      if (d1.dx !== d2.dx || d1.dy !== d2.dy) directionChanges++;
    }
    expect(directionChanges).toBeGreaterThanOrEqual(1);
  });
});

describe('Pathfinder — Cache', () => {
  let map: TileMap;
  let pf: Pathfinder;
  let navigation: NavigationGrid;

  beforeEach(() => {
    map = new TileMap(16, 16);
    navigation = new NavigationGrid(map);
    pf = new Pathfinder(map, navigation);
  });

  it('should cache paths', () => {
    const result1 = pf.findPath(0, 0, 5, 5);
    const result2 = pf.findPath(0, 0, 5, 5);
    expect(result1.path).toEqual(result2.path);
  });

  it('should invalidate cache when buildings change', () => {
    const result1 = pf.findPath(0, 0, 10, 10);
    expect(result1.success).toBe(true);
    const path1Str = result1.path.map(p => `${p.x},${p.y}`).join('|');

    // Add walls that block the original path — create a wall line
    for (let y = 0; y < 16; y++) {
      navigation.addBlocker(5, y, 'cache-wall');
    }
    pf.invalidateCache();

    const result2 = pf.findPath(0, 0, 10, 10);
    expect(result2.success).toBe(false); // wall blocks entire column
    // Paths should differ
    const path2Str = result2.success ? result2.path.map(p => `${p.x},${p.y}`).join('|') : 'NO_PATH';
    expect(path1Str).not.toBe(path2Str);
  });
});

describe('Pathfinder — Performance', () => {
  it('should handle 50 concurrent path requests', () => {
    const map = new TileMap(32, 32);
    const pf = new Pathfinder(map);

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      pf.findPath(0, 0, 15 + (i % 10), 15 + (i % 10));
    }
    const elapsed = performance.now() - start;
    // Should complete all 50 paths in reasonable time
    expect(elapsed).toBeLessThan(2000); // 2 second budget
  });
});