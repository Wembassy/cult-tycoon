import { describe, expect, it } from 'vitest';
import { World } from '@ecs/World';
import { TileMap } from '@world/TileMap';
import { WorldGen } from '@world/WorldGen';
import { NavigationGrid } from '@world/NavigationGrid';
import { Pathfinder } from '@world/Pathfinder';
import {
  generateGlobalWorld,
  localParametersForRegion,
} from '@world/GlobalWorld';
import { SaveSystem, type SerializedCult } from '@systems/SaveSystem';
import { Skills } from '@components/Skills';
import { SocialState } from '@components/SocialState';
import { Needs } from '@components/Needs';
import { FollowerAI } from '@components/FollowerAI';
import { Transform } from '@components/Transform';
import { IdeologySystem } from '@systems/IdeologySystem';
import { BeliefState } from '@components/BeliefState';
import { Outsider } from '@components/Outsider';
import { Traits } from '@components/Traits';
import { Health } from '@components/Health';
import { OutsiderSystem } from '@systems/OutsiderSystem';
import { createIdeologyFoundation } from '@game/Ideology';
import { Job } from '@components/Job';
import { Inventory } from '@components/Inventory';
import { WorkPreferences } from '@components/WorkPreferences';
import { Schedule } from '@components/Schedule';

const CULT: SerializedCult = {
  influence: 10,
  wealth: 200,
  notoriety: 0,
  faith: 75,
  morale: 80,
  population: 2,
  maxPopulation: 10,
  leaderName: 'Founder',
  leaderTitle: 'Leader',
  day: 1,
  hour: 6,
};

describe('Alpha global world start', () => {
  it('is deterministic for the same seed', () => {
    const a = generateGlobalWorld(12345);
    const b = generateGlobalWorld(12345);
    expect(a).toEqual(b);
  });

  it('produces meaningfully different local parameters across regions', () => {
    const world = generateGlobalWorld(12345);
    const first = localParametersForRegion(world.regions[0]);
    const distinct = world.regions
      .map(localParametersForRegion)
      .find(params =>
        params.treeDensity !== first.treeDensity ||
        params.rockDensity !== first.rockDensity ||
        params.waterPools !== first.waterPools,
      );

    expect(distinct).toBeDefined();
  });

  it('regenerates the same local map from the same selected region', () => {
    const region = generateGlobalWorld(2468).regions[7];
    const params = localParametersForRegion(region);
    const a = new WorldGen(params.seed).generate(params);
    const b = new WorldGen(params.seed).generate(params);

    expect(a.getAllTiles().map(tile => [tile.terrain, tile.decor]))
      .toEqual(b.getAllTiles().map(tile => [tile.terrain, tile.decor]));
  });
});

describe('Alpha save identity round-trip', () => {
  it('preserves sparse entity IDs and the allocation floor', () => {
    const world = new World();
    const first = world.createEntity();
    const removed = world.createEntity();
    const third = world.createEntity();
    world.destroyEntity(removed);

    world.addComponent(first, new Needs(first));
    world.addComponent(third, new Needs(third));

    const save = new SaveSystem();
    const data = save.serialize(
      world,
      new TileMap(8, 8),
      CULT,
      { hour: 6, day: 1 },
      undefined,
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { [String(first)]: 'Alpha', [String(third)]: 'Gamma' },
    );

    const restored = new World();
    save.deserializeWorld(data, restored);

    expect(restored.hasEntity(first)).toBe(true);
    expect(restored.hasEntity(third)).toBe(true);
    expect(restored.hasEntity(removed)).toBe(false);
    expect(restored.createEntity()).toBe(3);
    expect(data.followerNames?.[String(third)]).toBe('Gamma');
  });
});

describe('Alpha skills and passions', () => {
  it('major passion learns faster than no passion', () => {
    const plain = new Skills(1);
    const passionate = new Skills(2);
    passionate.passions.construction = 'major';

    plain.addExperience('construction', 10);
    passionate.addExperience('construction', 10);

    expect(passionate.xp.construction).toBeGreaterThan(plain.xp.construction);
  });

  it('levels a skill through repeated related experience', () => {
    const skills = new Skills(1);
    for (let i = 0; i < 20; i++) skills.addExperience('growing', 5);
    expect(skills.growing).toBeGreaterThan(1);
  });
});

describe('Alpha ideology behavior', () => {
  function createBeliever(world: World): number {
    const entity = world.createEntity();
    world.addComponent(entity, new BeliefState(entity));
    world.addComponent(entity, new SocialState(entity));
    world.addComponent(entity, new Needs(entity));
    world.addComponent(entity, new FollowerAI(entity));
    return entity;
  }

  it('communal and ascetic food doctrine create different meal thoughts', () => {
    const world = new World();
    const entity = createBeliever(world);
    const social = world.getComponent(entity, SocialState)!;

    const ideology = new IdeologySystem();
    ideology.setFoundation('communal_devotion');
    ideology.recordFoodEvent(world, entity, 'meal');
    const communalMood = social.memoryMoodTotal();

    social.memories = [];
    ideology.setFoundation('ascetic_order');
    ideology.recordFoodEvent(world, entity, 'meal');
    const asceticMood = social.memoryMoodTotal();

    expect(communalMood).toBeGreaterThan(asceticMood);
  });
});

describe('Alpha social mood', () => {
  it('includes temporary memories and expires them', async () => {
    const { SocialSystem } = await import('@systems/SocialSystem');
    const world = new World();
    const entity = world.createEntity();
    const needs = new Needs(entity);
    needs.hunger = 50;
    needs.energy = 50;
    needs.fun = 50;
    needs.sanity = 50;
    needs.comfort = 50;
    needs.social = 50;
    world.addComponent(entity, needs);
    world.addComponent(entity, new FollowerAI(entity));
    world.addComponent(entity, new Transform(entity));

    const social = new SocialState(entity);
    social.addMemory({
      id: 'good',
      label: 'Good memory',
      mood: 10,
      duration: 2,
      stackKey: 'good',
    });
    world.addComponent(entity, social);

    const system = new SocialSystem();
    system.update(world, 1);
    expect(social.mood).toBeGreaterThan(50);

    system.update(world, 2);
    expect(social.memories).toHaveLength(0);
  });
});

describe('Alpha outsider recruitment', () => {
  function addRecruiter(world: World): number {
    const entity = world.createEntity();
    const skills = new Skills(entity);
    skills.social = 10;
    world.addComponent(entity, skills);
    world.addComponent(entity, new SocialState(entity));
    world.addComponent(entity, new FollowerAI(entity));
    world.addComponent(entity, new Needs(entity));
    return entity;
  }

  function addVisitor(world: World): number {
    const entity = world.createEntity();
    const outsider = new Outsider(entity);
    outsider.name = 'Visitor';
    outsider.state = 'visiting';
    world.addComponent(entity, outsider);
    world.addComponent(entity, new BeliefState(entity));
    world.addComponent(entity, new SocialState(entity));
    world.addComponent(entity, new Skills(entity));
    world.addComponent(entity, new Traits(entity));
    world.addComponent(entity, new Health(entity));
    return entity;
  }

  it('high traffic schedules visitors sooner than remote traffic with the same seed', () => {
    const map = new TileMap(16, 16);
    const pathfinder = new Pathfinder(map, new NavigationGrid(map));
    const ideology = () => createIdeologyFoundation('communal_devotion');

    const remote = new OutsiderSystem(map, pathfinder, ideology);
    remote.configure(5, { x: 8, y: 8 }, 99);

    const busy = new OutsiderSystem(map, pathfinder, ideology);
    busy.configure(95, { x: 8, y: 8 }, 99);

    expect(busy.getSnapshot().nextVisitIn).toBeLessThan(remote.getSnapshot().nextVisitIn);
  });

  it('explicit recruitment progress can convert a visitor into a follower', () => {
    const world = new World();
    const map = new TileMap(16, 16);
    const pathfinder = new Pathfinder(map, new NavigationGrid(map));
    const system = new OutsiderSystem(
      map,
      pathfinder,
      () => createIdeologyFoundation('communal_devotion'),
    );

    const recruiter = addRecruiter(world);
    const visitor = addVisitor(world);
    const outsider = world.getComponent(visitor, Outsider)!;
    outsider.recruitmentProgress = 95;
    outsider.recruitmentCooldown = 0;

    const result = system.attemptRecruitment(world, visitor, recruiter);

    expect(result.recruited).toBe(true);
    expect(world.getComponent(visitor, Outsider)).toBeUndefined();
    expect(world.getComponent(visitor, FollowerAI)).toBeDefined();
    expect(world.getComponent(visitor, Job)).toBeDefined();
    expect(world.getComponent(visitor, Inventory)).toBeDefined();
    expect(world.getComponent(visitor, WorkPreferences)).toBeDefined();
    expect(world.getComponent(visitor, Schedule)).toBeDefined();
  });
});
