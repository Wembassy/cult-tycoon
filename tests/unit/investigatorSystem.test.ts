import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Transform } from '@components/Transform';
import { FollowerAI } from '@components/FollowerAI';
import { Needs } from '@components/Needs';
import { TileMap } from '@world/TileMap';
import { Pathfinder } from '@world/Pathfinder';
import { InvestigatorSystem } from '@systems/InvestigatorSystem';

describe('InvestigatorSystem', () => {
  let world: World;
  let map: TileMap;
  let pathfinder: Pathfinder;
  let system: InvestigatorSystem;

  beforeEach(() => {
    world = new World();
    map = new TileMap(32, 32);
    pathfinder = new Pathfinder(map);
    system = new InvestigatorSystem(map, pathfinder, 16, 16, {}, 42);
  });

  describe('Construction & State', () => {
    it('starts with no investigators', () => {
      expect(system.getActiveInvestigators()).toHaveLength(0);
      expect(system.getAllInvestigators()).toHaveLength(0);
    });

    it('starts with notoriety 0', () => {
      expect(system.getTargetInvestigatorCount()).toBe(0);
    });
  });

  describe('Notoriety Scaling', () => {
    it('returns 0 investigators at notoriety <= 50', () => {
      system.setNotoriety(0);
      expect(system.getTargetInvestigatorCount()).toBe(0);
      system.setNotoriety(25);
      expect(system.getTargetInvestigatorCount()).toBe(0);
      system.setNotoriety(50);
      expect(system.getTargetInvestigatorCount()).toBe(0);
    });

    it('returns 1 investigator at notoriety 70-89', () => {
      system.setNotoriety(70);
      expect(system.getTargetInvestigatorCount()).toBe(1);
      system.setNotoriety(89);
      expect(system.getTargetInvestigatorCount()).toBe(1);
    });

    it('returns 2 investigators at notoriety 90-99', () => {
      system.setNotoriety(90);
      expect(system.getTargetInvestigatorCount()).toBe(2);
      system.setNotoriety(99);
      expect(system.getTargetInvestigatorCount()).toBe(2);
    });
  });

  describe('Spawning', () => {
    it('spawns an investigator when notoriety > 50', () => {
      system.setNotoriety(60);
      const inv = system.spawnInvestigator(world);
      expect(inv).toBeDefined();
      expect(inv.state).toBe('moving_to_base');
      expect(inv.entity).toBeDefined();
      expect(world.hasEntity(inv.entity)).toBe(true);
      expect(system.getActiveInvestigators()).toHaveLength(1);
    });

    it('investigator has a Transform component', () => {
      system.setNotoriety(60);
      const inv = system.spawnInvestigator(world);
      const transform = world.getComponent(inv.entity, Transform);
      expect(transform).toBeDefined();
      expect(transform!.x).toBeGreaterThanOrEqual(0);
      expect(transform!.y).toBeGreaterThanOrEqual(0);
    });

    it('investigator has a FollowerAI component', () => {
      system.setNotoriety(60);
      const inv = system.spawnInvestigator(world);
      const ai = world.getComponent(inv.entity, FollowerAI);
      expect(ai).toBeDefined();
    });

    it('investigator has a path to the base', () => {
      system.setNotoriety(60);
      const inv = system.spawnInvestigator(world);
      expect(inv.path.length).toBeGreaterThan(0);
    });

    it('assigns unique IDs to each investigator', () => {
      system.setNotoriety(60);
      const inv1 = system.spawnInvestigator(world);
      const inv2 = system.spawnInvestigator(world);
      expect(inv1.id).not.toBe(inv2.id);
    });
  });

  describe('Update & Movement', () => {
    it('does not spawn investigators when notoriety is low', () => {
      system.setNotoriety(30);
      system.update(world, 1);
      expect(system.getActiveInvestigators()).toHaveLength(0);
    });

    it('investigator moves toward base during update', () => {
      system.setNotoriety(60);
      const inv = system.spawnInvestigator(world);
      const transform = world.getComponent(inv.entity, Transform);
      const startX = transform!.x;
      const startY = transform!.y;

      // Update several times to move
      for (let i = 0; i < 10; i++) {
        system.update(world, 0.5);
      }

      const updatedTransform = world.getComponent(inv.entity, Transform);
      const dx = Math.abs(updatedTransform!.x - startX);
      const dy = Math.abs(updatedTransform!.y - startY);
      // Should have moved some distance
      expect(dx + dy).toBeGreaterThan(0);
    });

    it('spawns investigators via update when notoriety is high enough', () => {
      system.setNotoriety(75); // (75-50)/20 = 1.25 → floor = 1
      // Update enough to trigger spawn check
      system.update(world, 35);
      expect(system.getActiveInvestigators().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Inspection', () => {
    it('transitions to inspecting when reaching the base', () => {
      system.setNotoriety(60);
      const inv = system.spawnInvestigator(world);

      // Place investigator at the base
      const transform = world.getComponent(inv.entity, Transform);
      transform!.x = 16;
      transform!.y = 16;
      inv.pathIndex = inv.path.length; // force path complete

      system.update(world, 0.1);

      expect(inv.state).toBe('inspecting');
      expect(inv.inspectTimer).toBeGreaterThanOrEqual(0);
    });

    it('completes inspection after 30 seconds', () => {
      let inspectComplete = false;
      system = new InvestigatorSystem(map, pathfinder, 16, 16, {
        onInvestigatorInspectComplete: () => { inspectComplete = true; },
      }, 42);

      system.setNotoriety(60);
      const inv = system.spawnInvestigator(world);

      // Place at base and set to inspecting
      const transform = world.getComponent(inv.entity, Transform);
      transform!.x = 16;
      transform!.y = 16;
      inv.pathIndex = inv.path.length;
      system.update(world, 0.1);
      expect(inv.state).toBe('inspecting');

      // Simulate 30 seconds of inspection
      for (let i = 0; i < 60; i++) {
        system.update(world, 0.5);
      }

      expect(inspectComplete).toBe(true);
      expect(inv.state).toBe('leaving');
    });
  });

  describe('Ritual Proximity / Conversion', () => {
    it('can be caught by a follower performing a ritual nearby', () => {
      let converted = false;
      let fled = false;
      system = new InvestigatorSystem(map, pathfinder, 16, 16, {
        onInvestigatorConverted: () => { converted = true; },
        onInvestigatorFled: () => { fled = true; },
      }, 42);

      system.setNotoriety(75);
      const inv = system.spawnInvestigator(world);

      // Place investigator at base, set to inspecting
      const invTransform = world.getComponent(inv.entity, Transform)!;
      invTransform.x = 16;
      invTransform.y = 16;
      inv.pathIndex = inv.path.length;

      // Transition to inspecting
      system.update(world, 0.1);
      expect(inv.state).toBe('inspecting');

      // Create a follower performing a ritual nearby (within 3 tiles)
      const followerEntity = world.createEntity();
      const followerTransform = new Transform(followerEntity);
      followerTransform.x = 16.5;
      followerTransform.y = 16.5;
      world.addComponent(followerEntity, followerTransform);

      const followerAI = new FollowerAI(followerEntity);
      followerAI.state = 'working'; // performing ritual
      world.addComponent(followerEntity, followerAI);

      const followerNeeds = new Needs(followerEntity);
      world.addComponent(followerEntity, followerNeeds);

      // Run update — should trigger conversion or flee
      system.update(world, 0.1);

      // Should have been converted or fled (not still inspecting)
      expect(inv.state === 'converted' || inv.state === 'fled').toBe(true);
      expect(converted || fled).toBe(true);
    });
  });

  describe('Reset', () => {
    it('clears all investigators on reset', () => {
      system.setNotoriety(60);
      system.spawnInvestigator(world);
      system.spawnInvestigator(world);
      expect(system.getAllInvestigators()).toHaveLength(2);

      system.reset();

      expect(system.getActiveInvestigators()).toHaveLength(0);
      expect(system.getAllInvestigators()).toHaveLength(0);
    });
  });
});