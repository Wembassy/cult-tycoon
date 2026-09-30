import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Transform } from '@components/Transform';
import { Needs } from '@components/Needs';
import { Job } from '@components/Job';
import { Health } from '@components/Health';

describe('World — Entity Management', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('should create entities with unique IDs', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    expect(e1).toBe(0);
    expect(e2).toBe(1);
    expect(e1).not.toBe(e2);
  });

  it('should track entity count', () => {
    expect(world.entityCount).toBe(0);
    world.createEntity();
    world.createEntity();
    expect(world.entityCount).toBe(2);
  });

  it('should destroy entities', () => {
    const e = world.createEntity();
    expect(world.hasEntity(e)).toBe(true);
    world.destroyEntity(e);
    expect(world.hasEntity(e)).toBe(false);
    expect(world.entityCount).toBe(0);
  });

  it('should clear all entities', () => {
    world.createEntity();
    world.createEntity();
    world.clear();
    expect(world.entityCount).toBe(0);
    expect(world.allEntities()).toHaveLength(0);
  });
});

describe('World — Component Management', () => {
  let world: World;
  let entity: number;

  beforeEach(() => {
    world = new World();
    entity = world.createEntity();
  });

  it('should add and get components', () => {
    const transform = new Transform(entity);
    transform.x = 5;
    transform.y = 10;
    world.addComponent(entity, transform);

    const result = world.getComponent(entity, Transform);
    expect(result).toBeDefined();
    expect(result!.x).toBe(5);
    expect(result!.y).toBe(10);
  });

  it('should return undefined for missing components', () => {
    const result = world.getComponent(entity, Needs);
    expect(result).toBeUndefined();
  });

  it('should check if entity has component', () => {
    world.addComponent(entity, new Transform(entity));
    expect(world.hasComponent(entity, Transform)).toBe(true);
    expect(world.hasComponent(entity, Needs)).toBe(false);
  });

  it('should remove components', () => {
    world.addComponent(entity, new Transform(entity));
    expect(world.hasComponent(entity, Transform)).toBe(true);
    world.removeComponent(entity, Transform);
    expect(world.hasComponent(entity, Transform)).toBe(false);
  });

  it('should throw when adding component to non-existent entity', () => {
    expect(() => world.addComponent(999, new Transform(999))).toThrow();
  });

  it('should remove all components when entity is destroyed', () => {
    world.addComponent(entity, new Transform(entity));
    world.addComponent(entity, new Needs(entity));
    world.destroyEntity(entity);
    expect(world.getComponent(entity, Transform)).toBeUndefined();
    expect(world.getComponent(entity, Needs)).toBeUndefined();
  });
});

describe('World — Queries', () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it('should query entities with single component', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const e3 = world.createEntity();

    world.addComponent(e1, new Transform(e1));
    world.addComponent(e2, new Transform(e2));
    world.addComponent(e3, new Needs(e3));

    const result = world.query([Transform]);
    expect(result).toHaveLength(2);
    expect(result).toContain(e1);
    expect(result).toContain(e2);
    expect(result).not.toContain(e3);
  });

  it('should query entities with multiple components (AND)', () => {
    const e1 = world.createEntity();
    const e2 = world.createEntity();
    const e3 = world.createEntity();

    world.addComponent(e1, new Transform(e1));
    world.addComponent(e1, new Needs(e1));
    world.addComponent(e2, new Transform(e2));
    world.addComponent(e3, new Needs(e3));

    const result = world.query([Transform, Needs]);
    expect(result).toHaveLength(1);
    expect(result).toContain(e1);
  });

  it('should return empty array when no entities match', () => {
    const e1 = world.createEntity();
    world.addComponent(e1, new Transform(e1));

    const result = world.query([Needs]);
    expect(result).toHaveLength(0);
  });

  it('should return all entities when query has no component types', () => {
    world.createEntity();
    world.createEntity();
    world.createEntity();

    const result = world.query([]);
    expect(result).toHaveLength(3);
  });

  it('should handle entities with many components', () => {
    const e = world.createEntity();
    world.addComponent(e, new Transform(e));
    world.addComponent(e, new Needs(e));
    world.addComponent(e, new Job(e));
    world.addComponent(e, new Health(e));

    const result = world.query([Transform, Needs, Job, Health]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(e);
  });
});

describe('World — Performance', () => {
  it('should handle 1000+ entities efficiently', () => {
    const world = new World();
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      const e = world.createEntity();
      world.addComponent(e, new Transform(e));
      world.addComponent(e, new Needs(e));
    }

    const createEnd = performance.now();
    const createMs = createEnd - start;

    // Query all entities with Transform
    const queryStart = performance.now();
    const result = world.query([Transform]);
    const queryEnd = performance.now();
    const queryMs = queryEnd - queryStart;

    expect(result).toHaveLength(1000);
    // Should complete in reasonable time (not a strict perf test, just sanity)
    expect(createMs).toBeLessThan(500);  // 500ms budget
    expect(queryMs).toBeLessThan(50);    // 50ms budget for query
  });

  it('should handle rapid create/destroy cycles', () => {
    const world = new World();
    const entities: number[] = [];

    // Create 500
    for (let i = 0; i < 500; i++) {
      entities.push(world.createEntity());
      world.addComponent(entities[i], new Transform(entities[i]));
    }

    // Destroy first 250
    for (let i = 0; i < 250; i++) {
      world.destroyEntity(entities[i]);
    }

    expect(world.entityCount).toBe(250);
    expect(world.query([Transform])).toHaveLength(250);
  });
});