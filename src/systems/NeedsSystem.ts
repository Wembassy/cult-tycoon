/**
 * NeedsSystem — Decays follower needs over time and triggers state changes.
 * Processes: hunger, faith, fun, sanity. Health is managed by HealthSystem.
 */

import type { World } from '../ecs/World';
import { Needs } from '../components/Needs';
import { FollowerAI } from '../components/FollowerAI';
import { Traits, TraitType } from '../components/Traits';

export interface NeedsConfig {
  hungerDecay: number;   // per tick
  faithDecay: number;
  funDecay: number;
  sanityDecay: number;
  energyDecay: number;   // per tick (restored by sleep)
  bladderDecay: number;  // per tick (restored by bathroom)
  hygieneDecay: number;  // per tick (restored by shower)
}

const DEFAULT_CONFIG: NeedsConfig = {
  hungerDecay: 0.15,
  faithDecay: 0.08,
  funDecay: 0.10,
  sanityDecay: 0.05,
  energyDecay: 0.12,
  bladderDecay: 0.20,
  hygieneDecay: 0.08,
};

const TRAIT_MULT: Partial<Record<TraitType, Partial<Record<keyof NeedsConfig, number>>>> = {
  lazy: { hungerDecay: 1.3, funDecay: 0.7, energyDecay: 1.5 },
  zealous: { faithDecay: 0.5 },
  doubter: { faithDecay: 1.5 },
  hardy: { hungerDecay: 0.75, sanityDecay: 0.8, hygieneDecay: 0.7 },
  fragile: { sanityDecay: 1.5, hungerDecay: 1.2, bladderDecay: 1.3 },
  insomniac: { sanityDecay: 1.3, energyDecay: 1.8 },
  devoted: { faithDecay: 0.7 },
};

export class NeedsSystem {
  private config: NeedsConfig;

  constructor(config: Partial<NeedsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run needs decay for all followers with Needs + FollowerAI components.
   * Returns the number of followers that crossed a critical threshold.
   */
  update(world: World, dt: number): number {
    const entities = world.query([Needs, FollowerAI]);
    let critical = 0;

    for (const entity of entities) {
      const needs = world.getComponent(entity, Needs)!;
      const ai = world.getComponent(entity, FollowerAI)!;
      const traits = world.getComponent(entity, Traits);

      // Apply trait modifiers
      const mult = this.getTraitMultipliers(traits);

      needs.hunger = clamp(needs.hunger - mult.hungerDecay * dt, 0, 100);
      needs.faith = clamp(needs.faith - mult.faithDecay * dt, 0, 100);
      needs.fun = clamp(needs.fun - mult.funDecay * dt, 0, 100);
      needs.sanity = clamp(needs.sanity - mult.sanityDecay * dt, 0, 100);
      needs.energy = clamp(needs.energy - mult.energyDecay * dt, 0, 100);
      needs.bladder = clamp(needs.bladder - mult.bladderDecay * dt, 0, 100);
      needs.hygiene = clamp(needs.hygiene - mult.hygieneDecay * dt, 0, 100);

      // Trigger state changes on critical needs
      if (needs.hunger < 20 && ai.state !== 'needs') {
        ai.state = 'needs';
        ai.stateTimer = 0;
        critical++;
      } else if (needs.faith < 20 && ai.state !== 'needs') {
        ai.state = 'needs';
        ai.stateTimer = 0;
        critical++;
      } else if (needs.sanity < 15 && ai.state !== 'needs') {
        ai.state = 'needs';
        ai.stateTimer = 0;
        critical++;
      } else if (needs.energy < 15 && ai.state !== 'needs') {
        ai.state = 'needs';
        ai.stateTimer = 0;
        critical++;
      } else if (needs.bladder < 15 && ai.state !== 'needs') {
        ai.state = 'needs';
        ai.stateTimer = 0;
        critical++;
      } else if (needs.hygiene < 15 && ai.state !== 'needs') {
        ai.state = 'needs';
        ai.stateTimer = 0;
        critical++;
      }
    }

    return critical;
  }

  private getTraitMultipliers(traits: Traits | undefined): NeedsConfig {
    const result = { ...this.config };
    if (!traits) return result;

    for (const trait of traits.traits) {
      const mods = TRAIT_MULT[trait];
      if (mods) {
        for (const [key, value] of Object.entries(mods)) {
          (result as any)[key] *= value;
        }
      }
    }

    return result;
  }

  getConfig(): NeedsConfig {
    return { ...this.config };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}