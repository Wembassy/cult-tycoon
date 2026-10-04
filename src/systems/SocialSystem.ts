/**
 * SocialSystem — explainable mood, memories, and lightweight relationships.
 *
 * Runs social interaction checks on a coarse interval rather than every frame.
 */

import type { World } from '../ecs/World';
import { System } from '../ecs/System';
import { SocialState } from '../components/SocialState';
import { Needs } from '../components/Needs';
import { FollowerAI } from '../components/FollowerAI';
import { Transform } from '../components/Transform';
import { Traits } from '../components/Traits';

export class SocialSystem extends System {
  private accumulator = 0;
  private elapsed = 0;

  update(world: World, dt: number): void {
    this.elapsed += dt;
    this.accumulator += dt;

    const followers = world.query([SocialState, Needs, FollowerAI, Transform]);

    for (const entity of followers) {
      const social = world.getComponent(entity, SocialState)!;
      const needs = world.getComponent(entity, Needs)!;

      social.interactionCooldown = Math.max(0, social.interactionCooldown - dt);
      social.breakCooldown = Math.max(0, social.breakCooldown - dt);

      for (const memory of social.memories) {
        memory.remaining -= dt;
      }
      social.memories = social.memories.filter(memory => memory.remaining > 0);

      const needsMood = (
        needs.hunger +
        needs.energy +
        needs.fun +
        needs.sanity +
        needs.comfort +
        needs.social
      ) / 6;

      social.mood = clamp(needsMood + social.memoryMoodTotal(), 0, 100);
    }

    if (this.accumulator < 1) return;
    this.accumulator = 0;
    this.processInteractions(world, followers);
  }

  private processInteractions(world: World, followers: number[]): void {
    for (let i = 0; i < followers.length; i++) {
      const a = followers[i];
      const aState = world.getComponent(a, SocialState)!;
      const aAI = world.getComponent(a, FollowerAI)!;
      const aTransform = world.getComponent(a, Transform)!;
      if (aState.interactionCooldown > 0 || !this.isSociallyAvailable(aAI)) continue;

      let partner: number | null = null;
      let bestDistance = Infinity;

      for (let j = 0; j < followers.length; j++) {
        if (i === j) continue;
        const b = followers[j];
        const bState = world.getComponent(b, SocialState)!;
        const bAI = world.getComponent(b, FollowerAI)!;
        if (bState.interactionCooldown > 0 || !this.isSociallyAvailable(bAI)) continue;

        const bTransform = world.getComponent(b, Transform)!;
        const dx = aTransform.x - bTransform.x;
        const dy = aTransform.y - bTransform.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= 2.5 && distance < bestDistance) {
          bestDistance = distance;
          partner = b;
        }
      }

      if (partner === null) continue;
      this.applyInteraction(world, a, partner);
    }
  }

  private applyInteraction(world: World, a: number, b: number): void {
    const aState = world.getComponent(a, SocialState)!;
    const bState = world.getComponent(b, SocialState)!;
    const aNeeds = world.getComponent(a, Needs)!;
    const bNeeds = world.getComponent(b, Needs)!;
    const aTraits = world.getComponent(a, Traits);
    const bTraits = world.getComponent(b, Traits);

    const aRel = aState.getRelationship(b);
    const bRel = bState.getRelationship(a);

    const roll = this.pseudoRoll(a, b);
    const charismaBonus =
      (aTraits?.hasTrait('charismatic') ? 0.8 : 0) +
      (bTraits?.hasTrait('charismatic') ? 0.8 : 0);
    const paranoidPenalty =
      (aTraits?.hasTrait('paranoid') ? 0.7 : 0) +
      (bTraits?.hasTrait('paranoid') ? 0.7 : 0);

    const opinionDelta = clamp(-2 + roll * 5 + charismaBonus - paranoidPenalty, -3, 4);
    aRel.familiarity = clamp(aRel.familiarity + 3, 0, 100);
    bRel.familiarity = clamp(bRel.familiarity + 3, 0, 100);
    aRel.opinion = clamp(aRel.opinion + opinionDelta, -100, 100);
    bRel.opinion = clamp(bRel.opinion + opinionDelta, -100, 100);

    const positive = opinionDelta >= 0;
    aState.addMemory({
      id: `social:${b}:${Math.floor(this.elapsed)}`,
      label: positive ? 'Had a pleasant conversation' : 'Had an awkward conversation',
      mood: positive ? 4 : -3,
      duration: positive ? 45 : 35,
      stackKey: positive ? 'pleasant_conversation' : 'awkward_conversation',
      sourceEntity: b,
    });
    bState.addMemory({
      id: `social:${a}:${Math.floor(this.elapsed)}`,
      label: positive ? 'Had a pleasant conversation' : 'Had an awkward conversation',
      mood: positive ? 4 : -3,
      duration: positive ? 45 : 35,
      stackKey: positive ? 'pleasant_conversation' : 'awkward_conversation',
      sourceEntity: a,
    });

    aNeeds.social = clamp(aNeeds.social + 14, 0, 100);
    bNeeds.social = clamp(bNeeds.social + 14, 0, 100);
    aNeeds.fun = clamp(aNeeds.fun + (positive ? 5 : 1), 0, 100);
    bNeeds.fun = clamp(bNeeds.fun + (positive ? 5 : 1), 0, 100);

    // Simple Alpha romance: high familiarity + opinion can become mutual romance.
    if (!aRel.romantic && !bRel.romantic &&
        aRel.familiarity >= 60 && bRel.familiarity >= 60 &&
        aRel.opinion >= 70 && bRel.opinion >= 70 &&
        this.pseudoRoll(a + 17, b + 31) > 0.94) {
      aRel.romantic = true;
      bRel.romantic = true;
      aState.addMemory({
        id: `romance:${b}`,
        label: 'Began a romantic relationship',
        mood: 8,
        duration: 120,
        stackKey: `romance:${b}`,
        sourceEntity: b,
      });
      bState.addMemory({
        id: `romance:${a}`,
        label: 'Began a romantic relationship',
        mood: 8,
        duration: 120,
        stackKey: `romance:${a}`,
        sourceEntity: a,
      });
    }

    aState.interactionCooldown = 8;
    bState.interactionCooldown = 8;
  }

  private isSociallyAvailable(ai: FollowerAI): boolean {
    if (ai.state === 'stuck' || ai.state === 'working') return false;
    if (ai.state === 'needs') {
      return ai.needTarget === 'fun' || ai.needTarget === 'social' || ai.needTarget === 'hunger';
    }
    return ai.state === 'idle' || ai.state === 'done';
  }

  private pseudoRoll(a: number, b: number): number {
    const seed = Math.sin(a * 12.9898 + b * 78.233 + Math.floor(this.elapsed) * 0.127) * 43758.5453;
    return seed - Math.floor(seed);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
