/**
 * MissionSystem — Manages external missions for cultists.
 *
 * Cultists can be sent on missions outside the compound for various rewards:
 *   - Heat reduction (lower the heat stat)
 *   - PR generation (increase reputation/follower quality)
 *   - Object acquisition (obtain decor/ornaments — generates heat)
 *   - Resource gathering (earn money and influence)
 *
 * Mission flow:
 *   1. startMission(templateId, cultistIds) — validates and starts
 *   2. update(world, dt) — advances progress, triggers events at milestones
 *   3. resolveMission(missionId) — calculates success, applies rewards
 *
 * Mission events surface through a callback for the UI to present choices.
 */

import type { World } from '../ecs/World';
import { Skills } from '../components/Skills';
import { OnMission } from '../components/OnMission';
import {
  MISSION_TEMPLATES,
  type MissionTemplate,
  type MissionEvent,
  type MissionChoice,
  type MissionType,
} from '../data/MissionTemplates';

export interface ActiveMission {
  /** Unique runtime ID for this mission instance. */
  id: string;
  /** Template ID this mission was created from. */
  templateId: string;
  /** Entity IDs of cultists sent on this mission. */
  cultistIds: number[];
  /** Total duration in in-game hours. */
  duration: number;
  /** Elapsed time in in-game hours. */
  elapsed: number;
  /** Progress 0..1. */
  progress: number;
  /** Whether the mission has completed. */
  completed: boolean;
  /** Events triggered so far (by event ID). */
  triggeredEvents: Set<string>;
  /** Pending event awaiting player choice, if any. */
  pendingEvent?: {
    eventId: string;
    choices: MissionChoice[];
  };
  /** Accumulated rewards from events (applied at resolution). */
  accumulatedRewards: {
    money?: number;
    influence?: number;
    prGain?: number;
    heatReduction?: number;
    heatGain?: number;
    decorItemIds: string[];
    injuryChanceBonus: number;
  };
}

export interface MissionRewards {
  money?: number;
  influence?: number;
  prGain?: number;
  heatReduction?: number;
  heatGain?: number;
  decorItemIds: string[];
  injuredCultistIds: number[];
}

export type MissionEventCallback = (
  missionId: string,
  event: MissionEvent,
  choices: MissionChoice[],
) => void;

export type MissionResolvedCallback = (
  missionId: string,
  templateId: string,
  success: boolean,
  rewards: MissionRewards,
) => void;

let missionIdCounter = 0;

export class MissionSystem {
  completedCount = 0;
  private activeMissions = new Map<string, ActiveMission>();
  private rng: () => number;
  private onEvent?: MissionEventCallback;
  private onResolved?: MissionResolvedCallback;

  constructor(
    onEvent?: MissionEventCallback,
    onResolved?: MissionResolvedCallback,
    seed: number = Date.now(),
  ) {
    this.onEvent = onEvent;
    this.onResolved = onResolved;
    let state = seed;
    this.rng = () => {
      state = (state * 1664525 + 1013904223) | 0;
      return ((state >>> 0) % 10000) / 10000;
    };
  }

  /**
   * Start a mission with the given template and cultists.
   * Validates that the template exists, cultist count is within range,
   * and none of the cultists are already on a mission.
   */
  startMission(
    templateId: string,
    cultistIds: number[],
    world: World,
  ): { success: boolean; reason?: string } {
    const template = MISSION_TEMPLATES[templateId];
    if (!template) {
      return { success: false, reason: `Unknown mission template: ${templateId}` };
    }

    if (cultistIds.length < template.minCultists) {
      return {
        success: false,
        reason: `Need at least ${template.minCultists} cultists, got ${cultistIds.length}`,
      };
    }

    if (cultistIds.length > template.maxCultists) {
      return {
        success: false,
        reason: `Maximum ${template.maxCultists} cultists allowed, got ${cultistIds.length}`,
      };
    }

    // Check that none of the cultists are already on a mission
    for (const id of cultistIds) {
      if (!world.hasEntity(id)) {
        return { success: false, reason: `Entity ${id} does not exist` };
      }
      if (world.hasComponent(id, OnMission)) {
        return { success: false, reason: `Cultist ${id} is already on a mission` };
      }
    }

    if (new Set(cultistIds).size !== cultistIds.length)
      return { success: false, reason: 'Select different cultists for each team slot' };

    // Create the mission
    const missionId = `mission_${++missionIdCounter}`;
    const mission: ActiveMission = {
      id: missionId,
      templateId,
      cultistIds: [...cultistIds],
      duration: template.duration,
      elapsed: 0,
      progress: 0,
      completed: false,
      triggeredEvents: new Set<string>(),
      accumulatedRewards: {
        decorItemIds: [],
        injuryChanceBonus: 0,
      },
    };

    this.activeMissions.set(missionId, mission);

    // Mark all cultists as OnMission
    for (const id of cultistIds) {
      const onMission = new OnMission(id);
      onMission.missionId = missionId;
      world.addComponent(id, onMission);
    }

    return { success: true };
  }

  /**
   * Update all active missions. Advances progress and triggers events at milestones.
   * @param world The ECS world
   * @param dt Delta time in simulation hours
   */
  update(world: World, dt: number): void {
    for (const [missionId, mission] of this.activeMissions) {
      if (mission.completed || mission.pendingEvent) {
        continue;
      }

      mission.elapsed += dt;
      mission.progress = Math.min(1, mission.elapsed / mission.duration);

      // Trigger events at 33% and 66% progress milestones
      const template = MISSION_TEMPLATES[mission.templateId];
      if (!template) continue;

      for (const event of template.events) {
        if (mission.triggeredEvents.has(event.id)) continue;

        // Trigger at 33% for first event, 66% for second, etc.
        const eventIndex = template.events.indexOf(event);
        const triggerThreshold = (eventIndex + 1) / (template.events.length + 1);

        if (mission.progress >= triggerThreshold) {
          mission.triggeredEvents.add(event.id);
          mission.pendingEvent = {
            eventId: event.id,
            choices: event.choices,
          };

          // Surface event to UI via callback
          this.onEvent?.(missionId, event, event.choices);
          break; // One decision at a time, even after a large time step.
        }
      }

      // Check if mission is complete
      if (mission.progress >= 1 && !mission.completed && !mission.pendingEvent) {
        this.resolveMission(missionId, world);
      }
    }
  }

  /**
   * Resolve a completed mission. Calculates success based on cultist skills
   * vs difficulty, applies accumulated rewards, and cleans up cultist state.
   */
  resolveMission(
    missionId: string,
    world: World,
  ): { success: boolean; rewards: MissionRewards } | null {
    const mission = this.activeMissions.get(missionId);
    if (!mission) return null;

    const template = MISSION_TEMPLATES[mission.templateId];
    if (!template) return null;

    // Calculate team skill level (average of relevant skills across cultists)
    const teamSkill = this.calculateTeamSkill(world, mission.cultistIds, template.type);

    // Success chance: team skill vs difficulty
    // successChance = teamSkill / (teamSkill + difficulty * 2)
    const successChance = teamSkill / (teamSkill + template.difficulty * 2);
    const isSuccess = this.rng() < successChance;

    // Combine template rewards with accumulated event rewards
    const rewards: MissionRewards = {
      money: (template.rewards.money ?? 0) + (mission.accumulatedRewards.money ?? 0),
      influence: (template.rewards.influence ?? 0) + (mission.accumulatedRewards.influence ?? 0),
      prGain: (template.rewards.prGain ?? 0) + (mission.accumulatedRewards.prGain ?? 0),
      heatReduction:
        (template.rewards.heatReduction ?? 0) + (mission.accumulatedRewards.heatReduction ?? 0),
      heatGain: template.heatCost + (mission.accumulatedRewards.heatGain ?? 0),
      decorItemIds: [
        ...(template.rewards.decorItemId ? [template.rewards.decorItemId] : []),
        ...mission.accumulatedRewards.decorItemIds,
      ],
      injuredCultistIds: [],
    };

    // On failure, reduce rewards and potentially injure cultists
    if (!isSuccess) {
      rewards.money = Math.floor((rewards.money ?? 0) * 0.3);
      rewards.influence = Math.floor((rewards.influence ?? 0) * 0.3);
      rewards.prGain = Math.floor((rewards.prGain ?? 0) * 0.3);
      rewards.heatReduction = Math.floor((rewards.heatReduction ?? 0) * 0.3);
      rewards.heatGain = (rewards.heatGain ?? 0) + 5;

      // Check for injuries
      const injuryChance = 0.2 + mission.accumulatedRewards.injuryChanceBonus;
      for (const cultistId of mission.cultistIds) {
        if (this.rng() < injuryChance) {
          rewards.injuredCultistIds.push(cultistId);
          const onMission = world.getComponent(cultistId, OnMission);
          if (onMission) {
            onMission.injured = true;
          }
        }
      }
    }

    // Mark mission as completed
    mission.completed = true;

    // Clean up OnMission components
    for (const cultistId of mission.cultistIds) {
      const onMission = world.getComponent(cultistId, OnMission);
      if (onMission) {
        world.removeComponent(cultistId, OnMission);
      }
    }

    // Remove from active missions
    this.activeMissions.delete(missionId);

    // Fire resolved callback
    this.completedCount++;
    this.onResolved?.(missionId, mission.templateId, isSuccess, rewards);

    return { success: isSuccess, rewards };
  }

  /**
   * Resolve a pending event choice. Called by UI when player selects a choice.
   */
  resolveEventChoice(
    missionId: string,
    choiceIndex: number,
    world: World,
  ): { success: boolean; text: string } | null {
    const mission = this.activeMissions.get(missionId);
    if (!mission || !mission.pendingEvent) return null;

    const template = MISSION_TEMPLATES[mission.templateId];
    if (!template) return null;

    const eventDef = template.events.find((e) => e.id === mission.pendingEvent!.eventId);
    if (!eventDef) return null;

    const choice = eventDef.choices[choiceIndex];
    if (!choice) return null;

    let success = true;
    let resultText = '';

    if (choice.skillCheck) {
      // Perform skill check
      const teamSkill = this.calculateTeamSkillForSkill(
        world,
        mission.cultistIds,
        choice.skillCheck.skill,
      );
      const successChance = teamSkill / (teamSkill + choice.skillCheck.difficulty * 2);
      success = this.rng() < successChance;
    }

    const outcome = success ? choice.outcomes.success : choice.outcomes.failure;

    // Apply outcomes to accumulated rewards
    if (outcome.money) {
      mission.accumulatedRewards.money = (mission.accumulatedRewards.money ?? 0) + outcome.money;
    }
    if (outcome.influence) {
      mission.accumulatedRewards.influence =
        (mission.accumulatedRewards.influence ?? 0) + outcome.influence;
    }
    if (outcome.prGain) {
      mission.accumulatedRewards.prGain = (mission.accumulatedRewards.prGain ?? 0) + outcome.prGain;
    }
    if (outcome.heatReduction) {
      mission.accumulatedRewards.heatReduction =
        (mission.accumulatedRewards.heatReduction ?? 0) + outcome.heatReduction;
    }
    if (outcome.heatGain) {
      mission.accumulatedRewards.heatGain =
        (mission.accumulatedRewards.heatGain ?? 0) + outcome.heatGain;
    }
    if (outcome.decorItemId) {
      mission.accumulatedRewards.decorItemIds.push(outcome.decorItemId);
    }
    if (outcome.injuryChance) {
      mission.accumulatedRewards.injuryChanceBonus += outcome.injuryChance;
    }

    resultText = outcome.text || (success ? 'Success!' : 'Failure.');

    // Clear pending event
    mission.pendingEvent = undefined;

    return { success, text: resultText };
  }

  /**
   * Get all currently active missions.
   */
  getActiveMissions(): ActiveMission[] {
    return Array.from(this.activeMissions.values());
  }

  /**
   * Get all available mission templates (for UI display).
   */
  getAvailableMissions(): MissionTemplate[] {
    return Object.values(MISSION_TEMPLATES);
  }

  /**
   * Get a specific active mission by ID.
   */
  getMission(missionId: string): ActiveMission | undefined {
    return this.activeMissions.get(missionId);
  }

  /**
   * Check if a cultist is currently on any mission.
   */
  isOnMission(cultistId: number, world: World): boolean {
    return world.hasComponent(cultistId, OnMission);
  }

  // ─── Private helpers ───────────────────────────────────────

  /**
   * Calculate the team's effective skill level for a mission type.
   * Different mission types weight different skills.
   */
  private calculateTeamSkill(world: World, cultistIds: number[], type: MissionType): number {
    const skillMap: Record<MissionType, string[]> = {
      heat_reduction: ['social', 'faith'],
      pr_generation: ['social', 'faith'],
      object_acquisition: ['construction', 'research', 'combat'],
      resource_gathering: ['social', 'construction'],
    };

    const relevantSkills = skillMap[type];
    return this.calculateTeamSkillForSkills(world, cultistIds, relevantSkills);
  }

  /**
   * Calculate team skill for a specific skill name.
   */
  private calculateTeamSkillForSkill(
    world: World,
    cultistIds: number[],
    skillName: string,
  ): number {
    let total = 0;
    let count = 0;

    for (const id of cultistIds) {
      const skills = world.getComponent(id, Skills);
      if (!skills) continue;
      const skillValue = (skills as unknown as Record<string, number>)[skillName];
      if (typeof skillValue === 'number') {
        total += skillValue;
        count++;
      }
    }

    if (count === 0) return 1;
    return total / count;
  }

  /**
   * Calculate team skill across multiple relevant skills (averaged).
   */
  private calculateTeamSkillForSkills(
    world: World,
    cultistIds: number[],
    skillNames: string[],
  ): number {
    let total = 0;
    for (const skillName of skillNames) {
      total += this.calculateTeamSkillForSkill(world, cultistIds, skillName);
    }
    return total / skillNames.length;
  }
  snapshot(): {
    completedCount: number;
    missions: (Omit<ActiveMission, 'triggeredEvents'> & { triggeredEvents: string[] })[];
  } {
    return {
      completedCount: this.completedCount,
      missions: [...this.activeMissions.values()].map((m) => ({
        ...m,
        triggeredEvents: [...m.triggeredEvents],
      })),
    };
  }
  restore(data: ReturnType<MissionSystem['snapshot']> | undefined, world: World): void {
    this.activeMissions.clear();
    this.completedCount = data?.completedCount ?? 0;
    for (const id of world.query([OnMission])) world.removeComponent(id, OnMission);
    for (const item of data?.missions ?? []) {
      if (!MISSION_TEMPLATES[item.templateId] || item.completed) continue;
      const mission = {
        ...item,
        cultistIds: item.cultistIds.filter((id) => world.hasEntity(id)),
        triggeredEvents: new Set(item.triggeredEvents),
      };
      if (!mission.cultistIds.length) continue;
      this.activeMissions.set(item.id, mission);
      missionIdCounter = Math.max(missionIdCounter, Number(item.id.replace('mission_', '')) || 0);
      for (const id of mission.cultistIds) {
        const marker = new OnMission(id);
        marker.missionId = item.id;
        world.addComponent(id, marker);
      }
    }
  }
  presentPendingEvents(): void {
    for (const mission of this.activeMissions.values()) {
      const event = MISSION_TEMPLATES[mission.templateId]?.events.find(
        (e) => e.id === mission.pendingEvent?.eventId,
      );
      if (event) this.onEvent?.(mission.id, event, event.choices);
    }
  }
}
