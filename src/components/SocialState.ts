import type { Component } from '../ecs/Component';

export interface MemoryThought {
  id: string;
  label: string;
  mood: number;
  duration: number;
  remaining: number;
  stackKey?: string;
  stacks?: number;
  sourceEntity?: number;
}

export type FamilyRelation = 'parent' | 'child' | 'sibling';

export interface RelationshipState {
  targetEntity: number;
  familiarity: number;
  opinion: number;
  romantic: boolean;
  family?: FamilyRelation;
}

export type MentalBreakType =
  | 'refuse_work'
  | 'isolate'
  | 'binge_eat'
  | 'argue_fight'
  | 'attempt_leave';

export interface ActiveMentalBreak {
  type: MentalBreakType;
  remaining: number;
  targetEntity?: number;
}

export class SocialState implements Component {
  constructor(public readonly entity: number) {}

  mood = 100;
  memories: MemoryThought[] = [];
  relationships: Record<string, RelationshipState> = {};
  activeBreak: ActiveMentalBreak | null = null;
  /** Prevent immediate repeat interactions/breaks. */
  interactionCooldown = 0;
  breakCooldown = 0;

  getRelationship(targetEntity: number): RelationshipState {
    const key = String(targetEntity);
    let relationship = this.relationships[key];
    if (!relationship) {
      relationship = {
        targetEntity,
        familiarity: 0,
        opinion: 0,
        romantic: false,
      };
      this.relationships[key] = relationship;
    }
    return relationship;
  }

  addMemory(memory: Omit<MemoryThought, 'remaining'> & { remaining?: number }): void {
    const stackKey = memory.stackKey;
    if (stackKey) {
      const existing = this.memories.find(item => item.stackKey === stackKey);
      if (existing) {
        existing.stacks = Math.min(3, (existing.stacks ?? 1) + 1);
        existing.remaining = Math.max(existing.remaining, memory.remaining ?? memory.duration);
        existing.mood = memory.mood;
        existing.label = memory.label;
        return;
      }
    }

    this.memories.push({
      ...memory,
      remaining: memory.remaining ?? memory.duration,
      stacks: memory.stacks ?? 1,
    });
  }

  memoryMoodTotal(): number {
    return this.memories.reduce((sum, memory) =>
      sum + memory.mood * Math.max(1, memory.stacks ?? 1), 0);
  }
}
