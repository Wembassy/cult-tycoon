/**
 * IdeologySystem — doctrine-driven mood, belief change, and formal role effects.
 */

import type { World } from '../ecs/World';
import { System } from '../ecs/System';
import { BeliefState } from '../components/BeliefState';
import { SocialState } from '../components/SocialState';
import { Needs } from '../components/Needs';
import { Traits } from '../components/Traits';
import { Job } from '../components/Job';
import { FollowerAI } from '../components/FollowerAI';
import { Schedule } from '../components/Schedule';
import {
  cloneIdeology,
  createIdeologyFoundation,
  type CultIdeology,
  type CultRoleKey,
  type IdeologyCategory,
  type IdeologyFoundation,
  type PreceptStance,
} from '../game/Ideology';

export interface IdeologySnapshot {
  ideology: CultIdeology;
}

export class IdeologySystem extends System {
  private ideology: CultIdeology = createIdeologyFoundation('communal_devotion');
  private accumulator = 0;
  private currentHour = 6;

  setHour(hour: number): void {
    this.currentHour = ((hour % 24) + 24) % 24;
  }

  setFoundation(foundation: IdeologyFoundation): void {
    const roles = { ...this.ideology.roles };
    this.ideology = createIdeologyFoundation(foundation);
    this.ideology.roles = roles;
  }

  getIdeology(): CultIdeology {
    return cloneIdeology(this.ideology);
  }

  setIdeology(ideology: CultIdeology): void {
    this.ideology = cloneIdeology(ideology);
  }

  assignRole(role: CultRoleKey, entityId: number | null, world: World): void {
    const previous = this.ideology.roles[role];
    if (previous !== null) {
      const oldBelief = world.getComponent(previous, BeliefState);
      if (oldBelief?.assignedRole === role) oldBelief.assignedRole = null;
    }

    this.ideology.roles[role] = entityId;
    if (entityId !== null) {
      // One thematic cult role per follower in Alpha.
      for (const roleKey of Object.keys(this.ideology.roles) as CultRoleKey[]) {
        if (roleKey !== role && this.ideology.roles[roleKey] === entityId) {
          this.ideology.roles[roleKey] = null;
        }
      }
      const belief = world.getComponent(entityId, BeliefState);
      if (belief) belief.assignedRole = role;
    }
  }

  update(world: World, dt: number): void {
    this.accumulator += dt;
    this.applyRoleEffects(world, dt);

    if (this.accumulator < 1) return;
    const elapsed = this.accumulator;
    this.accumulator = 0;

    for (const entity of world.query([BeliefState, SocialState, Needs, FollowerAI])) {
      this.evaluateFollower(world, entity, elapsed);
    }
  }

  recordFoodEvent(
    world: World,
    entity: number,
    foodKind: 'meal' | 'food' | 'crop',
  ): void {
    const belief = world.getComponent(entity, BeliefState);
    const social = world.getComponent(entity, SocialState);
    if (!belief || !social) return;

    const precept = this.ideology.precepts.food;
    const intensity = this.beliefIntensity(belief);

    if (precept.principle === 'communal_meals') {
      const good = foodKind === 'meal';
      social.addMemory({
        id: `doctrine-food:${foodKind}`,
        label: good ? 'Ate according to communal food doctrine' : 'Ate beneath the cult food ideal',
        mood: Math.round((good ? 4 : -3) * intensity),
        duration: 50,
        stackKey: good ? 'doctrine_good_food' : 'doctrine_bad_food',
      });
      belief.strength = clamp(belief.strength + (good ? 0.7 : -0.4) * intensity, 0, 100);
    } else if (precept.principle === 'simple_food') {
      const simple = foodKind !== 'meal';
      social.addMemory({
        id: `doctrine-simple-food:${foodKind}`,
        label: simple ? 'Ate simple food in accordance with doctrine' : 'Ate an indulgent prepared meal',
        mood: Math.round((simple ? 3 : -2) * intensity),
        duration: 45,
        stackKey: simple ? 'doctrine_simple_food' : 'doctrine_indulgent_food',
      });
      belief.strength = clamp(belief.strength + (simple ? 0.5 : -0.25) * intensity, 0, 100);
    }
  }

  getSnapshot(): IdeologySnapshot {
    return { ideology: this.getIdeology() };
  }

  restoreSnapshot(snapshot: IdeologySnapshot | undefined): void {
    this.ideology = snapshot?.ideology
      ? cloneIdeology(snapshot.ideology)
      : createIdeologyFoundation('communal_devotion');
  }

  private evaluateFollower(world: World, entity: number, dt: number): void {
    const belief = world.getComponent(entity, BeliefState)!;
    const social = world.getComponent(entity, SocialState)!;
    const needs = world.getComponent(entity, Needs)!;
    const traits = world.getComponent(entity, Traits);
    const job = world.getComponent(entity, Job);
    const schedule = world.getComponent(entity, Schedule);
    const intensity = this.beliefIntensity(belief);

    let alignmentDelta = 0;

    // Work ethic: required/preferred work rewards working during a Work block.
    const workPrecept = this.ideology.precepts.work_ethic;
    const scheduledWork = schedule?.getActivity(this.currentHour) === 'work';
    if (scheduledWork && this.isPositiveStance(workPrecept.stance)) {
      if (job && job.type !== 'idle' && job.type !== 'wander') {
        this.addDoctrineMemory(
          social,
          'doctrine_work_compliance',
          'Worked in accordance with cult doctrine',
          2 * intensity,
          28,
        );
        alignmentDelta += 0.02;
      } else {
        this.addDoctrineMemory(
          social,
          'doctrine_work_failure',
          'Failed to live up to the cult work ethic',
          -2.5 * intensity,
          24,
        );
        alignmentDelta -= 0.025;
      }
    }

    // Community doctrine reacts to lived social connection.
    const community = this.ideology.precepts.community;
    if (this.isPositiveStance(community.stance)) {
      if (needs.social >= 70) {
        this.addDoctrineMemory(social, 'doctrine_community', 'Felt connected to the cult community', 2 * intensity, 35);
        alignmentDelta += 0.015;
      } else if (needs.social <= 25) {
        this.addDoctrineMemory(social, 'doctrine_isolation', 'Felt isolated from the cult community', -3 * intensity, 30);
        alignmentDelta -= 0.02;
      }
    }

    // Spiritual doctrine tracks faith need.
    const spirituality = this.ideology.precepts.spirituality;
    if (this.isPositiveStance(spirituality.stance)) {
      if (needs.faith >= 75) {
        this.addDoctrineMemory(social, 'doctrine_devotion', 'Felt spiritually aligned with the cult', 3 * intensity, 40);
        alignmentDelta += 0.02;
      } else if (needs.faith <= 25) {
        this.addDoctrineMemory(social, 'doctrine_doubt', 'Felt unable to meet the cult spiritual ideal', -4 * intensity, 38);
        alignmentDelta -= 0.03;
      }
    }

    const conflict = this.traitConflictScore(traits, belief);
    if (conflict < 0) {
      this.addDoctrineMemory(
        social,
        'doctrine_trait_conflict',
        'Personal nature conflicts with cult doctrine',
        -4 * Math.abs(conflict) * intensity,
        55,
      );
      alignmentDelta -= 0.025 * Math.abs(conflict);
    } else if (conflict > 0) {
      alignmentDelta += 0.015 * conflict;
    }

    belief.strength = clamp(belief.strength + alignmentDelta * dt, 0, 100);
  }

  private applyRoleEffects(world: World, dt: number): void {
    for (const [role, entityId] of Object.entries(this.ideology.roles) as [CultRoleKey, number | null][]) {
      if (entityId === null) continue;
      const needs = world.getComponent(entityId, Needs);
      const belief = world.getComponent(entityId, BeliefState);
      if (!needs || !belief) continue;

      switch (role) {
        case 'leader':
          belief.strength = clamp(belief.strength + 0.015 * dt, 0, 100);
          needs.social = clamp(needs.social + 0.015 * dt, 0, 100);
          break;
        case 'evangelist':
          needs.social = clamp(needs.social + 0.05 * dt, 0, 100);
          break;
        case 'ritual_guide':
          needs.faith = clamp(needs.faith + 0.08 * dt, 0, 100);
          break;
        case 'enforcer':
          needs.sanity = clamp(needs.sanity + 0.025 * dt, 0, 100);
          break;
      }
    }
  }

  private traitConflictScore(traits: Traits | undefined, belief: BeliefState): number {
    if (!traits) return 0;
    let score = 0;

    const work = this.ideology.precepts.work_ethic;
    if (traits.hasTrait('lazy') && this.isPositiveStance(work.stance)) score -= 1;
    if (traits.hasTrait('hardy') && this.isPositiveStance(work.stance)) score += 0.5;

    const spirituality = this.ideology.precepts.spirituality;
    if (traits.hasTrait('doubter') && this.isPositiveStance(spirituality.stance)) score -= 1.2;
    if ((traits.hasTrait('zealous') || traits.hasTrait('devoted')) &&
        this.isPositiveStance(spirituality.stance)) score += 0.8;

    const outsiders = this.ideology.precepts.outsiders;
    if (traits.hasTrait('paranoid') && this.isPositiveStance(outsiders.stance)) score -= 0.8;
    if (traits.hasTrait('charismatic') && this.isNegativeStance(outsiders.stance)) score -= 0.5;
    if (traits.hasTrait('charismatic') && this.isPositiveStance(outsiders.stance)) score += 0.4;

    // Personal value drift creates additional individualized disagreement.
    for (const category of Object.keys(this.ideology.precepts) as IdeologyCategory[]) {
      const value = belief.values[category] ?? 0;
      const stance = this.ideology.precepts[category].stance;
      const doctrineDirection = this.stanceDirection(stance);
      score += value * doctrineDirection * 0.08;
    }

    return clamp(score, -2, 2);
  }

  private addDoctrineMemory(
    social: SocialState,
    stackKey: string,
    label: string,
    mood: number,
    duration: number,
  ): void {
    if (Math.abs(mood) < 0.5) return;
    if (social.memories.some(memory => memory.stackKey === stackKey)) return;
    social.addMemory({
      id: `${stackKey}:${Date.now()}`,
      label,
      mood: Math.round(mood),
      duration,
      stackKey,
    });
  }

  private beliefIntensity(belief: BeliefState): number {
    return 0.25 + belief.strength / 100 * 0.75;
  }

  private isPositiveStance(stance: PreceptStance): boolean {
    return stance === 'required' || stance === 'preferred';
  }

  private isNegativeStance(stance: PreceptStance): boolean {
    return stance === 'disapproved' || stance === 'prohibited';
  }

  private stanceDirection(stance: PreceptStance): number {
    switch (stance) {
      case 'required': return 1;
      case 'preferred': return 0.7;
      case 'accepted': return 0.15;
      case 'disapproved': return -0.7;
      case 'prohibited': return -1;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
