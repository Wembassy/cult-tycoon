import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World';
import { TileMap } from '../../src/world/TileMap';
import { Pathfinder } from '../../src/world/Pathfinder';
import { FollowerFactory } from '../../src/systems/FollowerFactory';
import { RitualSystem } from '../../src/systems/RitualSystem';
import { AISystem } from '../../src/systems/AISystem';
import { JobSystem } from '../../src/systems/JobSystem';
import { TechTreeSystem } from '../../src/systems/TechTreeSystem';
import { BuildingSystem } from '../../src/systems/BuildingSystem';
import { DataManager } from '../../src/data/DataManager';
import { TECH_TREE_NODES } from '../../src/data/TechTreeData';
import { OnRitual } from '../../src/components/OnRitual';
import { Needs } from '../../src/components/Needs';
import { FollowerAI } from '../../src/components/FollowerAI';
import { Transform } from '../../src/components/Transform';
import { createBuildingVisual } from '../../src/engine/BuildingVisuals';
function setup() {
  const world = new World(),
    map = new TileMap(20, 20),
    path = new Pathfinder(map);
  const id = new FollowerFactory(8).spawn(world, { x: 1, y: 1, traits: [] }).entityId;
  const needs = world.getComponent(id, Needs)!;
  needs.hunger = 100;
  needs.energy = 100;
  return { world, map, id, needs, ai: new AISystem(map, path), ritual: new RitualSystem() };
}
describe('Campaign consistency', () => {
  it('every ritual research prerequisite exists in the active tech tree', () => {
    const known = new Set([
      ...TECH_TREE_NODES.map((n) => n.id),
      ...DataManager.getRooms().map((r) => r.id),
      'basic_rituals',
    ]);
    for (const r of DataManager.getRituals())
      for (const requirement of r.requirements)
        expect(known.has(requirement), `${r.id} -> ${requirement}`).toBe(true);
  });
  it('each furniture unlock names a real object', () => {
    for (const n of TECH_TREE_NODES)
      if (n.effects.unlocksObject)
        expect(DataManager.getObject(n.effects.unlocksObject)).toBeDefined();
  });
  it('the two doctrine choices are mutually exclusive and affordable in the faith range', () => {
    const tech = new TechTreeSystem();
    tech.restore(['beds_ii', 'kitchen', 'bathroom_upgrades', 'divine_inspiration']);
    expect(tech.unlock('peace_love_path', 999, 70).success).toBe(true);
    expect(tech.unlock('eldritch_path', 999, 100).success).toBe(false);
  });
  it('a ritual waits for physical arrival rather than awarding progress remotely', () => {
    const f = setup();
    const ritual = f.ritual.startRitual('morning_prayer', [f.id], f.world, [{ x: 8, y: 1 }])!;
    f.ritual.update(f.world, 1);
    expect(ritual.progress).toBe(0);
    for (let i = 0; i < 120; i++) {
      f.ai.update(f.world, 1 / 30);
      f.ritual.update(f.world, 1 / 30);
    }
    expect(f.world.getComponent(f.id, Transform)!.x).toBeCloseTo(8);
    expect(ritual.progress).toBeGreaterThan(0);
    f.ritual.update(f.world, 60);
    expect(f.world.hasComponent(f.id, OnRitual)).toBe(false);
    expect(f.ritual.getCompletedRituals()).toHaveLength(1);
  });
  it('critical hunger cancels a rite without rewards and releases its followers', () => {
    const f = setup();
    f.ritual.startRitual('morning_prayer', [f.id], f.world, [{ x: 1, y: 1 }]);
    f.needs.hunger = 0;
    f.ritual.update(f.world, 1);
    expect(f.ritual.getActiveRituals()).toHaveLength(0);
    expect(f.ritual.getCompletedRituals()).toHaveLength(0);
    expect(f.world.hasComponent(f.id, OnRitual)).toBe(false);
  });
  it('ritual participants cannot simultaneously take workstation jobs', () => {
    const f = setup();
    f.ritual.startRitual('morning_prayer', [f.id], f.world, [{ x: 1, y: 1 }]);
    const jobs = new JobSystem();
    jobs.postJob({
      id: 'r',
      type: 'research',
      targetTile: { x: 1, y: 1 },
      priority: 9,
      duration: 5,
    });
    jobs.update(f.world, 1);
    expect(jobs.getAssignedJobs()).toHaveLength(0);
  });
  it('a permanently blocked ritual times out instead of holding all participants forever', () => {
    const f = setup();
    f.ritual.startRitual('morning_prayer', [f.id], f.world, [{ x: 18, y: 18 }]);
    f.ritual.update(f.world, 46);
    expect(f.ritual.getActiveRituals()).toHaveLength(0);
    expect(f.world.hasComponent(f.id, OnRitual)).toBe(false);
  });
  it('an unavailable hygiene station cannot prevent an emergency meal', () => {
    const f = setup(),
      ai = f.world.getComponent(f.id, FollowerAI)!;
    ai.needTarget = 'hygiene';
    ai.state = 'needs';
    f.needs.hunger = 5;
    f.ai.setNeedFacilityProvider((need) => (need === 'hunger' ? { x: 1, y: 1 } : null));
    f.ai.update(f.world, 1);
    expect(f.needs.hunger).toBeGreaterThan(5);
    expect(ai.needTarget).toBe('hunger');
  });
  it('premium furniture satisfies base room requirements', () => {
    const map = new TileMap(20, 20),
      b = new BuildingSystem(map);
    const room = b.designateRoomArea(3, 3, 6, 6, 'bedroom', 'dormitory')!;
    b.placeObject(4, 4, 'bunk_bed');
    const bedCheck = b.getRoomStatus(room.id).checks.find((c) => c.objectId === 'bed');
    expect(bedCheck?.met).toBe(true);
  });
  it('every shipped object has a finite, visible mesh of appropriate world scale', () => {
    for (const def of DataManager.getObjects()) {
      const object = createBuildingVisual(def.id);
      object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object),
        size = box.getSize(new THREE.Vector3());
      expect(Number.isFinite(size.length())).toBe(true);
      expect(size.length()).toBeGreaterThan(0.1);
      expect(size.length()).toBeLessThan(6);
    }
  });
});
