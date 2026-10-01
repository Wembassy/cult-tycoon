/**
 * CombatSystem — Handles combat between investigators and followers.
 *
 * When investigators reach the cult base and are adjacent to followers,
 * combat occurs automatically. Damage is calculated based on the ratio of
 * follower count to investigator count, modified by notoriety level.
 *
 * Combat resolution: when a side's average health drops below a retreat
 * threshold, they retreat/flee. Investigators retreat back to the map edge;
 * followers who drop below 0 health are removed.
 *
 * Events are logged via console.log for the HUD to pick up.
 */

import type { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { Needs } from '../components/Needs';
import { FollowerAI } from '../components/FollowerAI';
import { Health } from '../components/Health';
import type { InvestigatorSystem, Investigator } from './InvestigatorSystem';

/** Configuration for combat tuning. */
export interface CombatConfig {
  /** Distance (in tiles) within which combat triggers. */
  engagementRange: number;
  /** Base damage per second dealt by each follower. */
  followerDps: number;
  /** Base damage per second dealt by each investigator. */
  investigatorDps: number;
  /** Health fraction below which investigators retreat. */
  investigatorRetreatThreshold: number;
  /** Health fraction below which followers flee from combat. */
  followerRetreatThreshold: number;
  /** Notoriety bonus to investigator damage (0..1 scaled). */
  notorietyDamageBonus: number;
}

const DEFAULT_CONFIG: CombatConfig = {
  engagementRange: 1.5,
  followerDps: 8,
  investigatorDps: 10,
  investigatorRetreatThreshold: 20,
  followerRetreatThreshold: 15,
  notorietyDamageBonus: 0.5,
};

export class CombatSystem {
  private investigatorSystem: InvestigatorSystem;
  private notoriety = 0;
  private config: CombatConfig;
  private activeEngagements: Map<string, CombatEngagement> = new Map();
  private rng: () => number;

  constructor(
    investigatorSystem: InvestigatorSystem,
    config: Partial<CombatConfig> = {},
    seed: number = Date.now(),
  ) {
    this.investigatorSystem = investigatorSystem;
    this.config = { ...DEFAULT_CONFIG, ...config };
    let state = seed;
    this.rng = () => {
      state = (state * 1664525 + 1013904223) | 0;
      return ((state >>> 0) % 10000) / 10000;
    };
  }

  /**
   * Set the current notoriety level (called from the game loop).
   */
  setNotoriety(notoriety: number): void {
    this.notoriety = notoriety;
  }

  /**
   * Process combat each tick.
   */
  update(world: World, dt: number): void {
    const investigators = this.investigatorSystem.getActiveInvestigators();
    if (investigators.length === 0) {
      // No investigators — clean up any stale engagements
      this.activeEngagements.clear();
      return;
    }

    // Only investigators in 'inspecting' or 'moving_to_base' states fight
    const combatInvestigators = investigators.filter(
      inv => inv.state === 'inspecting' || inv.state === 'moving_to_base',
    );

    if (combatInvestigators.length === 0) {
      this.activeEngagements.clear();
      return;
    }

    // Gather all followers with combat-relevant components
    const followerEntities = world.query([Transform, Needs, FollowerAI]);
    if (followerEntities.length === 0) {
      this.activeEngagements.clear();
      return;
    }

    // Process each investigator's combat
    for (const inv of combatInvestigators) {
      const invTransform = world.getComponent(inv.entity, Transform);
      if (!invTransform) continue;

      // Find followers within engagement range
      const nearbyFollowers: number[] = [];
      for (const fEntity of followerEntities) {
        const fTransform = world.getComponent(fEntity, Transform)!;
        const dx = fTransform.x - invTransform.x;
        const dy = fTransform.y - invTransform.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= this.config.engagementRange) {
          nearbyFollowers.push(fEntity);
        }
      }

      if (nearbyFollowers.length === 0) continue;

      // Create or update engagement
      const engagementId = `eng_${inv.id}`;
      let engagement = this.activeEngagements.get(engagementId);
      if (!engagement) {
        engagement = {
          investigatorId: inv.id,
          investigatorEntity: inv.entity,
          followerEntities: nearbyFollowers,
          startTime: 0,
        };
        this.activeEngagements.set(engagementId, engagement);
        console.log(`[Combat] Investigator ${inv.id} engaged with ${nearbyFollowers.length} follower(s)`);
      } else {
        // Update nearby followers list
        engagement.followerEntities = nearbyFollowers;
      }
      engagement.startTime += dt;

      // Calculate force ratios
      const followerCount = nearbyFollowers.length;
      const investigatorCount = combatInvestigators.length;

      // Damage calculation
      // Followers deal damage scaled by their count advantage
      // Investigators deal damage scaled by notoriety (higher notoriety = more prepared/armed)
      const notorietyMult = 1 + (this.notoriety / 100) * this.config.notorietyDamageBonus;
      // Random variance ±15% per tick (uses seeded rng for deterministic combats)
      const variance = 0.85 + this.rng() * 0.3;
      const followerDamagePerSecond =
        this.config.followerDps * followerCount * (followerCount / Math.max(investigatorCount, 1)) * variance;
      const investigatorDamagePerSecond =
        this.config.investigatorDps * investigatorCount * notorietyMult * variance;

      // Apply damage to investigator (tracked in a separate map since investigators
      // don't have a Health component by default)
      const invHealth = this.getOrCreateInvestigatorHealth(inv);
      invHealth.hp = Math.max(0, invHealth.hp - (followerDamagePerSecond * dt));

      // Apply damage to each nearby follower
      const damagePerFollower = (investigatorDamagePerSecond * dt) / Math.max(followerCount, 1);
      for (const fEntity of nearbyFollowers) {
        const needs = world.getComponent(fEntity, Needs);
        const health = world.getComponent(fEntity, Health);
        if (needs) {
          needs.health = Math.max(0, needs.health - damagePerFollower);
        }
        if (health) {
          health.hp = Math.max(0, health.hp - damagePerFollower);
          if (health.hp <= 0) {
            // Mark follower as dead
            const ai = world.getComponent(fEntity, FollowerAI);
            if (ai) {
              ai.state = 'stuck'; // Use 'stuck' as "downed" state
            }
            console.log(`[Combat] Follower ${fEntity} downed in combat with ${inv.id}`);
          }
        }
      }

      // Check retreat conditions
      // Investigators retreat if their health drops below threshold
      if (invHealth.hp <= this.config.investigatorRetreatThreshold) {
        console.log(`[Combat] Investigator ${inv.id} retreating! Health: ${invHealth.hp.toFixed(1)}`);
        // Force the investigator to leave
        inv.state = 'leaving';
        this.activeEngagements.delete(engagementId);
        continue;
      }

      // Followers retreat if average health drops below threshold
      let avgHealth = 0;
      let aliveCount = 0;
      for (const fEntity of nearbyFollowers) {
        const needs = world.getComponent(fEntity, Needs);
        if (needs && needs.health > 0) {
          avgHealth += needs.health;
          aliveCount++;
        }
      }
      if (aliveCount > 0) {
        avgHealth /= aliveCount;
        if (avgHealth <= this.config.followerRetreatThreshold) {
          console.log(`[Combat] Followers retreating from ${inv.id}! Avg health: ${avgHealth.toFixed(1)}`);
          // Set followers to 'needs' state so they try to recover
          for (const fEntity of nearbyFollowers) {
            const ai = world.getComponent(fEntity, FollowerAI);
            const needs = world.getComponent(fEntity, Needs);
            if (ai && needs && needs.health > 0) {
              ai.state = 'needs';
              ai.stateTimer = 0;
            }
          }
          this.activeEngagements.delete(engagementId);
        }
      }
    }

    // Clean up engagements for investigators no longer active
    for (const [id, eng] of this.activeEngagements) {
      const stillActive = combatInvestigators.some(inv => inv.id === eng.investigatorId);
      if (!stillActive) {
        this.activeEngagements.delete(id);
      }
    }
  }

  /**
   * Track investigator health (they don't have a Health component by default).
   */
  private investigatorHealth: Map<string, { hp: number; maxHp: number }> = new Map();

  private getOrCreateInvestigatorHealth(inv: Investigator): { hp: number; maxHp: number } {
    let health = this.investigatorHealth.get(inv.id);
    if (!health) {
      health = { hp: 100, maxHp: 100 };
      this.investigatorHealth.set(inv.id, health);
    }
    return health;
  }

  /**
   * Get active combat engagements.
   */
  getActiveEngagements(): CombatEngagement[] {
    return Array.from(this.activeEngagements.values());
  }

  /**
   * Reset the system (for new game).
   */
  reset(): void {
    this.activeEngagements.clear();
    this.investigatorHealth.clear();
    this.notoriety = 0;
  }
}

export interface CombatEngagement {
  investigatorId: string;
  investigatorEntity: number;
  followerEntities: number[];
  startTime: number;
}