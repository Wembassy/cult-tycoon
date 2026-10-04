import { describe, expect, it } from 'vitest';
import { World } from '@ecs/World';
import { Inventory } from '@components/Inventory';
import { JobSystem } from '@systems/JobSystem';
import { LogisticsSystem } from '@systems/LogisticsSystem';
import { GameState } from '@game/GameState';

describe('LogisticsSystem', () => {
  it('keeps harvested resources physical until stockpiled', () => {
    const jobs = new JobSystem();
    const logistics = new LogisticsSystem(10, jobs);
    const stack = logistics.addStack('wood', 10, 2, 3);

    expect(stack.state).toBe('ground');
    expect(jobs.getPostedJobs()).toHaveLength(0);

    logistics.designateStockpile([{ x: 40, y: 40 }]);

    expect(jobs.getPostedJobs()).toHaveLength(1);
    expect(jobs.getPostedJobs()[0].type).toBe('haul');
  });

  it('reserves one destination per incoming stack', () => {
    const jobs = new JobSystem();
    const logistics = new LogisticsSystem(10, jobs);
    logistics.designateStockpile([{ x: 40, y: 40 }]);
    logistics.addStack('wood', 10, 2, 3);
    logistics.addStack('stone', 14, 2, 4);

    expect(jobs.getPostedJobs()).toHaveLength(1);
  });

  it('picks up then delivers a stack and credits usable resources', () => {
    const jobs = new JobSystem();
    const logistics = new LogisticsSystem(10, jobs);
    const zone = logistics.designateStockpile([{ x: 40, y: 40 }])!;
    const stack = logistics.addStack('wood', 10, 2, 3);

    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, new Inventory(entity));

    const game = new GameState({ materials: 0, food: 0 });
    const pickup = jobs.getPostedJobs().find(job => job.id === `haul:pickup:${stack.id}`)!;
    const picked = logistics.handleJobCompleted(pickup, entity, world, game.resources);

    expect(picked.handled).toBe(true);
    expect(world.getComponent(entity, Inventory)!.items).toEqual([{ id: 'wood', quantity: 10 }]);

    const delivery = jobs.getPostedJobs().find(job => job.id === `haul:deliver:${stack.id}`)!;
    expect(delivery.requiredEntity).toBe(entity);

    const delivered = logistics.handleJobCompleted(delivery, entity, world, game.resources);
    expect(delivered.handled).toBe(true);
    expect(game.resources.materials).toBe(10);
    expect(world.getComponent(entity, Inventory)!.items).toHaveLength(0);

    const finalStack = logistics.getStacks().find(item => item.id === stack.id)!;
    expect(finalStack.state).toBe('stockpiled');
    expect(finalStack.stockpileId).toBe(zone.id);
  });

  it('round-trips stacks and stockpiles while resetting in-flight reservations', () => {
    const jobs = new JobSystem();
    const source = new LogisticsSystem(10, jobs);
    source.designateStockpile([{ x: 10, y: 10 }, { x: 11, y: 10 }], ['wood']);
    source.addStack('wood', 5, 2, 2);

    const restoredJobs = new JobSystem();
    const restored = new LogisticsSystem(10, restoredJobs);
    restored.restoreSnapshot(source.getSnapshot());

    expect(restored.getStockpiles()).toHaveLength(1);
    expect(restored.getStacks()).toHaveLength(1);
    expect(restoredJobs.getPostedJobs()).toHaveLength(1);
  });
});
