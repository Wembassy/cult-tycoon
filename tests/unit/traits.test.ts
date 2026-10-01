import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Needs } from '@components/Needs';
import { FollowerAI } from '@components/FollowerAI';
import { Transform } from '@components/Transform';
import { Job } from '@components/Job';
import { Skills } from '@components/Skills';
import { Health } from '@components/Health';
import { Inventory } from '@components/Inventory';
import { Renderable } from '@components/Renderable';
import { Traits, TraitType, ALL_TRAITS } from '@components/Traits';
import { NeedsSystem } from '@systems/NeedsSystem';
import { JobSystem } from '@systems/JobSystem';
import { FollowerFactory } from '@systems/FollowerFactory';

function createFollower(world: World, x = 0, y = 0, traits: TraitType[] = []): number {
  const entity = world.createEntity();
  const transform = new Transform(entity);
  transform.x = x;
  transform.y = y;
  world.addComponent(entity, transform);
  world.addComponent(entity, new Needs(entity));
  world.addComponent(entity, new Job(entity));
  world.addComponent(entity, new Skills(entity));
  const traitsComp = new Traits(entity);
  traitsComp.traits = traits;
  world.addComponent(entity, traitsComp);
  world.addComponent(entity, new Health(entity));
  world.addComponent(entity, new Inventory(entity));
  world.addComponent(entity, new FollowerAI(entity));
  world.addComponent(entity, new Renderable(entity));
  return entity;
}

describe('Traits Component', () => {
  it('should have ALL_TRAITS with all 11 traits', () => {
    expect(ALL_TRAITS).toHaveLength(11);
    expect(ALL_TRAITS).toContain('devoted');
    expect(ALL_TRAITS).toContain('scholarly');
    expect(ALL_TRAITS).toContain('paranoid');
  });

  it('hasTrait should return true for assigned traits', () => {
    const entity = 0;
    const traits = new Traits(entity);
    traits.traits = ['devoted', 'hardy'];

    expect(traits.hasTrait('devoted')).toBe(true);
    expect(traits.hasTrait('hardy')).toBe(true);
    expect(traits.hasTrait('paranoid')).toBe(false);
  });

  it('getWorkSpeedMult should return 1.5 for devoted on pray jobs', () => {
    const traits = new Traits(0);
    traits.traits = ['devoted'];
    expect(traits.getWorkSpeedMult('pray')).toBe(1.5);
  });

  it('getWorkSpeedMult should return 1.5 for zealous on pray jobs', () => {
    const traits = new Traits(0);
    traits.traits = ['zealous'];
    expect(traits.getWorkSpeedMult('pray')).toBe(1.5);
  });

  it('getWorkSpeedMult should return 1.5 for scholarly on research jobs', () => {
    const traits = new Traits(0);
    traits.traits = ['scholarly'];
    expect(traits.getWorkSpeedMult('research')).toBe(1.5);
  });

  it('getWorkSpeedMult should return 1.5 for scholar on research jobs', () => {
    const traits = new Traits(0);
    traits.traits = ['scholar'];
    expect(traits.getWorkSpeedMult('research')).toBe(1.5);
  });

  it('getWorkSpeedMult should return 0.7 for lazy on any job', () => {
    const traits = new Traits(0);
    traits.traits = ['lazy'];
    expect(traits.getWorkSpeedMult('clean')).toBeCloseTo(0.7);
    expect(traits.getWorkSpeedMult('pray')).toBeCloseTo(0.7);
  });

  it('getWorkSpeedMult should return 1.0 with no relevant traits', () => {
    const traits = new Traits(0);
    traits.traits = ['hardy'];
    expect(traits.getWorkSpeedMult('pray')).toBe(1.0);
    expect(traits.getWorkSpeedMult('research')).toBe(1.0);
  });

  it('getWorkSpeedMult should stack devoted + zealous on pray', () => {
    const traits = new Traits(0);
    traits.traits = ['devoted', 'zealous'];
    expect(traits.getWorkSpeedMult('pray')).toBeCloseTo(2.25);
  });

  it('getFoodConsumptionMult should return 0.75 for hardy', () => {
    const traits = new Traits(0);
    traits.traits = ['hardy'];
    expect(traits.getFoodConsumptionMult()).toBeCloseTo(0.75);
  });

  it('getFoodConsumptionMult should return 1.3 for lazy', () => {
    const traits = new Traits(0);
    traits.traits = ['lazy'];
    expect(traits.getFoodConsumptionMult()).toBeCloseTo(1.3);
  });

  it('getRecruitmentBonus should return 1 for charismatic', () => {
    const traits = new Traits(0);
    traits.traits = ['charismatic'];
    expect(traits.getRecruitmentBonus()).toBe(1);
  });

  it('getRecruitmentBonus should return 0 without charismatic', () => {
    const traits = new Traits(0);
    traits.traits = ['hardy'];
    expect(traits.getRecruitmentBonus()).toBe(0);
  });

  it('getInvestigationMoraleLossMult should return 1.2 for paranoid', () => {
    const traits = new Traits(0);
    traits.traits = ['paranoid'];
    expect(traits.getInvestigationMoraleLossMult()).toBeCloseTo(1.2);
  });

  it('getInvestigationMoraleLossMult should return 1.1 for fragile', () => {
    const traits = new Traits(0);
    traits.traits = ['fragile'];
    expect(traits.getInvestigationMoraleLossMult()).toBeCloseTo(1.1);
  });

  it('getInvestigationMoraleLossMult should stack paranoid + fragile', () => {
    const traits = new Traits(0);
    traits.traits = ['paranoid', 'fragile'];
    expect(traits.getInvestigationMoraleLossMult()).toBeCloseTo(1.32);
  });
});

describe('Traits in JobSystem', () => {
  let world: World;
  let jobs: JobSystem;

  beforeEach(() => {
    world = new World();
    jobs = new JobSystem();
  });

  it('devoted follower should complete pray jobs 50% faster', () => {
    const entity = createFollower(world, 3, 3, ['devoted']);
    const ai = world.getComponent(entity, FollowerAI)!;

    jobs.postJob({
      id: 'job1', type: 'pray', targetTile: { x: 3, y: 3 },
      priority: 5, duration: 10,
    });
    jobs.update(world, 1);

    const job = world.getComponent(entity, Job)!;
    expect(job.type).toBe('pray');

    // Simulate working
    ai.state = 'working';
    job.workProgress = 0;

    // With 1.5x speed, 10/1.5 ≈ 6.67 ticks should complete
    jobs.update(world, 7);

    expect(job.type).toBe('idle'); // completed
    expect(ai.state).toBe('done');
  });

  it('scholarly follower should complete research jobs 50% faster', () => {
    const entity = createFollower(world, 3, 3, ['scholarly']);
    const ai = world.getComponent(entity, FollowerAI)!;

    jobs.postJob({
      id: 'job1', type: 'research', targetTile: { x: 3, y: 3 },
      priority: 5, duration: 10,
    });
    jobs.update(world, 1);

    const job = world.getComponent(entity, Job)!;
    expect(job.type).toBe('research');

    ai.state = 'working';
    job.workProgress = 0;

    // With 1.5x speed, ~7 ticks should complete
    jobs.update(world, 7);

    expect(job.type).toBe('idle');
    expect(ai.state).toBe('done');
  });

  it('lazy follower should work slower', () => {
    const entity = createFollower(world, 3, 3, ['lazy']);
    const ai = world.getComponent(entity, FollowerAI)!;

    jobs.postJob({
      id: 'job1', type: 'clean', targetTile: { x: 3, y: 3 },
      priority: 5, duration: 10,
    });
    jobs.update(world, 1);

    const job = world.getComponent(entity, Job)!;
    ai.state = 'working';
    job.workProgress = 0;

    // With 0.7x speed, 10 ticks gives only 7 progress, not enough
    jobs.update(world, 10);

    expect(job.type).toBe('clean'); // not completed yet
    expect(ai.state).toBe('working');

    // Need ~14.3 ticks total to complete
    jobs.update(world, 5);

    expect(job.type).toBe('idle'); // now completed
    expect(ai.state).toBe('done');
  });

  it('follower without traits should work at normal speed', () => {
    const entity = createFollower(world, 3, 3, []);
    const ai = world.getComponent(entity, FollowerAI)!;

    jobs.postJob({
      id: 'job1', type: 'clean', targetTile: { x: 3, y: 3 },
      priority: 5, duration: 10,
    });
    jobs.update(world, 1);

    const job = world.getComponent(entity, Job)!;
    ai.state = 'working';
    job.workProgress = 0;

    // Normal speed: 10 ticks = 10 progress = complete
    jobs.update(world, 10);

    expect(job.type).toBe('idle');
    expect(ai.state).toBe('done');
  });
});

describe('Traits in NeedsSystem', () => {
  let world: World;
  let needs: NeedsSystem;

  beforeEach(() => {
    world = new World();
    needs = new NeedsSystem();
  });

  it('hardy follower should have 25% less food consumption', () => {
    const entity = createFollower(world, 0, 0, ['hardy']);
    const n = world.getComponent(entity, Needs)!;
    const startHunger = n.hunger;

    needs.update(world, 10);

    // Default hunger decay: 0.15 * 0.75 (hardy) * 10 = 1.125
    const expectedDecay = 0.15 * 0.75 * 10;
    expect(startHunger - n.hunger).toBeCloseTo(expectedDecay, 1);
  });

  it('devoted follower should have slower faith decay', () => {
    const entity = createFollower(world, 0, 0, ['devoted']);
    const n = world.getComponent(entity, Needs)!;
    const startFaith = n.faith;

    needs.update(world, 10);

    // Default faith decay: 0.08 * 0.7 (devoted) * 10 = 0.56
    const expectedDecay = 0.08 * 0.7 * 10;
    expect(startFaith - n.faith).toBeCloseTo(expectedDecay, 1);
  });
});

describe('FollowerFactory trait assignment', () => {
  let world: World;
  let factory: FollowerFactory;

  beforeEach(() => {
    world = new World();
    factory = new FollowerFactory(42);
  });

  it('should assign 1-2 random traits on spawn', () => {
    for (let i = 0; i < 20; i++) {
      const follower = factory.spawn(world, { x: i, y: 0 });
      const traits = world.getComponent(follower.entityId, Traits)!;
      expect(traits.traits.length).toBeGreaterThanOrEqual(1);
      expect(traits.traits.length).toBeLessThanOrEqual(2);
    }
  });

  it('should only assign valid trait types', () => {
    for (let i = 0; i < 20; i++) {
      const follower = factory.spawn(world, { x: i, y: 0 });
      const traits = world.getComponent(follower.entityId, Traits)!;
      for (const trait of traits.traits) {
        expect(ALL_TRAITS).toContain(trait);
      }
    }
  });

  it('should respect explicitly provided traits', () => {
    const follower = factory.spawn(world, {
      x: 0, y: 0,
      traits: ['devoted', 'paranoid'],
    });
    const traits = world.getComponent(follower.entityId, Traits)!;
    expect(traits.traits).toEqual(['devoted', 'paranoid']);
    expect(traits.hasTrait('devoted')).toBe(true);
    expect(traits.hasTrait('paranoid')).toBe(true);
  });

  it('should not modify traits after assignment', () => {
    const follower = factory.spawn(world, {
      x: 0, y: 0,
      traits: ['hardy'],
    });
    const traits = world.getComponent(follower.entityId, Traits)!;
    const originalTraits = [...traits.traits];

    // Simulate some game ticks
    const needs = new NeedsSystem();
    const jobs = new JobSystem();
    needs.update(world, 10);
    jobs.update(world, 10);

    expect(traits.traits).toEqual(originalTraits);
  });
});