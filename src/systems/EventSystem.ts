/**
 * EventSystem — Random events that fire during gameplay.
 * Reads event definitions from data/events.json and triggers them
 * based on probability, day, and cult state.
 */

import type { World } from '../ecs/World';
import { Needs } from '../components/Needs';
import { Health } from '../components/Health';
import { FollowerAI } from '../components/FollowerAI';

export interface EventConditions {
  minFollowers?: number;
  minNotoriety?: number;
  minFaith?: number;
  minFunds?: number;
  minInfluence?: number;
  requiresTech?: string;
}

export interface EventChoice {
  label: string;
  description?: string;
  effects: Record<string, number | boolean>;
}

export interface EventDef {
  id: string;
  name: string;
  type: 'positive' | 'negative' | 'danger';
  probability: number;
  minDay: number;
  description: string;
  effects: Record<string, number | boolean>;
  conditions?: EventConditions;
  choices?: EventChoice[];
}

export interface GameEvent {
  id: string;
  name: string;
  description: string;
  type: string;
  tick: number;
}

export class EventSystem {
  private events: EventDef[];
  private firedEvents: GameEvent[] = [];
  private tickCount = 0;
  private dayCount = 1;
  private rng: () => number;
  private onEventFired?: (event: GameEvent) => void;

  constructor(events: EventDef[], seed: number = Date.now(), onEventFired?: (event: GameEvent) => void) {
    this.events = events;
    this.onEventFired = onEventFired;
    let state = seed;
    this.rng = () => {
      state = (state * 1664525 + 1013904223) | 0;
      return ((state >>> 0) % 10000) / 10000;
    };
  }

  /**
   * Update event system. Checks for events each tick.
   * Events fire stochastically based on their probability per tick.
   */
  update(world: World, dt: number): void {
    this.tickCount += dt;
    const newDay = Math.floor(this.tickCount / 1800) + 1; // 60 ticks/sec * 30 sec = 1800 ticks per day
    if (newDay > this.dayCount) {
      this.dayCount = newDay;
    }

    // Check each event
    for (const event of this.events) {
      if (this.dayCount < event.minDay) continue;

      // Roll for event trigger (probability per tick, scaled by dt)
      if (this.rng() < event.probability * dt) {
        this.fireEvent(world, event);
      }
    }
  }

  private fireEvent(world: World, event: EventDef): void {
    const gameEvent: GameEvent = {
      id: event.id,
      name: event.name,
      description: event.description,
      type: event.type,
      tick: this.tickCount,
    };

    this.firedEvents.push(gameEvent);
    this.onEventFired?.(gameEvent);

    // Apply effects
    const entities = world.query([Needs, Health, FollowerAI]);
    const affectedCount = (event.effects.affectedCount as number) ?? entities.length;
    const affected = this.pickRandom(entities, affectedCount);

    for (const entity of affected) {
      const needs = world.getComponent(entity, Needs);
      const health = world.getComponent(entity, Health);

      if (event.effects.healthDamage && health) {
        health.hp = Math.max(0, health.hp - (event.effects.healthDamage as number));
      }
      if (event.effects.faithDamage && needs) {
        needs.faith = Math.max(0, needs.faith - (event.effects.faithDamage as number));
      }
      if (event.effects.faithGain && needs) {
        needs.faith = Math.min(100, needs.faith + (event.effects.faithGain as number));
      }
      if (event.effects.moraleBoost && needs) {
        needs.fun = Math.min(100, needs.fun + (event.effects.moraleBoost as number));
        needs.sanity = Math.min(100, needs.sanity + (event.effects.moraleBoost as number / 2));
      }
      if (event.effects.influenceGain) {
        // Influence is tracked at cult level — caller handles
      }
      if (event.effects.skillBonus) {
        // Skill bonus handled at cult level
      }
    }
  }

  private pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => this.rng() - 0.5);
    return shuffled.slice(0, Math.min(count, arr.length));
  }

  getFiredEvents(): GameEvent[] {
    return [...this.firedEvents];
  }

  get day(): number {
    return this.dayCount;
  }

  get tick(): number {
    return this.tickCount;
  }

  clearHistory(): void {
    this.firedEvents = [];
  }

  reset(): void {
    this.firedEvents = [];
    this.tickCount = 0;
    this.dayCount = 1;
  }
}