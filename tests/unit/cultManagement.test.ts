import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Needs } from '@components/Needs';
import { Job } from '@components/Job';
import { Skills } from '@components/Skills';
import { Traits } from '@components/Traits';
import { Health } from '@components/Health';
import { FollowerAI } from '@components/FollowerAI';
import { CultManagementSystem, CultLeader, DailySchedule } from '@systems/CultManagementSystem';

function createFollower(world: World): number {
  const entity = world.createEntity();
  world.addComponent(entity, new Needs(entity));
  world.addComponent(entity, new Job(entity));
  world.addComponent(entity, new Skills(entity));
  world.addComponent(entity, new Traits(entity));
  world.addComponent(entity, new Health(entity));
  world.addComponent(entity, new FollowerAI(entity));
  return entity;
}

const TEST_LEADER: CultLeader = {
  name: 'Chris',
  title: 'Founder',
  charisma: 5,
  authority: 5,
  influence: 0,
};

describe('CultManagementSystem — Recruitment', () => {
  let world: World;
  let cult: CultManagementSystem;

  beforeEach(() => {
    world = new World();
    cult = new CultManagementSystem(TEST_LEADER, 42);
  });

  it('should start with 0 population', () => {
    const stats = cult.getStats();
    expect(stats.population).toBe(0);
  });

  it('should recruit a member', () => {
    const entity = createFollower(world);
    const success = cult.recruitMember(entity, 0);
    expect(success).toBe(true);
    expect(cult.getStats().population).toBe(1);
    expect(cult.getRoster()).toContain(entity);
  });

  it('should not recruit beyond max population', () => {
    for (let i = 0; i < 5; i++) {
      cult.recruitMember(createFollower(world), 0);
    }
    expect(cult.getStats().population).toBe(5);
    const success = cult.recruitMember(createFollower(world), 0);
    expect(success).toBe(false);
  });

  it('should not recruit if not enough wealth', () => {
    const entity = createFollower(world);
    const success = cult.recruitMember(entity, 200); // wealth starts at 100
    expect(success).toBe(false);
  });

  it('should remove a member', () => {
    const entity = createFollower(world);
    cult.recruitMember(entity, 0);
    expect(cult.getStats().population).toBe(1);
    cult.removeMember(entity);
    expect(cult.getStats().population).toBe(0);
    expect(cult.getRoster()).not.toContain(entity);
  });
});

describe('CultManagementSystem — Candidates', () => {
  let cult: CultManagementSystem;

  beforeEach(() => {
    cult = new CultManagementSystem(TEST_LEADER, 42);
  });

  it('should generate candidates', () => {
    const candidates = cult.generateCandidates(3);
    expect(candidates).toHaveLength(3);
    expect(candidates[0].name).toBeTruthy();
    expect(candidates[0].interest).toBeGreaterThan(0);
    expect(candidates[0].estimatedCost).toBeGreaterThan(0);
  });

  it('should generate candidates with higher interest based on charisma', () => {
    const charismaticLeader: CultLeader = { ...TEST_LEADER, charisma: 10 };
    const charismaticCult = new CultManagementSystem(charismaticLeader, 42);
    const candidates = charismaticCult.generateCandidates(5);
    const avgInterest = candidates.reduce((sum, c) => sum + c.interest, 0) / candidates.length;
    expect(avgInterest).toBeGreaterThan(40);
  });
});

describe('CultManagementSystem — Stats', () => {
  let world: World;
  let cult: CultManagementSystem;

  beforeEach(() => {
    world = new World();
    cult = new CultManagementSystem(TEST_LEADER, 42);
  });

  it('should track faith as average of followers', () => {
    const e1 = createFollower(world);
    const e2 = createFollower(world);
    cult.recruitMember(e1, 0);
    cult.recruitMember(e2, 0);

    world.getComponent(e1, Needs)!.faith = 80;
    world.getComponent(e2, Needs)!.faith = 60;

    cult.update(world, 1);

    expect(cult.getStats().faith).toBeCloseTo(70, 0);
  });

  it('should track morale as average fun+sanity', () => {
    const e1 = createFollower(world);
    cult.recruitMember(e1, 0);

    world.getComponent(e1, Needs)!.fun = 60;
    world.getComponent(e1, Needs)!.sanity = 80;

    cult.update(world, 1);

    expect(cult.getStats().morale).toBeCloseTo(70, 0);
  });

  it('should accumulate influence from praying followers', () => {
    const e1 = createFollower(world);
    cult.recruitMember(e1, 0);

    const job = world.getComponent(e1, Job)!;
    job.type = 'pray';

    const ai = world.getComponent(e1, FollowerAI)!;
    ai.state = 'working';

    const startInfluence = cult.getStats().influence;
    cult.update(world, 10);

    expect(cult.getStats().influence).toBeGreaterThan(startInfluence);
  });

  it('should accumulate wealth from working followers', () => {
    const e1 = createFollower(world);
    cult.recruitMember(e1, 0);

    const job = world.getComponent(e1, Job)!;
    job.type = 'cook';

    const ai = world.getComponent(e1, FollowerAI)!;
    ai.state = 'working';

    const startWealth = cult.getStats().wealth;
    cult.update(world, 10);

    expect(cult.getStats().wealth).toBeGreaterThan(startWealth);
  });

  it('should increase notoriety over time', () => {
    const e1 = createFollower(world);
    cult.recruitMember(e1, 0);

    const startNotoriety = cult.getStats().notoriety;
    cult.update(world, 100);

    expect(cult.getStats().notoriety).toBeGreaterThan(startNotoriety);
  });
});

describe('CultManagementSystem — Schedule', () => {
  let cult: CultManagementSystem;

  beforeEach(() => {
    cult = new CultManagementSystem(TEST_LEADER, 42);
  });

  it('should have a default schedule', () => {
    const schedule = cult.getSchedule();
    expect(schedule.blocks.length).toBeGreaterThan(0);
    expect(schedule.blocks[0].type).toBe('sleep');
  });

  it('should return current schedule block', () => {
    // At hour 0, should be sleep
    expect(cult.getCurrentScheduleBlock()).toBe('sleep');
  });

  it('should allow custom schedule', () => {
    const custom: DailySchedule = {
      blocks: [
        { hour: 0, type: 'work', duration: 24 },
      ],
    };
    cult.setSchedule(custom);
    expect(cult.getCurrentScheduleBlock()).toBe('work');
  });
});

describe('CultManagementSystem — Tech Tree', () => {
  let cult: CultManagementSystem;

  beforeEach(() => {
    cult = new CultManagementSystem(TEST_LEADER, 42);
  });

  it('should list tech tree', () => {
    const tech = cult.getTechTree();
    expect(tech.length).toBeGreaterThan(0);
    expect(tech[0].name).toBeTruthy();
  });

  it('should unlock tech with enough influence', () => {
    cult.addInfluence(100);
    const success = cult.unlockTech('basic_rituals');
    expect(success).toBe(true);
    expect(cult.getTechTree().find(t => t.id === 'basic_rituals')!.unlocked).toBe(true);
  });

  it('should not unlock tech without enough influence', () => {
    const success = cult.unlockTech('basic_rituals');
    expect(success).toBe(false);
  });

  it('should not unlock already unlocked tech', () => {
    cult.addInfluence(200);
    cult.unlockTech('basic_rituals');
    const success = cult.unlockTech('basic_rituals');
    expect(success).toBe(false);
  });

  it('should increase max population on recruitment_ii', () => {
    cult.addInfluence(100);
    const startMax = cult.getStats().maxPopulation;
    cult.unlockTech('recruitment_ii');
    expect(cult.getStats().maxPopulation).toBe(startMax + 10);
  });
});

describe('CultManagementSystem — Leader', () => {
  let cult: CultManagementSystem;

  beforeEach(() => {
    cult = new CultManagementSystem(TEST_LEADER, 42);
  });

  it('should track leader info', () => {
    const leader = cult.getLeader();
    expect(leader.name).toBe('Chris');
    expect(leader.title).toBe('Founder');
  });

  it('should promote leader', () => {
    cult.promoteLeader('Prophet');
    expect(cult.getLeader().title).toBe('Prophet');
  });
});

describe('CultManagementSystem — Wealth', () => {
  let cult: CultManagementSystem;

  beforeEach(() => {
    cult = new CultManagementSystem(TEST_LEADER, 42);
  });

  it('should add wealth', () => {
    cult.addWealth(50);
    expect(cult.getStats().wealth).toBe(150);
  });

  it('should spend wealth', () => {
    const success = cult.spendWealth(50);
    expect(success).toBe(true);
    expect(cult.getStats().wealth).toBe(50);
  });

  it('should not spend more than available', () => {
    const success = cult.spendWealth(200);
    expect(success).toBe(false);
    expect(cult.getStats().wealth).toBe(100);
  });
});