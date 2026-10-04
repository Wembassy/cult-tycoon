import type { Component } from '../ecs/Component';

export type SkillKey =
  | 'cooking'
  | 'research'
  | 'construction'
  | 'growing'
  | 'faith'
  | 'combat'
  | 'social';

export type PassionLevel = 'none' | 'minor' | 'major';

export const SKILL_KEYS: SkillKey[] = [
  'cooking',
  'research',
  'construction',
  'growing',
  'faith',
  'combat',
  'social',
];

export class Skills implements Component {
  constructor(public readonly entity: number) {}

  cooking = 1;
  research = 1;
  construction = 1;
  growing = 1;
  faith = 1;
  combat = 1;
  social = 1;

  /** XP toward the next level. Level threshold scales upward gradually. */
  xp: Record<SkillKey, number> = {
    cooking: 0,
    research: 0,
    construction: 0,
    growing: 0,
    faith: 0,
    combat: 0,
    social: 0,
  };

  passions: Record<SkillKey, PassionLevel> = {
    cooking: 'none',
    research: 'none',
    construction: 'none',
    growing: 'none',
    faith: 'none',
    combat: 'none',
    social: 'none',
  };

  getLevel(skill: SkillKey): number {
    return this[skill];
  }

  getPassion(skill: SkillKey): PassionLevel {
    return this.passions[skill] ?? 'none';
  }

  learningMultiplier(skill: SkillKey): number {
    switch (this.getPassion(skill)) {
      case 'major': return 2.0;
      case 'minor': return 1.4;
      default: return 1.0;
    }
  }

  addExperience(skill: SkillKey, baseAmount: number): boolean {
    if (baseAmount <= 0 || this[skill] >= 10) return false;
    this.xp[skill] = (this.xp[skill] ?? 0) + baseAmount * this.learningMultiplier(skill);

    let leveled = false;
    while (this[skill] < 10) {
      const threshold = this.xpForNextLevel(this[skill]);
      if (this.xp[skill] < threshold) break;
      this.xp[skill] -= threshold;
      this[skill] += 1;
      leveled = true;
    }
    return leveled;
  }

  private xpForNextLevel(level: number): number {
    return 20 + level * 12;
  }
}
