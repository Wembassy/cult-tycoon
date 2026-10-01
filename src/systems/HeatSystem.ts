/**
 * HeatSystem — Tracks heat accumulation and triggers consequences.
 *
 * Heat is the game's "threat" metric, derived from notoriety in CultManagementSystem
 * plus discrete events (dismissing followers, object acquisition missions, etc.).
 *
 * Thresholds:
 *   Heat >= 50  → Protesters gather outside compound (warning event)
 *   Heat >= 100 → Police raid: arrest 1-3 cultists, confiscate funds
 *   Heat >= 300 → Game-ending raid (lose condition)
 *
 * Heat can be reduced via propaganda (Ministry of Truth) and heat-reduction missions.
 */

import {
  HEAT_EVENT_TEMPLATES,
  formatHeatMessage,
  HeatEventType,
  HeatEventTemplate,
} from '../data/HeatEvents';
import { LoseReason } from './CultManagementSystem';

export interface HeatEvent {
  type: HeatEventType;
  title: string;
  message: string;
  severity: HeatEventTemplate['severity'];
  heat: number;
  day: number;
}

export type HeatEventCallback = (event: HeatEvent) => void;

export interface HeatSystemConfig {
  /** Heat per dismissed follower */
  readonly DISMISS_HEAT: number;
  /** Heat per object acquisition mission */
  readonly MISSION_HEAT: number;
  /** Threshold for protesters */
  readonly PROTEST_THRESHOLD: number;
  /** Threshold for police raid */
  readonly RAID_THRESHOLD: number;
  /** Threshold for game-ending raid */
  readonly GAME_OVER_THRESHOLD: number;
  /** Min funds confiscated during a raid */
  readonly RAID_MIN_FUNDS: number;
  /** Max funds confiscated during a raid */
  readonly RAID_MAX_FUNDS: number;
  /** Min cultists arrested during a raid */
  readonly RAID_MIN_ARRESTS: number;
  /** Max cultists arrested during a raid */
  readonly RAID_MAX_ARRESTS: number;
}

export const HEAT_CONFIG = {
  DISMISS_HEAT: 15,
  MISSION_HEAT: 5,
  PROTEST_THRESHOLD: 50,
  RAID_THRESHOLD: 100,
  GAME_OVER_THRESHOLD: 300,
  RAID_MIN_FUNDS: 20,
  RAID_MAX_FUNDS: 100,
  RAID_MIN_ARRESTS: 1,
  RAID_MAX_ARRESTS: 3,
} as const;

/**
 * Result of a police raid.
 */
export interface RaidResult {
  arrestedEntityIds: number[];
  fundsConfiscated: number;
}

export class HeatSystem {
  private heat = 0;
  private dayCount = 1;
  private rng: () => number;
  private onEvent?: HeatEventCallback;
  private onLose?: (reason: LoseReason) => void;

  // Track which thresholds have already been triggered (to avoid re-triggering)
  private protestTriggered = false;
  private raidCooldown = 0; // seconds until next raid can occur

  constructor(
    onEvent?: HeatEventCallback,
    onLose?: (reason: LoseReason) => void,
    seed: number = Date.now(),
  ) {
    this.onEvent = onEvent;
    this.onLose = onLose;
    let state = seed;
    this.rng = () => {
      state = (state * 1664525 + 1013904223) | 0;
      return ((state >>> 0) % 10000) / 10000;
    };
  }

  /**
   * Get the current heat level.
   */
  getHeat(): number {
    return this.heat;
  }

  /**
   * Set the heat level directly (used when syncing from notoriety).
   */
  setHeat(amount: number): void {
    this.heat = Math.max(0, amount);
  }

  /**
   * Add heat and check thresholds.
   */
  addHeat(amount: number, reason: string): void {
    this.heat = Math.max(0, this.heat + amount);

    // Emit heat_added event
    this.emitEvent('heat_added', { reason, heat: Math.floor(this.heat) });

    // Check thresholds
    this.checkThresholds();
  }

  /**
   * Reduce heat (from propaganda, missions, etc.).
   */
  reduceHeat(amount: number): void {
    const actualReduction = Math.min(amount, this.heat);
    this.heat = Math.max(0, this.heat - amount);

    // Emit heat_reduced event
    this.emitEvent('heat_reduced', { amount: Math.floor(actualReduction) });

    // Reset protest flag if heat drops below threshold
    if (this.heat < HEAT_CONFIG.PROTEST_THRESHOLD) {
      this.protestTriggered = false;
    }
  }

  /**
   * Sync heat with notoriety from CultManagementSystem.
   * Notoriety is the passive heat component; discrete events add on top.
   * This method sets the base heat to the notoriety value.
   */
  syncNotoriety(notoriety: number): void {
    // Notoriety contributes to heat as a base
    // If notoriety is higher than current heat, heat rises to meet it
    if (notoriety > this.heat) {
      this.heat = notoriety;
    }
  }

  /**
   * Check threshold triggers and fire appropriate events.
   */
  private checkThresholds(): void {
    // Protest threshold
    if (this.heat >= HEAT_CONFIG.PROTEST_THRESHOLD && !this.protestTriggered) {
      this.protestTriggered = true;
      this.emitEvent('protest', {});
    }

    // Game-ending raid threshold
    if (this.heat >= HEAT_CONFIG.GAME_OVER_THRESHOLD) {
      this.emitEvent('game_over_raid', {});
      this.onLose?.('busted');
      return;
    }

    // Police raid threshold (with cooldown)
    if (this.heat >= HEAT_CONFIG.RAID_THRESHOLD && this.raidCooldown <= 0) {
      // The actual raid is executed via executeRaid() called by CultManagementSystem
      // Here we just emit the event signal
    }
  }

  /**
   * Execute a police raid: arrest cultists and confiscate funds.
   * Called by CultManagementSystem when heat >= RAID_THRESHOLD.
   * Returns the list of arrested entity IDs and funds confiscated.
   */
  executeRaid(roster: number[], currentWealth: number): RaidResult {
    // Determine number of arrests (1-3)
    const arrestCount = Math.min(
      roster.length,
      HEAT_CONFIG.RAID_MIN_ARRESTS +
        Math.floor(this.rng() * (HEAT_CONFIG.RAID_MAX_ARRESTS - HEAT_CONFIG.RAID_MIN_ARRESTS + 1)),
    );

    // Pick random cultists to arrest
    const shuffled = [...roster].sort(() => this.rng() - 0.5);
    const arrested = shuffled.slice(0, arrestCount);

    // Confiscate funds
    const fundsConfiscated = Math.min(
      currentWealth,
      HEAT_CONFIG.RAID_MIN_FUNDS +
        Math.floor(this.rng() * (HEAT_CONFIG.RAID_MAX_FUNDS - HEAT_CONFIG.RAID_MIN_FUNDS + 1)),
    );

    // Set raid cooldown (60-120 seconds before another raid)
    this.raidCooldown = 60 + this.rng() * 60;

    // Emit raid event
    this.emitEvent('police_raid', {
      arrestedCount: arrestCount,
      fundsConfiscated,
    });

    // Reduce heat slightly after a raid (the raid vents some pressure)
    this.heat = Math.max(0, this.heat - 20);

    return { arrestedEntityIds: arrested, fundsConfiscated };
  }

  /**
   * Update the heat system each tick.
   * Handles raid cooldown decrement and threshold checks.
   */
  update(dt: number): void {
    if (this.raidCooldown > 0) {
      this.raidCooldown -= dt;
    }
  }

  /**
   * Advance the day counter.
   */
  advanceDay(): void {
    this.dayCount++;
  }

  /**
   * Get current raid cooldown (for UI/debugging).
   */
  getRaidCooldown(): number {
    return Math.max(0, this.raidCooldown);
  }

  /**
   * Check if a raid is available (heat high enough and cooldown expired).
   */
  isRaidReady(): boolean {
    return this.heat >= HEAT_CONFIG.RAID_THRESHOLD && this.raidCooldown <= 0;
  }

  /**
   * Reset the heat system (for new game).
   */
  reset(): void {
    this.heat = 0;
    this.dayCount = 1;
    this.protestTriggered = false;
    this.raidCooldown = 0;
  }

  /**
   * Emit a heat event to the callback.
   */
  private emitEvent(type: HeatEventType, params: Record<string, string | number>): void {
    if (!this.onEvent) return;

    const template = HEAT_EVENT_TEMPLATES[type];
    const message = formatHeatMessage(template.message, params);

    this.onEvent({
      type,
      title: template.title,
      message,
      severity: template.severity,
      heat: Math.floor(this.heat),
      day: this.dayCount,
    });
  }
}