import type { Component } from '../ecs/Component';
import type { CultRoleKey, IdeologyCategory } from '../game/Ideology';

export class BeliefState implements Component {
  constructor(public readonly entity: number) {}

  /** 0 = unbelieving, 100 = fully devoted. */
  strength = 50;

  /**
   * Personal value alignment per doctrine category.
   * -1 strongly opposes, 0 neutral, +1 strongly agrees.
   */
  values: Record<IdeologyCategory, number> = {
    work_ethic: 0,
    wealth: 0,
    food: 0,
    relationships: 0,
    community: 0,
    authority: 0,
    violence: 0,
    outsiders: 0,
    nature: 0,
    comfort: 0,
    ritual: 0,
    spirituality: 0,
  };

  assignedRole: CultRoleKey | null = null;
  conversionProgress = 0;
}
