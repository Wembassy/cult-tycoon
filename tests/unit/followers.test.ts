import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Needs } from '@components/Needs';
import { FollowerAI } from '@components/FollowerAI';
import { Traits } from '@components/Traits';
import { Transform } from '@components/Transform';
import { Job } from '@components/Job';
import { Skills } from '@components/Skills';
import { Health } from '@components/Health';
import { Inventory } from '@components/Inventory';
import { Renderable } from '@components/Renderable';
import { NeedsSystem } from '@systems/NeedsSystem';
import { JobSystem, JobPosting } from '@systems/JobSystem';
import { AISystem } from '@systems/AISystem';
import { FollowerFactory } from '@systems/FollowerFactory';
import { TileMap } from '@world/TileMap';
import { Pathfinder } from '@world/Pathfinder';

function createFollower(world: World, x = 0, y = 0): number {
  const entity = world.createEntity();
  const transform = new Transform(entity);
  transform.x = x;
  transform.y = y;
  world.addComponent(entity, transform);
  world.addComponent(entity, new Needs(entity));
  world.addComponent(entity, new Job(entity));
  world.addComponent(entity, new Skills(entity));
  world.addComponent(entity, new Traits(entity));
  world.addComponent(entity, new Health(entity));
  world.addComponent(entity, new Inventory(entity));
  world.addComponent(entity, new FollowerAI(entity));
  world.addComponent(entity, new Renderable(entity));
  return entity;
}

describe('NeedsSystem', () => {
  let world: World;
  let needs: NeedsSystem;

  beforeEach(() => {
    world = new World();
    needs = new NeedsSystem();
  });

  it('should decay needs over time', () => {
    const entity = createFollower(world);
    const n = world.getComponent(entity, Needs)!;
    const startHunger = n.hunger;

    needs.update(world, 10); // 10 ticks

    expect(n.hunger).toBeLessThan(startHunger);
    expect(n.faith).toBeLessThan(100);
    expect(n.fun).toBeLessThan(100);
  });

  it('should not decay below 0', () => {
    const entity = createFollower(world);
    const n = world.getComponent(entity, Needs)!;
    n.hunger = 1;

    needs.update(world, 100);

    expect(n.hunger).toBe(0);
  });

  it('should trigger needs state on critical hunger', () => {
    const entity = createFollower(world);
    const n = world.getComponent(entity, Needs)!;
    const ai = world.getComponent(entity, FollowerAI)!;

    n.hunger = 15;
    needs.update(world, 1);

    expect(ai.state).toBe('needs');
  });

  it('should trigger needs state on critical faith', () => {
    const entity = createFollower(world);
    const n = world.getComponent(entity, Needs)!;
    const ai = world.getComponent(entity, FollowerAI)!;

    n.faith = 15;
    needs.update(world, 1);

    expect(ai.state).toBe('needs');
  });

  it('should apply trait modifiers', () => {
    const entity = createFollower(world);
    const t = world.getComponent(entity, Traits)!;
    const n = world.getComponent(entity, Needs)!;

    t.traits = ['lazy']; // hunger decay 1.3x
    const startHunger = n.hunger;

    needs.update(world, 10);

    // With 1.3x multiplier, hunger should decay more than default
    const defaultDecay = 0.15 * 10;
    const lazyDecay = 0.15 * 1.3 * 10;
    expect(startHunger - n.hunger).toBeCloseTo(lazyDecay, 1);
    expect(startHunger - n.hunger).toBeGreaterThan(defaultDecay);
  });

  it('should return count of critical followers', () => {
    createFollower(world); // full needs
    const e2 = createFollower(world);
    world.getComponent(e2, Needs)!.hunger = 10;

    const critical = needs.update(world, 1);
    expect(critical).toBe(1);
  });
});

describe('JobSystem', () => {
  let world: World;
  let jobs: JobSystem;

  beforeEach(() => {
    world = new World();
    jobs = new JobSystem();
  });

  it('should post jobs to queue', () => {
    const posting: JobPosting = {
      id: 'job1',
      type: 'clean',
      targetTile: { x: 3, y: 3 },
      priority: 5,
      duration: 30,
    };
    jobs.postJob(posting);
    expect(jobs.queueLength).toBe(1);
  });

  it('should sort queue by priority', () => {
    jobs.postJob({ id: 'low', type: 'haul', targetTile: { x: 1, y: 1 }, priority: 1, duration: 10 });
    jobs.postJob({ id: 'high', type: 'build', targetTile: { x: 2, y: 2 }, priority: 10, duration: 20 });
    const posted = jobs.getPostedJobs();
    expect(posted[0].id).toBe('high');
  });

  it('should assign jobs to idle followers', () => {
    const entity = createFollower(world, 0, 0);
    jobs.postJob({
      id: 'job1', type: 'clean', targetTile: { x: 3, y: 3 },
      priority: 5, duration: 30,
    });
    jobs.update(world, 1);

    const job = world.getComponent(entity, Job)!;
    expect(job.type).toBe('clean');
    expect(job.jobId).toBe('job1');
  });

  it('should not assign job to busy follower', () => {
    const entity = createFollower(world);
    const ai = world.getComponent(entity, FollowerAI)!;
    ai.state = 'working';

    jobs.postJob({
      id: 'job1', type: 'clean', targetTile: { x: 3, y: 3 },
      priority: 5, duration: 30,
    });
    jobs.update(world, 1);

    const job = world.getComponent(entity, Job)!;
    expect(job.type).toBe('idle'); // should still be idle (not assigned)
  });

  it('should progress work when follower is working', () => {
    const entity = createFollower(world, 3, 3);
    const ai = world.getComponent(entity, FollowerAI)!;

    jobs.postJob({
      id: 'job1', type: 'clean', targetTile: { x: 3, y: 3 },
      priority: 5, duration: 10,
    });
    // Assign the job (follower must be idle for assignment)
    jobs.update(world, 1);

    const job = world.getComponent(entity, Job)!;
    expect(job.type).toBe('clean'); // assigned

    // Simulate arrival at work site
    ai.state = 'working';
    job.workProgress = 0;

    // Progress work to completion
    jobs.update(world, 10);

    expect(job.type).toBe('idle'); // completed
    expect(ai.state).toBe('done');
  });

  it('should cancel posted jobs', () => {
    jobs.postJob({ id: 'job1', type: 'haul', targetTile: { x: 1, y: 1 }, priority: 1, duration: 10 });
    expect(jobs.cancelJob('job1')).toBe(true);
    expect(jobs.queueLength).toBe(0);
  });

  it('should track completed jobs', () => {
    const entity = createFollower(world, 3, 3);
    const ai = world.getComponent(entity, FollowerAI)!;

    jobs.postJob({
      id: 'job1', type: 'clean', targetTile: { x: 3, y: 3 },
      priority: 5, duration: 5,
    });
    // Assign
    jobs.update(world, 1);
    // Simulate working
    ai.state = 'working';
    const job = world.getComponent(entity, Job)!;
    job.workProgress = 0;
    // Complete
    jobs.update(world, 5);

    expect(jobs.getCompletedCount()).toBe(1);
  });
});

describe('AISystem', () => {
  let world: World;
  let map: TileMap;
  let pathfinder: Pathfinder;
  let ai: AISystem;

  beforeEach(() => {
    world = new World();
    map = new TileMap(32, 32);
    pathfinder = new Pathfinder(map);
    ai = new AISystem(map, pathfinder);
  });

  it('should transition idle to needs on critical needs after timeout', () => {
    const entity = createFollower(world, 5, 5);
    const followerAI = world.getComponent(entity, FollowerAI)!;
    const needs = world.getComponent(entity, Needs)!;

    needs.hunger = 10;
    // First update triggers needs state
    needs; // suppress unused
    const needsSys = new NeedsSystem();
    needsSys.update(world, 1);
    expect(followerAI.state).toBe('needs');
  });

  it('should transition from needs to idle after cooldown', () => {
    const entity = createFollower(world, 5, 5);
    const followerAI = world.getComponent(entity, FollowerAI)!;
    const needs = world.getComponent(entity, Needs)!;

    followerAI.state = 'needs';
    followerAI.stateTimer = 0;
    needs.hunger = 50;

    // needsCooldown is 60 ticks
    ai.update(world, 60);

    expect(followerAI.state).toBe('idle');
    expect(needs.hunger).toBeGreaterThan(50); // should have restored
  });

  it('should transition from done to idle after cooldown', () => {
    const entity = createFollower(world, 5, 5);
    const followerAI = world.getComponent(entity, FollowerAI)!;

    followerAI.state = 'done';
    followerAI.stateTimer = 0;

    // doneCooldown is 10 ticks
    ai.update(world, 10);

    expect(followerAI.state).toBe('idle');
  });

  it('should compute path when moving', () => {
    const entity = createFollower(world, 5, 5);
    const followerAI = world.getComponent(entity, FollowerAI)!;
    const job = world.getComponent(entity, Job)!;

    job.targetTile = { x: 10, y: 10 };
    followerAI.state = 'moving';
    followerAI.stateTimer = 0;

    ai.update(world, 1);

    expect(followerAI.path.length).toBeGreaterThan(0);
  });

  it('should move follower along path', () => {
    const entity = createFollower(world, 5, 5);
    const followerAI = world.getComponent(entity, FollowerAI)!;
    const transform = world.getComponent(entity, Transform)!;
    const job = world.getComponent(entity, Job)!;

    job.targetTile = { x: 10, y: 5 }; // straight line
    followerAI.state = 'moving';
    followerAI.stateTimer = 0;

    // First update computes path
    ai.update(world, 1);
    expect(followerAI.path.length).toBeGreaterThan(0);

    const startX = transform.x;
    // Second update moves
    ai.update(world, 1);
    expect(transform.x).not.toBe(startX);
  });

  it('should reach destination and start working', () => {
    const entity = createFollower(world, 5, 5);
    const followerAI = world.getComponent(entity, FollowerAI)!;
    const transform = world.getComponent(entity, Transform)!;
    const job = world.getComponent(entity, Job)!;

    job.targetTile = { x: 7, y: 5 };
    followerAI.state = 'moving';
    followerAI.stateTimer = 0;

    // Run enough ticks to reach destination (distance 2, speed 0.5/tick = 4 ticks)
    for (let i = 0; i < 20; i++) {
      ai.update(world, 1);
      if ((followerAI.state as string) === 'working') break;
    }

    expect(followerAI.state).toBe('working');
    expect(transform.x).toBeCloseTo(7);
  });
});

describe('FollowerFactory', () => {
  let world: World;
  let factory: FollowerFactory;

  beforeEach(() => {
    world = new World();
    factory = new FollowerFactory(42);
  });

  it('should create a follower with all components', () => {
    const follower = factory.spawn(world, { x: 5, y: 5 });

    expect(follower.entityId).toBeDefined();
    expect(follower.name).toBeTruthy();
    expect(world.hasEntity(follower.entityId)).toBe(true);

    const transform = world.getComponent(follower.entityId, Transform)!;
    expect(transform.x).toBe(5);
    expect(transform.y).toBe(5);

    const needs = world.getComponent(follower.entityId, Needs)!;
    expect(needs.hunger).toBeGreaterThan(0);
    expect(needs.faith).toBeGreaterThan(0);

    const ai = world.getComponent(follower.entityId, FollowerAI)!;
    expect(ai.state).toBe('idle');

    const traits = world.getComponent(follower.entityId, Traits)!;
    expect(traits.traits.length).toBeGreaterThanOrEqual(1);
    expect(traits.traits.length).toBeLessThanOrEqual(2);
  });

  it('should spawn multiple followers', () => {
    const followers = factory.spawnGroup(world, 5, 0, 0);
    expect(followers).toHaveLength(5);
    expect(world.entityCount).toBe(5);
  });

  it('should use provided name', () => {
    const follower = factory.spawn(world, { x: 0, y: 0, name: 'TestName' });
    expect(follower.name).toBe('TestName');
  });

  it('should use provided traits', () => {
    const follower = factory.spawn(world, { x: 0, y: 0, traits: ['zealous', 'hardy'] });
    const traits = world.getComponent(follower.entityId, Traits)!;
    expect(traits.traits).toEqual(['zealous', 'hardy']);
  });

  it('should be deterministic with same seed', () => {
    const factory1 = new FollowerFactory(123);
    const factory2 = new FollowerFactory(123);

    const f1 = factory1.spawn(world, { x: 0, y: 0 });
    const world2 = new World();
    const f2 = factory2.spawn(world2, { x: 0, y: 0 });

    const n1 = world.getComponent(f1.entityId, Needs)!;
    const n2 = world2.getComponent(f2.entityId, Needs)!;

    expect(n1.hunger).toBeCloseTo(n2.hunger);
    expect(n1.faith).toBeCloseTo(n2.faith);
  });
});