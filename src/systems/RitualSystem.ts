/**
 * RitualSystem — Manages ritual activation, progress, and rewards.
 * Reads ritual definitions from data/rituals.json via DataManager.
 * Requires enough followers gathered, faith cost, and unlocked tech.
 */

import type { World } from '../ecs/World';
import { OnRitual } from '../components/OnRitual';
import { OnMission } from '../components/OnMission';
import { FollowerAI } from '../components/FollowerAI';
import { Transform } from '../components/Transform';
import { Needs } from '../components/Needs';
import { DataManager, RitualDef } from '../data/DataManager';

export interface ActiveRitual {
  id: string;
  name: string;
  def: RitualDef;
  progress: number; // 0 to def.duration
  participants: number[]; // entity IDs
  tick: number; // start tick
  gatheringSeconds?: number;
}

export interface RitualResult {
  id: string;
  name: string;
  success: boolean;
  influenceGain: number;
  faithGain: number;
  notorietyGain: number;
  participants: number;
}

export class RitualSystem {
  private activeRituals: ActiveRitual[] = [];
  private completedRituals: RitualResult[] = [];
  private unlockedTech: Set<string> = new Set();
  private tickCount = 0;
  private onRitualComplete?: (result: RitualResult) => void;
  private onRitualStart?: (ritual: ActiveRitual) => void;

  constructor(
    unlockedTech: string[] = [],
    onRitualStart?: (ritual: ActiveRitual) => void,
    onRitualComplete?: (result: RitualResult) => void,
  ) {
    unlockedTech.forEach((t) => this.unlockedTech.add(t));
    this.onRitualStart = onRitualStart;
    this.onRitualComplete = onRitualComplete;
  }

  reset(): void {
    this.activeRituals = [];
    this.completedRituals = [];
    this.unlockedTech = new Set(['basic_rituals']);
    this.tickCount = 0;
  }
  snapshot() {
    return {
      active: this.activeRituals,
      completed: this.completedRituals,
      tech: [...this.unlockedTech],
      elapsed: this.tickCount,
    };
  }
  restore(data: ReturnType<RitualSystem['snapshot']>): void {
    this.reset();
    this.activeRituals = data.active.filter((r) => !!DataManager.getRitual(r.def.id));
    this.completedRituals = data.completed;
    this.unlockedTech = new Set(data.tech);
    this.tickCount = data.elapsed;
  }
  /**
   * Unlock a tech node, enabling its rituals.
   */
  unlockTech(techId: string): void {
    this.unlockedTech.add(techId);
  }

  /**
   * Check if a ritual can be started.
   * Returns { ok: boolean, reason?: string }
   */
  canStartRitual(
    ritualId: string,
    availableFollowers: number[],
    cultFaith: number,
    cultWealth: number,
  ): { ok: boolean; reason?: string } {
    const def = DataManager.getRitual(ritualId);
    if (!def) return { ok: false, reason: 'Unknown ritual' };

    // Check tech requirements
    for (const req of def.requirements) {
      // req could be a tech id or a room id — we only track tech unlocks here
      if (!this.unlockedTech.has(req)) {
        // Room requirements are checked externally — skip if it looks like a room
        const roomIds = DataManager.getRooms().map((r) => r.id);
        if (!roomIds.includes(req)) {
          return { ok: false, reason: `Requires tech: ${req}` };
        }
      }
    }

    if (availableFollowers.length < def.minFollowers) {
      return {
        ok: false,
        reason: `Need ${def.minFollowers} followers, have ${availableFollowers.length}`,
      };
    }
    if (cultFaith < def.faithCost) {
      return { ok: false, reason: `Need ${def.faithCost} faith, have ${Math.floor(cultFaith)}` };
    }
    if (def.wealthCost && cultWealth < def.wealthCost) {
      return { ok: false, reason: `Need ${def.wealthCost} wealth, have ${Math.floor(cultWealth)}` };
    }

    return { ok: true };
  }

  /**
   * Start a ritual. Deducts costs upfront.
   * Returns the ActiveRitual or null if it can't start.
   */
  startRitual(
    ritualId: string,
    participants: number[],
    world?: World,
    targets: { x: number; y: number }[] = [],
  ): ActiveRitual | null {
    const def = DataManager.getRitual(ritualId);
    if (
      !def ||
      this.activeRituals.length ||
      new Set(participants).size !== participants.length ||
      participants.length < def.minFollowers
    )
      return null;
    if (
      world &&
      (targets.length < participants.length ||
        participants.some(
          (id) =>
            !world.hasComponent(id, Needs) ||
            world.hasComponent(id, OnMission) ||
            world.hasComponent(id, OnRitual),
        ))
    )
      return null;

    const ritual: ActiveRitual = {
      id: `${ritualId}_${this.tickCount}`,
      name: def.name,
      def,
      progress: 0,
      participants: [...participants],
      tick: this.tickCount,
    };

    if (world)
      participants.forEach((id, index) => {
        const marker = new OnRitual(id);
        marker.ritualId = ritual.id;
        marker.target = { ...targets[index] };
        world.addComponent(id, marker);
        const ai = world.getComponent(id, FollowerAI);
        if (ai) {
          ai.path = [];
          ai.pathIndex = 0;
          ai.state = 'moving';
          ai.needTarget = null;
          ai.needTargetTile = null;
        }
      });
    this.activeRituals.push(ritual);
    this.onRitualStart?.(ritual);
    return ritual;
  }

  /**
   * Update active rituals. Call each tick.
   * Participants' faith is increased during rituals.
   */
  update(world: World, dt: number): void {
    this.tickCount += dt;

    const completed: ActiveRitual[] = [];

    for (const ritual of [...this.activeRituals]) {
      if (
        ritual.participants.some((id) => {
          const needs = world.getComponent(id, Needs);
          return !needs || needs.hunger < 12 || needs.energy < 8;
        })
      ) {
        this.cancelRitual(world, ritual.id);
        continue;
      }
      const gathering = ritual.participants.some((id) => {
        const marker = world.getComponent(id, OnRitual),
          pos = world.getComponent(id, Transform);
        return (
          marker && (!pos || Math.hypot(marker.target.x - pos.x, marker.target.y - pos.y) > 0.1)
        );
      });
      if (gathering) {
        ritual.gatheringSeconds = (ritual.gatheringSeconds ?? 0) + dt;
        if (ritual.gatheringSeconds > 45) this.cancelRitual(world, ritual.id);
        continue;
      }
      ritual.progress += dt;

      // Boost participant faith during ritual
      for (const entityId of ritual.participants) {
        const needs = world.getComponent(entityId, Needs);
        if (needs) {
          needs.faith = Math.min(100, needs.faith + 0.05 * dt);
        }
      }

      // Check completion
      if (ritual.progress >= ritual.def.duration) {
        completed.push(ritual);
      }
    }

    // Process completed rituals
    for (const ritual of completed) {
      this.completeRitual(world, ritual);
    }
  }

  cancelRitual(world: World, id: string): boolean {
    const ritual = this.activeRituals.find((r) => r.id === id);
    if (!ritual) return false;
    this.releaseParticipants(world, ritual);
    this.activeRituals = this.activeRituals.filter((r) => r.id !== id);
    this.onRitualComplete?.({
      id: ritual.id,
      name: ritual.name,
      success: false,
      influenceGain: 0,
      faithGain: 0,
      notorietyGain: 0,
      participants: ritual.participants.length,
    });
    return true;
  }
  private releaseParticipants(world: World, ritual: ActiveRitual): void {
    for (const id of ritual.participants) {
      world.removeComponent(id, OnRitual);
      const ai = world.getComponent(id, FollowerAI);
      if (ai) {
        ai.path = [];
        ai.pathIndex = 0;
        ai.state = 'idle';
        ai.stateTimer = 0;
        ai.activityReason = 'Available';
      }
    }
  }

  private completeRitual(world: World, ritual: ActiveRitual): void {
    const def = ritual.def;
    const result: RitualResult = {
      id: ritual.id,
      name: ritual.name,
      success: true,
      influenceGain: def.influenceGain,
      faithGain: def.faithGain ?? 0,
      notorietyGain: def.notorietyGain ?? 0,
      participants: ritual.participants.length,
    };

    // Apply faith gain to participants
    for (const entityId of ritual.participants) {
      const needs = world.getComponent(entityId, Needs);
      if (needs && result.faithGain > 0) {
        needs.faith = Math.min(100, needs.faith + result.faithGain);
      }
    }

    this.releaseParticipants(world, ritual);
    // Remove from active
    this.activeRituals = this.activeRituals.filter((r) => r.id !== ritual.id);
    this.completedRituals.push(result);
    this.onRitualComplete?.(result);
  }

  /**
   * Get all available rituals (tech-unlocked + no requirement blocking).
   */
  getAvailableRituals(): RitualDef[] {
    return DataManager.getRituals().filter((r) => {
      // Check tech requirements
      for (const req of r.requirements) {
        const roomIds = DataManager.getRooms().map((room) => room.id);
        if (!roomIds.includes(req) && !this.unlockedTech.has(req)) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Get currently active rituals.
   */
  getActiveRituals(): ActiveRitual[] {
    return [...this.activeRituals];
  }

  /**
   * Get completed ritual results.
   */
  getCompletedRituals(): RitualResult[] {
    return [...this.completedRituals];
  }

  /**
   * Get progress of a ritual (0-1).
   */
  getRitualProgress(ritualId: string): number {
    const ritual = this.activeRituals.find((r) => r.id === ritualId);
    if (!ritual) return 0;
    return ritual.progress / ritual.def.duration;
  }
}
