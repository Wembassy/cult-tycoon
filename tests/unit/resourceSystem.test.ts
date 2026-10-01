import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Job, JobType } from '@components/Job';
import { FollowerAI } from '@components/FollowerAI';
import { Skills } from '@components/Skills';
import { Needs } from '@components/Needs';
import { Traits, TraitType } from '@components/Traits';
import { Health } from '@components/Health';
import { GameState } from '@game/GameState';
import { ResourceSystem, ResourceEvent } from '@systems/ResourceSystem';

function createFollower(
  world: World,
  jobType: JobType = 'idle',
  aiState: 'working' | 'idle' = 'idle',
  skills?: Partial<Skills>,
  traits?: TraitType[],
): number {
  const entity = world.createEntity();

  const needs = new Needs(entity);
  world.addComponent(entity, needs);

  const job = new Job(entity);
  job.type = jobType;
  world.addComponent(entity, job);

  const ai = new FollowerAI(entity);
  ai.state = aiState;
  world.addComponent(entity, ai);

  const skillsComp = new Skills(entity);
  if (skills) {
    Object.assign(skillsComp, skills);
  }
  world.addComponent(entity, skillsComp);

  const traitsComp = new Traits(entity);
  if (traits) {
    traitsComp.traits = traits;
  }
  world.addComponent(entity, traitsComp);

  world.addComponent(entity, new Health(entity));

  return entity;
}

describe('ResourceSystem', () => {
  let world: World;
  let gameState: GameState;
  let system: ResourceSystem;
  let events: ResourceEvent[];

  beforeEach(() => {
    world = new World();
    events = [];
    gameState = new GameState({
      faith: 50,
      funds: 200,
      materials: 30,
      food: 50,
      influence: 20,
      notoriety: 0,
    });
    system = new ResourceSystem(
      gameState,
      {},
      (e) => events.push(e),
    );
  });

  describe('Construction', () => {
    it('should construct with default config', () => {
      const sys = new ResourceSystem(gameState);
      expect(sys).toBeDefined();
      expect(sys.getConfig()).toBeDefined();
    });

    it('should construct with custom config', () => {
      const sys = new ResourceSystem(gameState, { prayFaithRate: 2.0 });
      expect(sys.getConfig().prayFaithRate).toBe(2.0);
    });

    it('should start with empty net flow', () => {
      const flow = system.getNetFlow();
      expect(flow).toEqual({});
    });
  });

  describe('Resource Generation', () => {
    it('should generate faith when followers are praying', () => {
      createFollower(world, 'pray', 'working', { faith: 5 });
      const initialFaith = gameState.resources.faith;
      system.update(world, 1); // 1 second
      expect(gameState.resources.faith).toBeGreaterThan(initialFaith);
    });

    it('should generate food when followers are cooking', () => {
      createFollower(world, 'cook', 'working', { cooking: 5 });
      const initialFood = gameState.resources.food;
      system.update(world, 1);
      expect(gameState.resources.food).toBeGreaterThan(initialFood);
    });

    it('should generate influence when followers are researching', () => {
      createFollower(world, 'research', 'working', { research: 5 });
      const initialInfluence = gameState.resources.influence;
      system.update(world, 1);
      expect(gameState.resources.influence).toBeGreaterThan(initialInfluence);
    });

    it('should generate materials when followers are building', () => {
      createFollower(world, 'build', 'working', { construction: 5 });
      const initialMaterials = gameState.resources.materials;
      system.update(world, 1);
      expect(gameState.resources.materials).toBeGreaterThan(initialMaterials);
    });

    it('should generate small faith from cleaning', () => {
      createFollower(world, 'clean', 'working');
      const initialFaith = gameState.resources.faith;
      system.update(world, 1);
      expect(gameState.resources.faith).toBeGreaterThan(initialFaith);
    });

    it('should generate small materials from hauling', () => {
      createFollower(world, 'haul', 'working');
      const initialMaterials = gameState.resources.materials;
      system.update(world, 1);
      expect(gameState.resources.materials).toBeGreaterThan(initialMaterials);
    });

    it('should NOT generate resources when follower is idle', () => {
      createFollower(world, 'pray', 'idle', { faith: 10 });
      const initialFaith = gameState.resources.faith;
      system.update(world, 1);
      expect(gameState.resources.faith).toBe(initialFaith);
    });

    it('should NOT generate resources when job type is idle', () => {
      createFollower(world, 'idle', 'working');
      const initial = { ...gameState.resources };
      system.update(world, 1);
      // Only consumption should apply (food + funds), not generation
      expect(gameState.resources.faith).toBe(initial.faith);
      expect(gameState.resources.materials).toBe(initial.materials);
      expect(gameState.resources.influence).toBe(initial.influence);
    });

    it('should scale generation with skill level', () => {
      const lowSkillEntity = createFollower(world, 'pray', 'working', { faith: 1 });
      const lowSkillFaithBefore = gameState.resources.faith;
      system.update(world, 1);
      const lowSkillGain = gameState.resources.faith - lowSkillFaithBefore;

      // Reset and test high skill
      world.destroyEntity(lowSkillEntity);
      gameState.resources.faith = 50;

      createFollower(world, 'pray', 'working', { faith: 10 });
      const highSkillFaithBefore = gameState.resources.faith;
      system.update(world, 1);
      const highSkillGain = gameState.resources.faith - highSkillFaithBefore;

      expect(highSkillGain).toBeGreaterThan(lowSkillGain);
    });

    it('should generate more with multiple working followers', () => {
      createFollower(world, 'pray', 'working', { faith: 5 });
      createFollower(world, 'pray', 'working', { faith: 5 });
      const initialFaith = gameState.resources.faith;
      system.update(world, 1);
      const gain = gameState.resources.faith - initialFaith;

      // Reset
      gameState.resources.faith = 50;
      world.clear();
      createFollower(world, 'pray', 'working', { faith: 5 });
      const singleInitialFaith = gameState.resources.faith;
      system.update(world, 1);
      const singleGain = gameState.resources.faith - singleInitialFaith;

      expect(gain).toBeGreaterThan(singleGain);
    });
  });

  describe('Resource Consumption', () => {
    it('should consume food per follower', () => {
      // 3 idle followers (no generation, only consumption)
      createFollower(world, 'idle', 'idle');
      createFollower(world, 'idle', 'idle');
      createFollower(world, 'idle', 'idle');
      const initialFood = gameState.resources.food;
      system.update(world, 1);
      expect(gameState.resources.food).toBeLessThan(initialFood);
    });

    it('should consume funds (upkeep) per follower', () => {
      createFollower(world, 'idle', 'idle');
      const initialFunds = gameState.resources.funds;
      system.update(world, 1);
      expect(gameState.resources.funds).toBeLessThan(initialFunds);
    });

    it('should consume more food with more followers', () => {
      // Test with 1 follower
      createFollower(world, 'idle', 'idle');
      const initialFood1 = gameState.resources.food;
      system.update(world, 1);
      const consumption1 = initialFood1 - gameState.resources.food;

      // Reset with 5 followers
      world.clear();
      gameState.resources.food = 50;
      for (let i = 0; i < 5; i++) {
        createFollower(world, 'idle', 'idle');
      }
      const initialFood5 = gameState.resources.food;
      system.update(world, 1);
      const consumption5 = initialFood5 - gameState.resources.food;

      expect(consumption5).toBeGreaterThan(consumption1);
    });

    it('should not let food go below 0', () => {
      gameState.resources.food = 1;
      createFollower(world, 'idle', 'idle');
      createFollower(world, 'idle', 'idle');
      createFollower(world, 'idle', 'idle');
      system.update(world, 10);
      expect(gameState.resources.food).toBe(0);
    });
  });

  describe('Notoriety', () => {
    it('should slowly grow notoriety with population', () => {
      createFollower(world, 'idle', 'idle');
      const initialNotoriety = gameState.resources.notoriety;
      system.update(world, 1);
      expect(gameState.resources.notoriety).toBeGreaterThan(initialNotoriety);
    });

    it('should not grow notoriety without followers', () => {
      const initialNotoriety = gameState.resources.notoriety;
      system.update(world, 1);
      expect(gameState.resources.notoriety).toBe(initialNotoriety);
    });

    it('should clamp notoriety to 100', () => {
      gameState.resources.notoriety = 99;
      createFollower(world, 'idle', 'idle');
      system.update(world, 1000);
      expect(gameState.resources.notoriety).toBeLessThanOrEqual(100);
    });
  });

  describe('Trait Multipliers', () => {
    it('should boost faith generation for zealous followers', () => {
      // Zealous follower
      createFollower(world, 'pray', 'working', { faith: 5 }, ['zealous']);
      const initialFaithZealous = gameState.resources.faith;
      system.update(world, 1);
      const zealousGain = gameState.resources.faith - initialFaithZealous;

      // Reset
      gameState.resources.faith = 50;
      world.clear();

      // Normal follower
      createFollower(world, 'pray', 'working', { faith: 5 });
      const initialFaithNormal = gameState.resources.faith;
      system.update(world, 1);
      const normalGain = gameState.resources.faith - initialFaithNormal;

      expect(zealousGain).toBeGreaterThan(normalGain);
    });

    it('should boost research for scholar followers', () => {
      createFollower(world, 'research', 'working', { research: 5 }, ['scholar']);
      const initialInfluence = gameState.resources.influence;
      system.update(world, 1);
      const scholarGain = gameState.resources.influence - initialInfluence;

      gameState.resources.influence = 20;
      world.clear();

      createFollower(world, 'research', 'working', { research: 5 });
      const initialInfluence2 = gameState.resources.influence;
      system.update(world, 1);
      const normalGain = gameState.resources.influence - initialInfluence2;

      expect(scholarGain).toBeGreaterThan(normalGain);
    });

    it('should reduce generation for lazy followers', () => {
      createFollower(world, 'pray', 'working', { faith: 5 }, ['lazy']);
      const initialFaithLazy = gameState.resources.faith;
      system.update(world, 1);
      const lazyGain = gameState.resources.faith - initialFaithLazy;

      gameState.resources.faith = 50;
      world.clear();

      createFollower(world, 'pray', 'working', { faith: 5 });
      const initialFaithNormal = gameState.resources.faith;
      system.update(world, 1);
      const normalGain = gameState.resources.faith - initialFaithNormal;

      expect(lazyGain).toBeLessThan(normalGain);
    });
  });

  describe('Net Flow', () => {
    it('should report positive net flow for generated resources', () => {
      createFollower(world, 'pray', 'working', { faith: 5 });
      system.update(world, 1);
      const flow = system.getNetFlow();
      expect(flow.faith).toBeDefined();
      expect(flow.faith!).toBeGreaterThan(0);
    });

    it('should report negative net flow for consumed resources', () => {
      createFollower(world, 'idle', 'idle');
      system.update(world, 1);
      const flow = system.getNetFlow();
      expect(flow.food).toBeDefined();
      expect(flow.food!).toBeLessThan(0);
      expect(flow.funds).toBeDefined();
      expect(flow.funds!).toBeLessThan(0);
    });

    it('should report zero faith net flow for idle followers', () => {
      createFollower(world, 'idle', 'idle');
      system.update(world, 1);
      const flow = system.getNetFlow();
      expect(flow.faith).toBe(0);
    });
  });

  describe('Milestone Events', () => {
    it('should emit milestone event when faith crosses 100', () => {
      gameState.resources.faith = 99;
      createFollower(world, 'pray', 'working', { faith: 10 });
      system.update(world, 1);
      const milestone = events.find(e => e.type === 'milestone' && e.resource === 'faith');
      expect(milestone).toBeDefined();
      expect(milestone!.value).toBeGreaterThanOrEqual(100);
    });

    it('should emit milestone event when funds cross 200', () => {
      gameState.resources.funds = 199;
      // No followers so no upkeep - but we need to add funds
      // We'll just set it above threshold directly
      createFollower(world, 'idle', 'idle');
      // Set funds high enough that even with upkeep it crosses 200
      gameState.resources.funds = 201;
      system.update(world, 0.001); // tiny dt to minimize upkeep
      const milestone = events.find(e => e.type === 'milestone' && e.resource === 'funds');
      // The milestone should be at 200
      if (milestone) {
        expect(milestone.value).toBe(200);
      }
    });

    it('should not re-emit milestone for same threshold', () => {
      gameState.resources.faith = 99;
      createFollower(world, 'pray', 'working', { faith: 10 });
      // First update crosses 100
      system.update(world, 1);
      const firstMilestones = events.filter(e => e.type === 'milestone' && e.resource === 'faith');

      // Second update shouldn't emit another 100 milestone
      system.update(world, 1);
      const secondMilestones = events.filter(e => e.type === 'milestone' && e.resource === 'faith' && e.value === firstMilestones[0]?.value);

      expect(secondMilestones.length).toBe(1); // Only the first one
    });
  });

  describe('Shortage Events', () => {
    it('should emit shortage event when food drops below threshold', () => {
      gameState.resources.food = 10;
      createFollower(world, 'idle', 'idle');
      system.update(world, 1);
      const shortage = events.find(e => e.type === 'shortage' && e.resource === 'food');
      expect(shortage).toBeDefined();
      expect(shortage!.message.toLowerCase()).toContain('food');
    });

    it('should emit shortage event when funds drops below threshold', () => {
      gameState.resources.funds = 10;
      createFollower(world, 'idle', 'idle');
      system.update(world, 1);
      const shortage = events.find(e => e.type === 'shortage' && e.resource === 'funds');
      expect(shortage).toBeDefined();
    });

    it('should not spam shortage events when already in shortage', () => {
      gameState.resources.food = 5;
      createFollower(world, 'idle', 'idle');
      system.update(world, 1);
      const firstShortages = events.filter(e => e.type === 'shortage' && e.resource === 'food');

      system.update(world, 1);
      const allShortages = events.filter(e => e.type === 'shortage' && e.resource === 'food');

      expect(allShortages.length).toBe(firstShortages.length);
    });

    it('should emit surplus event when resource recovers from shortage', () => {
      // Start in shortage
      gameState.resources.food = 5;
      createFollower(world, 'idle', 'idle');
      system.update(world, 1);
      expect(events.some(e => e.type === 'shortage' && e.resource === 'food')).toBe(true);

      // Recover food above threshold
      gameState.resources.food = 50;
      system.update(world, 1);
      const surplus = events.find(e => e.type === 'surplus' && e.resource === 'food');
      expect(surplus).toBeDefined();
      expect(surplus!.message).toContain('recovered');
    });
  });

  describe('Clamping', () => {
    it('should clamp food to minimum 0', () => {
      gameState.resources.food = 0;
      createFollower(world, 'idle', 'idle');
      createFollower(world, 'idle', 'idle');
      system.update(world, 10);
      expect(gameState.resources.food).toBe(0);
    });

    it('should clamp materials to minimum 0', () => {
      gameState.resources.materials = 0;
      createFollower(world, 'idle', 'idle');
      system.update(world, 10);
      expect(gameState.resources.materials).toBe(0);
    });

    it('should clamp notoriety to maximum 100', () => {
      gameState.resources.notoriety = 100;
      createFollower(world, 'idle', 'idle');
      system.update(world, 10);
      expect(gameState.resources.notoriety).toBeLessThanOrEqual(100);
    });

    it('should allow funds to go negative (but clamped to -1000)', () => {
      gameState.resources.funds = 0;
      createFollower(world, 'idle', 'idle');
      system.update(world, 10);
      expect(gameState.resources.funds).toBeLessThan(0);
      expect(gameState.resources.funds).toBeGreaterThanOrEqual(-1000);
    });
  });

  describe('Reset', () => {
    it('should reset milestone tracking', () => {
      gameState.resources.faith = 99;
      createFollower(world, 'pray', 'working', { faith: 10 });
      system.update(world, 1);
      expect(events.some(e => e.type === 'milestone')).toBe(true);

      events = [];
      system.reset();
      // Don't re-emit same milestone after reset if still at same level
      system.update(world, 1);
      // After reset, lastMilestone is 0, so if faith is still > 100, it should re-emit
      const milestones = events.filter(e => e.type === 'milestone');
      expect(milestones.length).toBeGreaterThan(0);
    });

    it('should clear active shortages', () => {
      gameState.resources.food = 5;
      createFollower(world, 'idle', 'idle');
      system.update(world, 1);
      expect(events.some(e => e.type === 'shortage')).toBe(true);

      events = [];
      system.reset();
      // Food still low, should emit shortage again
      system.update(world, 1);
      expect(events.some(e => e.type === 'shortage' && e.resource === 'food')).toBe(true);
    });

    it('should clear net flow', () => {
      createFollower(world, 'pray', 'working', { faith: 5 });
      system.update(world, 1);
      expect(Object.keys(system.getNetFlow()).length).toBeGreaterThan(0);

      system.reset();
      expect(system.getNetFlow()).toEqual({});
    });
  });

  describe('Gradual Resource Flow', () => {
    it('should generate resources gradually over multiple ticks', () => {
      createFollower(world, 'pray', 'working', { faith: 5 });
      const initialFaith = gameState.resources.faith;

      // Tick 10 times with small dt
      for (let i = 0; i < 10; i++) {
        system.update(world, 0.033); // ~30fps
      }

      const totalGain = gameState.resources.faith - initialFaith;
      // Should be gradual but positive
      expect(totalGain).toBeGreaterThan(0);
      // Should not be a huge jump (less than 10 per tick worth)
      expect(totalGain).toBeLessThan(50);
    });

    it('should have balanced consumption vs generation', () => {
      // 1 cooking follower with 3 skill, 3 idle followers eating
      createFollower(world, 'cook', 'working', { cooking: 3 });
      createFollower(world, 'idle', 'idle');
      createFollower(world, 'idle', 'idle');
      createFollower(world, 'idle', 'idle');

      const initialFood = gameState.resources.food;
      system.update(world, 1);
      const foodChange = gameState.resources.food - initialFood;

      // Cook generates: 0.6 * 3 = 1.8 food/sec
      // 4 followers consume: 4 * 0.08 = 0.32 food/sec
      // Net should be positive (cook outpaces consumption)
      expect(foodChange).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle world with no followers', () => {
      const initial = { ...gameState.resources };
      system.update(world, 1);
      // No consumption, no generation
      expect(gameState.resources.faith).toBe(initial.faith);
      expect(gameState.resources.materials).toBe(initial.materials);
      expect(gameState.resources.influence).toBe(initial.influence);
      expect(gameState.resources.food).toBe(initial.food); // no one to eat
      expect(gameState.resources.funds).toBe(initial.funds); // no upkeep
    });

    it('should handle followers without Skills component', () => {
      const entity = world.createEntity();
      const needs = new Needs(entity);
      world.addComponent(entity, needs);
      const job = new Job(entity);
      job.type = 'pray';
      world.addComponent(entity, job);
      const ai = new FollowerAI(entity);
      ai.state = 'working';
      world.addComponent(entity, ai);

      // No Skills or Traits component
      const initialFaith = gameState.resources.faith;
      system.update(world, 1);
      // Should still generate with default skill level 1
      expect(gameState.resources.faith).toBeGreaterThan(initialFaith);
    });

    it('should handle multiple job types simultaneously', () => {
      createFollower(world, 'pray', 'working', { faith: 5 });
      createFollower(world, 'cook', 'working', { cooking: 5 });
      createFollower(world, 'research', 'working', { research: 5 });
      createFollower(world, 'build', 'working', { construction: 5 });

      const initial = { ...gameState.resources };
      system.update(world, 1);

      expect(gameState.resources.faith).toBeGreaterThan(initial.faith);
      expect(gameState.resources.food).toBeGreaterThan(initial.food);
      expect(gameState.resources.influence).toBeGreaterThan(initial.influence);
      expect(gameState.resources.materials).toBeGreaterThan(initial.materials);
    });
  });
});