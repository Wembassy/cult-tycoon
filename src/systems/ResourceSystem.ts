import { OnRitual } from '../components/OnRitual';
/**
 * ResourceSystem — Handles resource generation and consumption during gameplay.
 *
 * Followers working at job stations generate resources over time:
 *   pray → faith, cook → food, research → influence, build → materials,
 *   clean → faith (small), haul → materials (small)
 *
 * Resources are consumed:
 *   food — per follower per tick (eating)
 *   funds — per follower per tick (upkeep)
 *
 * Emits events for resource milestones and shortages via callback / console.log.
 */

import type { World } from '../ecs/World';
import { System } from '../ecs/System';
import { GameState } from '../game/GameState';
import { Job } from '../components/Job';
import { FollowerAI } from '../components/FollowerAI';
import { OnMission } from '../components/OnMission';
import { Skills } from '../components/Skills';
import { Traits, TraitType } from '../components/Traits';

export interface ResourceEvent {
  type: 'milestone' | 'shortage' | 'surplus';
  resource: keyof GameState['resources'];
  value: number;
  message: string;
}

export type ResourceEventCallback = (event: ResourceEvent) => void;

export interface ResourceConfig {
  // Generation rates per skill level per second
  prayFaithRate: number;
  cookFoodRate: number;
  researchInfluenceRate: number;
  buildMaterialsRate: number;
  cleanFaithRate: number;
  haulMaterialsRate: number;
  // Consumption rates per follower per second
  foodConsumptionPerFollower: number;
  fundsUpkeepPerFollower: number;
  // Notoriety slowly grows with population
  notorietyGrowthRate: number;
  // Thresholds
  shortageThresholds: Partial<Record<keyof GameState['resources'], number>>;
  milestoneIntervals: Partial<Record<keyof GameState['resources'], number>>;
}

const DEFAULT_CONFIG: ResourceConfig = {
  prayFaithRate: 0.5,
  cookFoodRate: 0.6,
  researchInfluenceRate: 0.3,
  buildMaterialsRate: 0.2,
  cleanFaithRate: 0.1,
  haulMaterialsRate: 0.15,
  foodConsumptionPerFollower: 0.08,
  fundsUpkeepPerFollower: 0.02,
  notorietyGrowthRate: 0.0014,
  shortageThresholds: {
    food: 10,
    funds: 10,
    faith: 10,
    materials: 5,
    influence: 0,
  },
  milestoneIntervals: {
    faith: 100,
    funds: 200,
    materials: 50,
    food: 100,
    influence: 50,
  },
};

// Trait-based generation multipliers
const TRAIT_GEN_MULT: Partial<Record<TraitType, Partial<Record<string, number>>>> = {
  zealous: { prayFaithRate: 1.5 },
  scholar: { researchInfluenceRate: 1.4 },
  lazy: { prayFaithRate: 0.7, cookFoodRate: 0.7, buildMaterialsRate: 0.7 },
  hardy: { buildMaterialsRate: 1.3, haulMaterialsRate: 1.3 },
  charismatic: { researchInfluenceRate: 1.2 },
};

export class ResourceSystem extends System {
  private gameState: GameState;
  private config: ResourceConfig;
  private onEvent: ResourceEventCallback | undefined;

  // Track last milestone reached for each resource
  private lastMilestone: Map<keyof GameState['resources'], number> = new Map();
  // Track which shortages are currently active (to avoid spamming)
  private activeShortages: Set<keyof GameState['resources']> = new Set();

  // Net flow tracking (for debugging/UI)
  private lastNetFlow: Partial<Record<keyof GameState['resources'], number>> = {};

  constructor(
    gameState: GameState,
    config?: Partial<ResourceConfig>,
    onEvent?: ResourceEventCallback,
  ) {
    super();
    this.gameState = gameState;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onEvent = onEvent;

    // Initialize milestone tracking
    const resources: (keyof GameState['resources'])[] = [
      'faith',
      'funds',
      'materials',
      'food',
      'influence',
      'notoriety',
    ];
    for (const r of resources) {
      this.lastMilestone.set(r, 0);
    }
  }

  /**
   * Process resource generation and consumption for this tick.
   */
  update(world: World, dt: number): void {
    // Reset net flow for this tick
    this.lastNetFlow = {};

    // Query all followers with Job + FollowerAI
    const followers = world.query([Job, FollowerAI]);

    // --- Resource Generation ---
    let totalFoodGen = 0;
    let totalFaithGen = 0;
    let totalInfluenceGen = 0;
    let totalMaterialsGen = 0;

    for (const entity of followers) {
      if (world.hasComponent(entity, OnMission) || world.hasComponent(entity, OnRitual)) continue;
      const job = world.getComponent(entity, Job)!;
      const ai = world.getComponent(entity, FollowerAI)!;
      const skills = world.getComponent(entity, Skills);
      const traits = world.getComponent(entity, Traits);

      // Only generate when actively working
      if (ai.state !== 'working') continue;

      const mult = this.getTraitMultipliers(traits);

      switch (job.type) {
        case 'pray': {
          const skillLevel = skills?.faith ?? 1;
          const amount = this.config.prayFaithRate * skillLevel * mult.prayFaithRate * dt;
          totalFaithGen += amount;
          break;
        }
        case 'cook': {
          const skillLevel = skills?.cooking ?? 1;
          const amount = this.config.cookFoodRate * skillLevel * mult.cookFoodRate * dt;
          totalFoodGen += amount;
          break;
        }
        case 'research': {
          const skillLevel = skills?.research ?? 1;
          const amount =
            this.config.researchInfluenceRate * skillLevel * mult.researchInfluenceRate * dt;
          totalInfluenceGen += amount;
          break;
        }
        case 'build': {
          const skillLevel = skills?.construction ?? 1;
          const amount = this.config.buildMaterialsRate * skillLevel * mult.buildMaterialsRate * dt;
          totalMaterialsGen += amount;
          break;
        }
        case 'clean': {
          const amount = this.config.cleanFaithRate * mult.cleanFaithRate * dt;
          totalFaithGen += amount;
          break;
        }
        case 'haul': {
          const amount = this.config.haulMaterialsRate * mult.haulMaterialsRate * dt;
          totalMaterialsGen += amount;
          break;
        }
        // 'idle' generates nothing
      }
    }

    // --- Resource Consumption ---
    const followerCount = followers.length;
    const foodConsumed = followerCount * this.config.foodConsumptionPerFollower * dt;
    const fundsUpkeep = followerCount * this.config.fundsUpkeepPerFollower * dt;

    // Notoriety slowly grows with population
    const notorietyGen = followerCount * this.config.notorietyGrowthRate * dt;

    // --- Apply to GameState ---
    const res = this.gameState.resources;

    res.faith += totalFaithGen;
    res.food += totalFoodGen - foodConsumed;
    res.influence += totalInfluenceGen;
    res.materials += totalMaterialsGen;
    res.funds -= fundsUpkeep;
    res.notoriety += notorietyGen;

    // Clamp resources to reasonable bounds
    res.faith = clamp(res.faith, 0, 100000);
    res.funds = clamp(res.funds, -1000, 100000);
    res.materials = clamp(res.materials, 0, 100000);
    res.food = clamp(res.food, 0, 100000);
    res.influence = clamp(res.influence, 0, 100000);
    res.notoriety = clamp(res.notoriety, 0, 100);

    // Track net flow
    this.lastNetFlow = {
      faith: totalFaithGen,
      food: totalFoodGen - foodConsumed,
      influence: totalInfluenceGen,
      materials: totalMaterialsGen,
      funds: -fundsUpkeep,
      notoriety: notorietyGen,
    };

    // --- Event Detection ---
    this.checkMilestones();
    this.checkShortages(followerCount);
  }

  /**
   * Get trait-based multipliers for resource generation.
   */
  private getTraitMultipliers(traits: Traits | undefined): Record<string, number> {
    const result: Record<string, number> = {
      prayFaithRate: 1,
      cookFoodRate: 1,
      researchInfluenceRate: 1,
      buildMaterialsRate: 1,
      cleanFaithRate: 1,
      haulMaterialsRate: 1,
    };

    if (!traits) return result;

    for (const trait of traits.traits) {
      const mods = TRAIT_GEN_MULT[trait];
      if (mods) {
        for (const [key, value] of Object.entries(mods)) {
          const current = result[key] ?? 1;
          result[key] = current * (value as number);
        }
      }
    }

    return result;
  }

  /**
   * Check for resource milestones (e.g. reaching 100 faith, 500 funds).
   */
  private checkMilestones(): void {
    const res = this.gameState.resources;
    const resources: (keyof GameState['resources'])[] = [
      'faith',
      'funds',
      'materials',
      'food',
      'influence',
    ];

    for (const r of resources) {
      const interval = this.config.milestoneIntervals[r];
      if (!interval || interval <= 0) continue;

      const current = res[r];
      const lastMilestone = this.lastMilestone.get(r) ?? 0;
      const newMilestone = Math.floor(current / interval) * interval;

      if (newMilestone > lastMilestone && newMilestone > 0) {
        this.lastMilestone.set(r, newMilestone);
        const event: ResourceEvent = {
          type: 'milestone',
          resource: r,
          value: newMilestone,
          message: `${capitalize(r)} reached ${newMilestone}!`,
        };
        this.emitEvent(event);
      }
    }
  }

  /**
   * Check for resource shortages and emit events.
   */
  private checkShortages(_followerCount: number): void {
    const res = this.gameState.resources;

    for (const [resource, threshold] of Object.entries(this.config.shortageThresholds)) {
      const r = resource as keyof GameState['resources'];
      if (threshold === undefined) continue;

      const isShortage = res[r] <= threshold;

      if (isShortage && !this.activeShortages.has(r)) {
        this.activeShortages.add(r);
        const event: ResourceEvent = {
          type: 'shortage',
          resource: r,
          value: res[r],
          message: `⚠️ ${capitalize(r)} is running low (${Math.floor(res[r])} remaining)!`,
        };
        this.emitEvent(event);
      } else if (!isShortage && this.activeShortages.has(r)) {
        // Resource recovered above threshold
        this.activeShortages.delete(r);
        const event: ResourceEvent = {
          type: 'surplus',
          resource: r,
          value: res[r],
          message: `${capitalize(r)} has recovered to ${Math.floor(res[r])}.`,
        };
        this.emitEvent(event);
      }
    }
  }

  /**
   * Emit a resource event via callback and console.log.
   */
  private emitEvent(event: ResourceEvent): void {
    console.log(`[ResourceSystem] ${event.message}`);
    this.onEvent?.(event);
  }

  /**
   * Get the net resource flow from the last update tick.
   * Positive = gaining, negative = losing.
   */
  getNetFlow(): Partial<Record<keyof GameState['resources'], number>> {
    return { ...this.lastNetFlow };
  }

  /**
   * Get the current config (read-only).
   */
  getConfig(): ResourceConfig {
    return { ...this.config };
  }

  /**
   * Reset milestone and shortage tracking (e.g. on new game).
   */
  reset(): void {
    const resources: (keyof GameState['resources'])[] = [
      'faith',
      'funds',
      'materials',
      'food',
      'influence',
      'notoriety',
    ];
    for (const r of resources) {
      this.lastMilestone.set(r, 0);
    }
    this.activeShortages.clear();
    this.lastNetFlow = {};
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
