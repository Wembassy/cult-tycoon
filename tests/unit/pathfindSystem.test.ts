import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Path } from '@components/Path';
import { TileMap } from '@world/TileMap';
import { Pathfinder } from '@world/Pathfinder';
import { NavigationGrid } from '@world/NavigationGrid';
import { PathfindSystem } from '@systems/PathfindSystem';

describe('PathfindSystem', () => {
  let map: TileMap;
  let pathfinder: Pathfinder;
  let navigation: NavigationGrid;
  let world: World;
  let system: PathfindSystem;

  beforeEach(() => {
    map = new TileMap(16, 16);
    navigation = new NavigationGrid(map);
    pathfinder = new Pathfinder(map, navigation);
    world = new World();
    system = new PathfindSystem(map, pathfinder, { maxPathsPerTick: 2 });
    system.bindWorld(world);
  });

  describe('requestPath', () => {
    it('should queue a path request', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      system.requestPath(entity, 0, 0, 5, 5);

      expect(system.queueLength).toBe(1);
      expect(system.isPending(entity)).toBe(true);
    });

    it('should mark the Path component as pending', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      system.requestPath(entity, 0, 0, 5, 5);

      const path = world.getComponent(entity, Path)!;
      expect(path.pending).toBe(true);
      expect(path.ready).toBe(false);
    });

    it('should replace duplicate requests for the same entity', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      system.requestPath(entity, 0, 0, 5, 5);
      system.requestPath(entity, 0, 0, 10, 10);

      expect(system.queueLength).toBe(1);
    });

    it('should store callback in Path component', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      const cb = (_path: { x: number; y: number }[], _success: boolean) => {};
      system.requestPath(entity, 0, 0, 5, 5, cb);

      const path = world.getComponent(entity, Path)!;
      expect(path.onComplete).toBe(cb);
    });
  });

  describe('update — budget processing', () => {
    it('should process requests up to the per-tick budget', () => {
      // Create 3 entities with Path components
      const entities: number[] = [];
      for (let i = 0; i < 3; i++) {
        const e = world.createEntity();
        world.addComponent(e, new Path(e));
        entities.push(e);
      }

      // Queue 3 requests (budget is 2 per tick)
      for (const e of entities) {
        system.requestPath(e, 0, 0, 5, 5);
      }

      expect(system.queueLength).toBe(3);

      // First tick — processes 2
      system.update(world, 1);
      expect(system.queueLength).toBe(1);

      // First two entities should have ready paths
      const p0 = world.getComponent(entities[0], Path)!;
      const p1 = world.getComponent(entities[1], Path)!;
      const p2 = world.getComponent(entities[2], Path)!;
      expect(p0.ready).toBe(true);
      expect(p1.ready).toBe(true);
      expect(p2.ready).toBe(false);
      expect(p2.pending).toBe(true);
    });

    it('should process remaining requests on the next tick', () => {
      const entities: number[] = [];
      for (let i = 0; i < 3; i++) {
        const e = world.createEntity();
        world.addComponent(e, new Path(e));
        entities.push(e);
      }

      for (const e of entities) {
        system.requestPath(e, 0, 0, 5, 5);
      }

      system.update(world, 1);
      expect(system.queueLength).toBe(1);

      system.update(world, 1);
      expect(system.queueLength).toBe(0);

      const p2 = world.getComponent(entities[2], Path)!;
      expect(p2.ready).toBe(true);
      expect(p2.pending).toBe(false);
    });

    it('should do nothing when queue is empty', () => {
      expect(() => system.update(world, 1)).not.toThrow();
    });
  });

  describe('update — path results', () => {
    it('should set waypoints on Path component for successful paths', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      system.requestPath(entity, 0, 0, 5, 0);
      system.update(world, 1);

      const path = world.getComponent(entity, Path)!;
      expect(path.ready).toBe(true);
      expect(path.pending).toBe(false);
      expect(path.waypoints.length).toBeGreaterThan(0);
      expect(path.waypoints[0]).toEqual({ x: 0, y: 0 });
      expect(path.waypoints[path.waypoints.length - 1]).toEqual({ x: 5, y: 0 });
    });

    it('should set index to 1 when path has multiple waypoints', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      system.requestPath(entity, 0, 0, 5, 5);
      system.update(world, 1);

      const path = world.getComponent(entity, Path)!;
      expect(path.waypoints.length).toBeGreaterThan(1);
      expect(path.index).toBe(1);
    });

    it('should set empty waypoints for failed paths', () => {
      // Block the entire map border to make pathing fail
      for (let x = 0; x < 16; x++) {
        navigation.addBlocker(x, 8, 'failed-path');
      }
      // Also block the fallback search by filling more
      for (let i = 0; i < 16; i++) {
        navigation.addBlocker(i, 7, 'failed-path');
        navigation.addBlocker(i, 9, 'failed-path');
      }

      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      system.requestPath(entity, 0, 0, 0, 15);
      system.update(world, 1);

      const path = world.getComponent(entity, Path)!;
      expect(path.ready).toBe(true);
      expect(path.pending).toBe(false);
      expect(path.waypoints.length).toBe(0);
    });

    it('should fire onComplete callback with path result', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      let callbackFired = false;
      let callbackSuccess = false;
      let callbackPath: { x: number; y: number }[] = [];

      system.requestPath(entity, 0, 0, 5, 0, (p, success) => {
        callbackFired = true;
        callbackSuccess = success;
        callbackPath = p;
      });

      system.update(world, 1);

      expect(callbackFired).toBe(true);
      expect(callbackSuccess).toBe(true);
      expect(callbackPath.length).toBeGreaterThan(0);
    });
  });

  describe('caching', () => {
    it('should cache path results and reuse them', () => {
      const e1 = world.createEntity();
      world.addComponent(e1, new Path(e1));
      const e2 = world.createEntity();
      world.addComponent(e2, new Path(e2));

      system.requestPath(e1, 0, 0, 5, 5);
      system.update(world, 1);

      expect(system.cacheSize).toBe(1);

      // Request same path for different entity
      system.requestPath(e2, 0, 0, 5, 5);
      system.update(world, 1);

      // Cache should still be size 1 (same path)
      expect(system.cacheSize).toBe(1);

      // Both entities should have the same waypoints
      const p1 = world.getComponent(e1, Path)!;
      const p2 = world.getComponent(e2, Path)!;
      expect(p1.waypoints).toEqual(p2.waypoints);
    });

    it('should invalidate cache on invalidateCache()', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      system.requestPath(entity, 0, 0, 5, 5);
      system.update(world, 1);

      expect(system.cacheSize).toBe(1);

      system.invalidateCache();

      // After invalidation, cache should be cleared on next update
      system.update(world, 1);
      expect(system.cacheSize).toBe(0);
    });

    it('should recompute paths after cache invalidation', () => {
      const e1 = world.createEntity();
      world.addComponent(e1, new Path(e1));

      system.requestPath(e1, 0, 0, 10, 0);
      system.update(world, 1);

      const path1 = world.getComponent(e1, Path)!;
      const originalWaypoints = path1.waypoints;

      // Add a wall that changes the path
      for (let y = 0; y < 16; y++) {
        navigation.addBlocker(5, y, 'cache-wall');
      }
      navigation.removeBlocker(5, 8, 'cache-wall'); // gap at y=8

      system.invalidateCache();

      const e2 = world.createEntity();
      world.addComponent(e2, new Path(e2));
      system.requestPath(e2, 0, 0, 10, 0);
      system.update(world, 1);

      const path2 = world.getComponent(e2, Path)!;
      // Path should now go through the gap
      expect(path2.waypoints).not.toEqual(originalWaypoints);
      const passesGap = path2.waypoints.some(p => p.x === 5 && p.y === 8);
      expect(passesGap).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should respect maxPathsPerTick = 1', () => {
      const singleSystem = new PathfindSystem(map, pathfinder, { maxPathsPerTick: 1 });
      singleSystem.bindWorld(world);

      const entities: number[] = [];
      for (let i = 0; i < 5; i++) {
        const e = world.createEntity();
        world.addComponent(e, new Path(e));
        entities.push(e);
      }

      for (const e of entities) {
        singleSystem.requestPath(e, 0, 0, 3, 3);
      }

      singleSystem.update(world, 1);
      expect(singleSystem.queueLength).toBe(4);

      singleSystem.update(world, 1);
      expect(singleSystem.queueLength).toBe(3);
    });

    it('should use default config when no config provided', () => {
      const defaultSystem = new PathfindSystem(map, pathfinder);
      defaultSystem.bindWorld(world);
      expect(defaultSystem.queueLength).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle request for entity without Path component gracefully', () => {
      const entity = world.createEntity();
      // No Path component added

      system.requestPath(entity, 0, 0, 5, 5);
      // Should not throw, queue should have the request but processing will skip it
      expect(system.queueLength).toBe(1);

      system.update(world, 1);
      // No crash, entity just doesn't get a path set
    });

    it('should handle path to same tile (start === goal)', () => {
      const entity = world.createEntity();
      world.addComponent(entity, new Path(entity));

      system.requestPath(entity, 3, 3, 3, 3);
      system.update(world, 1);

      const path = world.getComponent(entity, Path)!;
      expect(path.ready).toBe(true);
      expect(path.waypoints.length).toBe(1);
      expect(path.index).toBe(0); // single waypoint, no movement needed
    });

    it('should handle multiple rapid requests for different entities', () => {
      const entities: number[] = [];
      for (let i = 0; i < 10; i++) {
        const e = world.createEntity();
        world.addComponent(e, new Path(e));
        entities.push(e);
      }

      for (let i = 0; i < 10; i++) {
        system.requestPath(entities[i], 0, 0, i, i);
      }

      // Process all over multiple ticks
      while (system.queueLength > 0) {
        system.update(world, 1);
      }

      for (const e of entities) {
        const p = world.getComponent(e, Path)!;
        expect(p.ready).toBe(true);
        expect(p.pending).toBe(false);
      }
    });
  });
});