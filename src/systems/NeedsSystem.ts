/**
 * NeedsSystem — Decays follower needs over time and triggers state changes.
 * Processes: hunger, faith, fun, sanity. Health is managed by HealthSystem.
 */

import type { World } from '../ecs/World';
import { Needs } from '../components/Needs';
import { FollowerAI } from '../components/FollowerAI';
import { Traits, TraitType } from '../components/Traits';
import { Prestige } from '../components/Prestige';
import type { QualityTier } from '../components/CultistTier';

/** Maps cultist quality tier → expected prestige level. */
const TIER_EXPECTED_PRESTIGE: Record<QualityTier, number> = {
  very_poor: 1,
  poor: 2,
  average: 3,
  good: 4,
  very_good: 5,
  incredible: 6,
};

export interface NeedsConfig {
  hungerDecay: number;   // per tick
  faithDecay: number;
  funDecay: number;
  sanityDecay: number;
  energyDecay: number;   // per tick (restored by sleep)
  bladderDecay: number;  // per tick (restored by bathroom)
  hygieneDecay: number;  // per tick (restored by shower)
  comfortDecay: number;
  socialDecay: number;
}

const DEFAULT_CONFIG: NeedsConfig = {
  hungerDecay: 0.12,
  faithDecay: 0.064,
  funDecay: 0.08,
  sanityDecay: 0.04,
  energyDecay: 0.096,
  bladderDecay: 0.16,
  hygieneDecay: 0.064,
  comfortDecay: 0.035,
  socialDecay: 0.05,
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
      needs.comfort = clamp(needs.comfort - mult.comfortDecay * dt, 0, 100);
      needs.social = clamp(needs.social - mult.socialDecay * dt, 0, 100);

      // Apply prestige mood modifiers if the cultist is in a room with Prestige
      if (ai.roomEntityId >= 0) {
        const prestige = world.getComponent(ai.roomEntityId, Prestige);
        if (prestige) {
          const expected = TIER_EXPECTED_PRESTIGE[ai.tier] ?? 1;
          if (prestige.level < expected) {
            const deficit = expected - prestige.level;
            needs.fun = clamp(needs.fun - 0.1 * deficit * dt, 0, 100);
            needs.sanity = clamp(needs.sanity - 0.1 * deficit * dt, 0, 100);
          } else if (prestige.level > expected) {
            const surplus = prestige.level - expected;
            needs.fun = clamp(needs.fun + 0.05 * surplus * dt, 0, 100);
          }
        }
      }

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