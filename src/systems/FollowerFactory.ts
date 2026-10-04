/**
 * FollowerFactory — Creates follower entities with all required components.
 * Generates randomized followers with names, traits, and starting stats.
 */

import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { Needs } from '../components/Needs';
import { Job } from '../components/Job';
import { Skills, SKILL_KEYS, type PassionLevel } from '../components/Skills';
import { Traits, TraitType, ALL_TRAITS } from '../components/Traits';
import { Health } from '../components/Health';
import { Inventory } from '../components/Inventory';
import { FollowerAI } from '../components/FollowerAI';
import { QualityTier, ALL_TIERS, TIER_SKILL_RANGE } from '../components/CultistTier';
import { WorkPreferences } from '../components/WorkPreferences';

const NAMES = [
  'Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Henry',
  'Iris', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olive', 'Pete',
  'Quinn', 'Ruby', 'Sam', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xavier',
  'Yara', 'Zane', 'Belle', 'Cole', 'Dora', 'Eli', 'Faye', 'Gus',
];

const ALL_TRAIT_IDS: TraitType[] = ALL_TRAITS;

export interface FollowerSpawnConfig {
  x: number;
  y: number;
  name?: string;
  traits?: TraitType[];
  seed?: number;
  prLevel?: number; // 0-100, higher = better quality recruits
}

export interface Follower {
  entityId: number;
  name: string;
}

export class FollowerFactory {
  private rng: () => number;
  private nameIdx = 0;

  constructor(seed: number = Date.now()) {
    let state = seed;
    this.rng = () => {
      state = (state * 1664525 + 1013904223) | 0;
      return ((state >>> 0) % 10000) / 10000;
    };
  }

  /**
   * Create a follower entity in the world
   */
  spawn(world: World, config: FollowerSpawnConfig): Follower {
    const entity = world.createEntity();

    // Transform — position in the world
    const transform = new Transform(entity);
    transform.x = config.x;
    transform.y = config.y;
    world.addComponent(entity, transform);

    // Renderable — mesh reference
    const renderable = new Renderable(entity);
    renderable.meshId = 'follower_basic';
    world.addComponent(entity, renderable);

    // Needs — start at full
    const needs = new Needs(entity);
    needs.hunger = 80 + this.rng() * 20;
    needs.faith = 70 + this.rng() * 30;
    needs.fun = 75 + this.rng() * 25;
    needs.health = 100;
    needs.sanity = 85 + this.rng() * 15;
    needs.energy = 85 + this.rng() * 15;
    needs.bladder = 80 + this.rng() * 20;
    needs.hygiene = 85 + this.rng() * 15;
    needs.comfort = 80 + this.rng() * 20;
    needs.social = 75 + this.rng() * 25;
    world.addComponent(entity, needs);

    // Job — start idle
    const job = new Job(entity);
    job.type = 'idle';
    world.addComponent(entity, job);

    // Work preferences — generalist by default; player can specialize later.
    world.addComponent(entity, new WorkPreferences(entity));

    // Skills — randomized starting skills based on tier
    const prLevel = config.prLevel ?? 0;
    const tier = this.generateTier(prLevel);
    const [minSkill, maxSkill] = TIER_SKILL_RANGE[tier];
    const skillRoll = () => minSkill + Math.floor(this.rng() * (maxSkill - minSkill + 1));
    const skills = new Skills(entity);
    skills.cooking = skillRoll();
    skills.research = skillRoll();
    skills.construction = skillRoll();
    skills.growing = skillRoll();
    skills.faith = skillRoll();
    skills.combat = skillRoll();
    skills.social = skillRoll();

    // Passions are sparse by design: most followers have 1-3 interests.
    const passionCount = 1 + Math.floor(this.rng() * 3);
    const shuffledSkills = [...SKILL_KEYS].sort(() => this.rng() - 0.5);
    for (let i = 0; i < passionCount; i++) {
      const skill = shuffledSkills[i];
      const level: PassionLevel = this.rng() < 0.28 ? 'major' : 'minor';
      skills.passions[skill] = level;
    }

    world.addComponent(entity, skills);

    // Traits — 1-3 random traits
    const traits = new Traits(entity);
    if (config.traits) {
      traits.traits = config.traits;
    } else {
      const numTraits = 1 + Math.floor(this.rng() * 2); // 1-2 traits
      const shuffled = [...ALL_TRAIT_IDS].sort(() => this.rng() - 0.5);
      traits.traits = shuffled.slice(0, numTraits);
    }
    world.addComponent(entity, traits);

    // Health
    const health = new Health(entity);
    health.hp = 100;
    health.maxHp = 100;
    world.addComponent(entity, health);

    // Inventory
    const inventory = new Inventory(entity);
    inventory.capacity = 10;
    world.addComponent(entity, inventory);

    // FollowerAI — start idle
    const ai = new FollowerAI(entity);
    ai.state = 'idle';
    ai.tier = tier;
    world.addComponent(entity, ai);

    const name = config.name ?? NAMES[this.nameIdx++ % NAMES.length];

    return { entityId: entity, name };
  }

  /**
   * Spawn multiple followers at once
   */
  spawnGroup(world: World, count: number, startX: number, startY: number): Follower[] {
    const followers: Follower[] = [];
    for (let i = 0; i < count; i++) {
      const x = startX + (i % 4) * 2;
      const y = startY + Math.floor(i / 4) * 2;
      followers.push(this.spawn(world, { x, y }));
    }
    return followers;
  }

  /**
   * Generate a quality tier based on the cult's PR level (0-100).
   * Higher PR = better quality recruits.
   * Returns a weighted random tier.
   */
  generateTier(prLevel: number): QualityTier {
    // Weighted distribution: each tier gets a weight based on PR level.
    // At PR 0: mostly very_poor/poor
    // At PR 50: mostly average/good
    // At PR 100: mostly good/very_good/incredible
    const clampedPr = Math.max(0, Math.min(100, prLevel));

    // Center index shifts from 0 (very_poor) to 5 (incredible) as PR goes 0→100
    const center = (clampedPr / 100) * (ALL_TIERS.length - 1);

    const weights = ALL_TIERS.map((_, i) => {
      const distance = Math.abs(i - center);
      // Gaussian-like falloff
      return Math.exp(-(distance * distance) / 2);
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = this.rng() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return ALL_TIERS[i];
    }
    return ALL_TIERS[0];
  }
}