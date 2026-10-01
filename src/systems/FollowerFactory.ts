/**
 * FollowerFactory — Creates follower entities with all required components.
 * Generates randomized followers with names, traits, and starting stats.
 */

import { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { Needs } from '../components/Needs';
import { Job } from '../components/Job';
import { Skills } from '../components/Skills';
import { Traits, TraitType, ALL_TRAITS } from '../components/Traits';
import { Health } from '../components/Health';
import { Inventory } from '../components/Inventory';
import { FollowerAI } from '../components/FollowerAI';

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
    world.addComponent(entity, needs);

    // Job — start idle
    const job = new Job(entity);
    job.type = 'idle';
    world.addComponent(entity, job);

    // Skills — randomized starting skills
    const skills = new Skills(entity);
    skills.cooking = 1 + Math.floor(this.rng() * 3);
    skills.research = 1 + Math.floor(this.rng() * 3);
    skills.construction = 1 + Math.floor(this.rng() * 3);
    skills.faith = 2 + Math.floor(this.rng() * 4);
    skills.combat = 1 + Math.floor(this.rng() * 2);
    skills.social = 1 + Math.floor(this.rng() * 4);
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
}