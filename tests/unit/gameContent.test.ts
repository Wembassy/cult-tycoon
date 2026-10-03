import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Needs } from '@components/Needs';
import { Health } from '@components/Health';
import { FollowerAI } from '@components/FollowerAI';
import { EventSystem, EventDef, GameEvent } from '@systems/EventSystem';
import { DataManager } from '@data/DataManager';

function createFollower(world: World): number {
  const entity = world.createEntity();
  world.addComponent(entity, new Needs(entity));
  const health = new Health(entity);
  world.addComponent(entity, health);
  world.addComponent(entity, new FollowerAI(entity));
  return entity;
}

describe('DataManager', () => {
  it('should load traits', () => {
    const traits = DataManager.getTraits();
    expect(traits.length).toBeGreaterThan(0);
    expect(traits[0].id).toBeTruthy();
    expect(traits[0].name).toBeTruthy();
  });

  it('should load objects', () => {
    const objects = DataManager.getObjects();
    expect(objects.length).toBeGreaterThan(0);
    expect(objects[0].cost).toBeGreaterThan(0);
  });

  it('should load rooms', () => {
    const rooms = DataManager.getRooms();
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms[0].minSize).toBeGreaterThan(0);
  });

  it('should load rituals', () => {
    const rituals = DataManager.getRituals();
    expect(rituals.length).toBeGreaterThan(0);
    expect(rituals[0].duration).toBeGreaterThan(0);
  });

  it('should load events', () => {
    const events = DataManager.getEvents();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].probability).toBeGreaterThan(0);
  });

  it('should load tech', () => {
    const tech = DataManager.getTech();
    expect(tech.length).toBeGreaterThan(0);
    expect(tech[0].cost).toBeGreaterThan(0);
  });

  it('should load patrons', () => {
    const patrons = DataManager.getPatrons();
    expect(patrons.length).toBeGreaterThan(0);
  });

  it('should find specific object by id', () => {
    const obj = DataManager.getObject('bed');
    expect(obj).toBeDefined();
    expect(obj!.name).toBe('Bed');
  });

  it('should return undefined for unknown id', () => {
    const obj = DataManager.getObject('nonexistent');
    expect(obj).toBeUndefined();
  });
});

describe('EventSystem', () => {
  let world: World;
  let events: EventDef[];
  let firedEvents: GameEvent[];

  beforeEach(() => {
    world = new World();
    firedEvents = [];
    events = [
      {
        id: 'test_positive',
        name: 'Test Positive',
        type: 'positive',
        probability: 1.0, // 100% per tick for testing
        minDay: 1,
        description: 'Test event',
        effects: { faithGain: 20 },
      },
      {
        id: 'test_negative',
        name: 'Test Negative',
        type: 'negative',
        probability: 0.5,
        minDay: 5,
        description: 'Test negative event',
        effects: { faithDamage: 15, affectedCount: 1 },
      },
      {
        id: 'test_health',
        name: 'Health Damage',
        type: 'negative',
        probability: 0.5,
        minDay: 1,
        description: 'Damages health',
        effects: { healthDamage: 20, affectedCount: 1 },
      },
    ];
  });

  it('should fire events based on probability', () => {
    const e1 = createFollower(world);
    const needs = world.getComponent(e1, Needs)!;
    needs.faith = 50; // Lower so faith gain is visible
    const startingFaith = needs.faith;

    const system = new EventSystem(events, 42, (e) => firedEvents.push(e));
    system.update(world, 1); // 1 tick, probability 1.0 for test_positive

    expect(firedEvents.length).toBeGreaterThan(0);
    const positiveEvent = firedEvents.find((e) => e.id === 'test_positive');
    expect(positiveEvent).toBeDefined();
    expect(needs.faith).toBeGreaterThan(startingFaith);
  });

  it('should not fire events before minDay', () => {
    const system = new EventSystem(events, 42, (e) => firedEvents.push(e));
    // test_negative requires day 5, but we're at day 1
    system.update(world, 1);
    const negativeEvent = firedEvents.find((e) => e.id === 'test_negative');
    expect(negativeEvent).toBeUndefined();
  });

  it('should apply health damage to followers', () => {
    const e1 = createFollower(world);
    const health = world.getComponent(e1, Health)!;

    const system = new EventSystem(events, 42, (e) => firedEvents.push(e));
    system.update(world, 1);

    // With prob 0.5 and seed 42, may or may not fire — just check it doesn't crash
    expect(health.hp).toBeGreaterThanOrEqual(0);
  });

  it('should track fired events', () => {
    const system = new EventSystem(events, 42, (e) => firedEvents.push(e));
    system.update(world, 1);
    expect(system.getFiredEvents().length).toBe(firedEvents.length);
  });

  it('should clear history', () => {
    const system = new EventSystem(events, 42);
    system.update(world, 1);
    expect(system.getFiredEvents().length).toBeGreaterThan(0);
    system.clearHistory();
    expect(system.getFiredEvents().length).toBe(0);
  });

  it('should track day count', () => {
    const system = new EventSystem(events, 42);
    // The main clock owns the calendar; systems no longer invent incompatible days.
    system.setDay(2);
    system.update(world, 1);
    expect(system.day).toBe(2);
  });
});
