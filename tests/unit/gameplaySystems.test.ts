import { describe, it, expect, beforeEach } from 'vitest';
import { World } from '@ecs/World';
import { Needs } from '@components/Needs';
import { FollowerAI } from '@components/FollowerAI';
import { RitualSystem, RitualResult } from '@systems/RitualSystem';
import { TechTreeSystem } from '@systems/TechTreeSystem';
import { DataManager } from '@data/DataManager';

function createFollower(world: World, faith = 80): number {
  const entity = world.createEntity();
  const needs = new Needs(entity);
  needs.faith = faith;
  world.addComponent(entity, needs);
  world.addComponent(entity, new FollowerAI(entity));
  return entity;
}

describe('RitualSystem', () => {
  let world: World;
  let system: RitualSystem;
  let results: RitualResult[];
  let starts: any[];

  beforeEach(() => {
    world = new World();
    results = [];
    starts = [];
    system = new RitualSystem(
      ['basic_rituals'], // unlock basic rituals tech
      (r) => starts.push(r),
      (r) => results.push(r),
    );
  });

  it('should load rituals from DataManager', () => {
    const rituals = DataManager.getRituals();
    expect(rituals.length).toBe(6);
    expect(rituals[0].id).toBe('morning_prayer');
  });

  it('should check tech requirements', () => {
    const followers = [createFollower(world), createFollower(world)];
    // moonlit_ritual requires advanced_rituals tech which is NOT unlocked
    const check = system.canStartRitual('moonlit_ritual', followers, 100, 100);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('tech');
  });

  it('should check minimum followers', () => {
    const followers = [createFollower(world)]; // only 1
    // morning_prayer requires 1 follower minimum — should pass
    const check = system.canStartRitual('morning_prayer', followers, 100, 100);
    expect(check.ok).toBe(true);
  });

  it('should check faith cost', () => {
    const followers = [createFollower(world), createFollower(world)];
    // offerings costs 10 faith, we have 5
    const check = system.canStartRitual('offerings', followers, 5, 100);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('faith');
  });

  it('should check wealth cost', () => {
    const followers = [createFollower(world), createFollower(world)];
    // offerings costs 20 wealth, we have 10
    const check = system.canStartRitual('offerings', followers, 100, 10);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('wealth');
  });

  it('should start a ritual when conditions are met', () => {
    const followers = [createFollower(world)];
    const ritual = system.startRitual('morning_prayer', followers);
    expect(ritual).not.toBeNull();
    expect(ritual!.name).toBe('Morning Prayer');
    expect(ritual!.participants.length).toBe(1);
    expect(starts.length).toBe(1);
  });

  it('should progress rituals over time', () => {
    const followers = [createFollower(world)];
    const ritual = system.startRitual('morning_prayer', followers)!;
    system.update(world, 30); // 30 ticks
    expect(ritual.progress).toBe(30);
    expect(system.getActiveRituals().length).toBe(1);
  });

  it('should complete rituals and grant rewards', () => {
    const followers = [createFollower(world)];
    const needs = world.getComponent(followers[0], Needs)!;
    needs.faith = 50;
    system.startRitual('morning_prayer', followers);
    // morning_prayer duration is 60
    system.update(world, 60);
    expect(system.getActiveRituals().length).toBe(0);
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    expect(results[0].influenceGain).toBe(5);
    // Faith gain applied to participants
    expect(needs.faith).toBeGreaterThan(50);
  });

  it('should boost participant faith during ritual', () => {
    const followers = [createFollower(world)];
    const needs = world.getComponent(followers[0], Needs)!;
    needs.faith = 50;
    system.startRitual('morning_prayer', followers);
    system.update(world, 10); // 10 ticks
    // Faith should have increased from the per-tick boost
    expect(needs.faith).toBeGreaterThan(50);
  });

  it('should get available rituals based on tech', () => {
    // With basic_rituals unlocked, morning_prayer and offerings should be available
    const available = system.getAvailableRituals();
    const ids = available.map(r => r.id);
    expect(ids).toContain('morning_prayer');
    expect(ids).toContain('offerings');
    // moonlit_ritual requires advanced_rituals which is NOT unlocked
    expect(ids).not.toContain('moonlit_ritual');
  });

  it('should unlock new rituals when tech is unlocked', () => {
    system.unlockTech('advanced_rituals');
    const available = system.getAvailableRituals();
    const ids = available.map(r => r.id);
    expect(ids).toContain('moonlit_ritual');
  });

  it('should track ritual progress as 0-1', () => {
    const followers = [createFollower(world)];
    const ritual = system.startRitual('morning_prayer', followers)!;
    system.update(world, 30);
    const progress = system.getRitualProgress(ritual.id);
    expect(progress).toBeCloseTo(0.5, 1);
  });
});

describe('TechTreeSystem', () => {
  let system: TechTreeSystem;
  let unlocked: any[];

  beforeEach(() => {
    unlocked = [];
    system = new TechTreeSystem((node) => unlocked.push(node));
  });

  it('should load tech nodes from DataManager', () => {
    const nodes = system.getNodes();
    expect(nodes.length).toBe(10);
    expect(nodes[0].id).toBeTruthy();
    expect(nodes[0].cost).toBeGreaterThan(0);
  });

  it('should have tier 1 nodes available by default', () => {
    const available = system.getAvailable();
    const tier1 = available.filter(n => n.tier === 1);
    expect(tier1.length).toBeGreaterThan(0);
  });

  it('should not have tier 2+ nodes available without prerequisites', () => {
    const available = system.getAvailable();
    const tier2 = available.filter(n => n.tier === 2 && n.requires);
    expect(tier2.length).toBe(0);
  });

  it('should unlock a node with enough influence', () => {
    const result = system.unlock('basic_rituals', 100);
    expect(result.success).toBe(true);
    expect(system.isUnlocked('basic_rituals')).toBe(true);
    expect(unlocked.length).toBe(1);
  });

  it('should fail to unlock without enough influence', () => {
    const result = system.unlock('basic_rituals', 10);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('influence');
  });

  it('should fail to unlock already unlocked node', () => {
    system.unlock('basic_rituals', 100);
    const result = system.unlock('basic_rituals', 100);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('Already');
  });

  it('should make dependent nodes available after unlocking prerequisite', () => {
    // advanced_rituals requires basic_rituals
    expect(system.isUnlocked('advanced_rituals')).toBe(false);
    const beforeAvailable = system.getAvailable().find(n => n.id === 'advanced_rituals');
    expect(beforeAvailable).toBeUndefined();
    system.unlock('basic_rituals', 100);
    const afterAvailable = system.getAvailable().find(n => n.id === 'advanced_rituals');
    expect(afterAvailable).toBeDefined();
  });

  it('should get unlocked content ids', () => {
    system.unlock('basic_rituals', 100);
    const content = system.getUnlockedContent();
    expect(content).toContain('morning_prayer');
    expect(content).toContain('offerings');
  });

  it('should calculate effect multipliers', () => {
    // No unlocks yet — multiplier is 1
    expect(system.getEffectMultiplier('skillGainMult')).toBe(1);
    // Unlock follower_education (skillGainMult: 2.0)
    system.unlock('follower_education', 200);
    expect(system.getEffectMultiplier('skillGainMult')).toBe(2);
  });

  it('should calculate effect bonuses', () => {
    expect(system.getEffectBonus('maxPopulationBonus')).toBe(0);
    system.unlock('recruitment_ii', 100);
    expect(system.getEffectBonus('maxPopulationBonus')).toBe(10);
  });
});