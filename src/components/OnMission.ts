import type { Component } from '../ecs/Component';

/**
 * OnMission — Marks a cultist as currently on an external mission.
 *
 * When this component is present, AISystem should skip the entity
 * (no pathfinding, no job assignment, no needs processing).
 * The MissionSystem manages their state until the mission resolves.
 */
export class OnMission implements Component {
  constructor(public readonly entity: number) {}

  /** The ID of the active mission this cultist is assigned to. */
  missionId: string | null = null;

  /** Whether the cultist was injured during the mission. */
  injured: boolean = false;
}