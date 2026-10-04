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
import { Job } from '../components/Job';
import type { MentalBreakType } from '../components/SocialState';

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

      this.updateMentalBreak(world, entity, social, needs, dt);
      if (!social.activeBreak && social.mood < 30 && aiCanRecreate(world.getComponent(entity, FollowerAI)!)) {
        const ai = world.getComponent(entity, FollowerAI)!;
        if (ai.needTarget === null) {
          ai.needTarget = 'fun';
          ai.needTargetTile = null;
          ai.state = 'needs';
          ai.stateTimer = 0;
        }
      }
    }

    if (this.accumulator < 1) return;
    this.accumulator = 0;
    this.processInteractions(world, followers);
  }

  private updateMentalBreak(
    world: World,
    entity: number,
    social: SocialState,
    needs: Needs,
    dt: number,
  ): void {
    const ai = world.getComponent(entity, FollowerAI)!;
    const job = world.getComponent(entity, Job);

    if (social.activeBreak) {
      social.activeBreak.remaining -= dt;

      switch (social.activeBreak.type) {
        case 'refuse_work':
          ai.state = 'idle';
          ai.path = [];
          ai.pathIndex = 0;
          break;
        case 'isolate':
          ai.state = 'idle';
          needs.fun = clamp(needs.fun + 0.08 * dt, 0, 100);
          needs.social = clamp(needs.social - 0.05 * dt, 0, 100);
          break;
        case 'binge_eat':
          if (needs.hunger < 95 && ai.needTarget === null) {
            ai.needTarget = 'hunger';
            ai.needTargetTile = null;
            ai.state = 'needs';
            ai.stateTimer = 0;
          }
          break;
        case 'argue_fight':
          ai.state = 'idle';
          break;
        case 'attempt_leave':
          ai.state = 'idle';
          needs.social = clamp(needs.social - 0.08 * dt, 0, 100);
          break;
      }

      if (social.activeBreak.remaining <= 0) {
        const finished = social.activeBreak.type;
        social.activeBreak = null;
        social.breakCooldown = 75;
        ai.needTarget = null;
        ai.needTargetTile = null;
        ai.path = [];
        ai.pathIndex = 0;
        ai.state = 'idle';
        ai.stateTimer = 0;
        social.addMemory({
          id: `break-ended:${finished}:${Math.floor(this.elapsed)}`,
          label: 'Recovered from a mental break',
          mood: -2,
          duration: 25,
          stackKey: 'mental_break_recovery',
        });
      }
      return;
    }

    if (social.mood >= 18 || social.breakCooldown > 0) return;
    if (!job || (job.type !== 'idle' && job.type !== 'wander')) return;
    if (ai.state !== 'idle' && ai.state !== 'done' && ai.state !== 'needs') return;

    const types: MentalBreakType[] = [
      'refuse_work',
      'isolate',
      'binge_eat',
      'argue_fight',
      'attempt_leave',
    ];
    const type = types[Math.floor(this.pseudoRoll(entity, entity + 97) * types.length)] ?? 'refuse_work';
    const duration = 12 + this.pseudoRoll(entity + 11, entity + 53) * 14;

    social.activeBreak = { type, remaining: duration };
    social.addMemory({
      id: `mental-break:${type}:${Math.floor(this.elapsed)}`,
      label: `Mental break: ${type.replaceAll('_', ' ')}`,
      mood: -6,
      duration: duration + 30,
      stackKey: `mental_break:${type}`,
    });

    if (type === 'argue_fight') {
      const target = Object.values(social.relationships)
        .sort((a, b) => b.familiarity - a.familiarity)[0];
      if (target) {
        social.activeBreak.targetEntity = target.targetEntity;
        target.opinion = clamp(target.opinion - 18, -100, 100);
        const other = world.getComponent(target.targetEntity, SocialState);
        if (other) {
          const reverse = other.getRelationship(entity);
          reverse.opinion = clamp(reverse.opinion - 18, -100, 100);
          other.addMemory({
            id: `argument:${entity}:${Math.floor(this.elapsed)}`,
            label: 'Was targeted in an argument',
            mood: -7,
            duration: 55,
            stackKey: 'was_argued_with',
            sourceEntity: entity,
          });
        }
      }
    }
  }

  private processInteractions(world: World, followers: number[]): void {
    for (let i = 0; i < followers.length; i++) {
      const a = followers[i];
      const aState = world.getComponent(a, SocialState)!;
      if (aState.activeBreak) continue;
      const aAI = world.getComponent(a, FollowerAI)!;
      const aTransform = world.getComponent(a, Transform)!;
      if (aState.interactionCooldown > 0 || !this.isSociallyAvailable(aAI)) continue;

      let partner: number | null = null;
      let bestDistance = Infinity;

      for (let j = 0; j < followers.length; j++) {
        if (i === j) continue;
        const b = followers[j];
        const bState = world.getComponent(b, SocialState)!;
        if (bState.activeBreak) continue;
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
      return ai.needTarget === 'fun' || ai.needTarget === 'hunger';
    }
    return ai.state === 'idle' || ai.state === 'done';
  }

  private pseudoRoll(a: number, b: number): number {
    const seed = Math.sin(a * 12.9898 + b * 78.233 + Math.floor(this.elapsed) * 0.127) * 43758.5453;
    return seed - Math.floor(seed);
  }
}

function aiCanRecreate(ai: FollowerAI): boolean {
  return ai.state === 'idle' || ai.state === 'done';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
