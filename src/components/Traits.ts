import type { Component } from '../ecs/Component';

export type TraitType =
  | 'insomniac'
  | 'zealous'
  | 'doubter'
  | 'charismatic'
  | 'lazy'
  | 'scholar'
  | 'hardy'
  | 'fragile'
  | 'devoted'
  | 'scholarly'
  | 'paranoid';

/** All possible traits, used for random assignment. */
export const ALL_TRAITS: TraitType[] = [
  'insomniac', 'zealous', 'doubter', 'charismatic',
  'lazy', 'scholar', 'hardy', 'fragile',
  'devoted', 'scholarly', 'paranoid',
];

export class Traits implements Component {
  constructor(public readonly entity: number) {}
  traits: TraitType[] = [];

  /** Check if this entity has a specific trait. */
  hasTrait(trait: TraitType): boolean {
    return this.traits.includes(trait);
  }

  /** Get the work speed multiplier for a given job type (1.0 = normal). */
  getWorkSpeedMult(jobType: string): number {
    let mult = 1.0;
    if (jobType === 'pray') {
      if (this.hasTrait('devoted')) mult *= 1.5;
      if (this.hasTrait('zealous')) mult *= 1.5;
    }
    if (jobType === 'research') {
      if (this.hasTrait('scholarly')) mult *= 1.5;
      if (this.hasTrait('scholar')) mult *= 1.5;
    }
    if (this.hasTrait('lazy')) mult *= 0.7;
    return mult;
  }

  /** Get the food consumption multiplier (1.0 = normal, <1 = eats less). */
  getFoodConsumptionMult(): number {
    let mult = 1.0;
    if (this.hasTrait('hardy')) mult *= 0.75;
    if (this.hasTrait('lazy')) mult *= 1.3;
    if (this.hasTrait('fragile')) mult *= 1.2;
    return mult;
  }

  /** Get the recruitment bonus (added to recruitment success chance). */
  getRecruitmentBonus(): number {
    return this.hasTrait('charismatic') ? 1 : 0;
  }

  /** Get the investigation morale loss multiplier (1.0 = normal, >1 = worse). */
  getInvestigationMoraleLossMult(): number {
    let mult = 1.0;
    if (this.hasTrait('paranoid')) mult *= 1.2;
    if (this.hasTrait('fragile')) mult *= 1.1;
    return mult;
  }
}