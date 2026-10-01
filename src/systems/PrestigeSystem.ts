/**
 * PrestigeSystem — Manages room prestige levels and mood effects.
 *
 * Room prestige = base room prestige + sum of decor item prestige values.
 * Cultists expect prestige matching their tier. If the room's prestige is
 * below their expected level, they suffer mood penalties (fun/sanity drop).
 * If the room's prestige is above, they get a mood boost (fun increase).
 *
 * See: docs/gameplay-design-reference.md §12 Prestige System
 */

import type { World } from '../ecs/World';
import { Prestige } from '../components/Prestige';
import { FollowerAI } from '../components/FollowerAI';
import { Needs } from '../components/Needs';
import { getDecorItem } from '../data/DecorItems';
import type { QualityTier } from '../components/CultistTier';

/** Maps cultist quality tier → expected prestige level. */
const TIER_EXPECTED_PRESTIGE: Record<QualityTier, number> = {
  very_poor: 1,
  poor: 2,
  average: 3,
  good: 4,
  very_good: 5,
  incredible: 6,
};

/** Per-tick penalty per point below expected prestige. */
const MOOD_PENALTY_PER_POINT = 0.1;
/** Per-tick boost per point above expected prestige. */
const MOOD_BOOST_PER_POINT = 0.05;

export class PrestigeSystem {
  /**
   * Main update: process all rooms with Prestige components and apply
   * mood effects to cultists currently occupying those rooms.
   */
  update(world: World, dt: number): void {
    const rooms = world.query([Prestige]);

    for (const roomEntity of rooms) {
      const prestige = world.getComponent(roomEntity, Prestige)!;

      // Find all cultists whose roomEntityId matches this room
      const cultists = world.query([FollowerAI, Needs]);
      for (const cultistEntity of cultists) {
        const ai = world.getComponent(cultistEntity, FollowerAI)!;
        if (ai.roomEntityId !== roomEntity) continue;

        const needs = world.getComponent(cultistEntity, Needs)!;
        const expected = TIER_EXPECTED_PRESTIGE[ai.tier] ?? 1;

        if (prestige.level < expected) {
          // Penalty: reduce fun and sanity
          const deficit = expected - prestige.level;
          needs.fun = clamp(needs.fun - MOOD_PENALTY_PER_POINT * deficit * dt, 0, 100);
          needs.sanity = clamp(needs.sanity - MOOD_PENALTY_PER_POINT * deficit * dt, 0, 100);
        } else if (prestige.level > expected) {
          // Boost: increase fun
          const surplus = prestige.level - expected;
          needs.fun = clamp(needs.fun + MOOD_BOOST_PER_POINT * surplus * dt, 0, 100);
        }
      }
    }
  }

  /**
   * Add a decor item to a room and recalculate its prestige level.
   * @returns true if the decor was added successfully
   */
  addDecor(world: World, roomEntity: number, decorId: string): boolean {
    const prestige = world.getComponent(roomEntity, Prestige);
    if (!prestige) return false;

    const def = getDecorItem(decorId);
    if (!def) return false;

    prestige.decorItems.push({
      id: def.id,
      name: def.name,
      prestigeValue: def.prestigeValue,
      position: { x: 0, y: 0 },
    });

    this.recalculate(world, roomEntity);
    return true;
  }

  /**
   * Remove a decor item from a room by its decor ID and recalculate.
   * Removes only the first matching instance.
   * @returns true if a decor item was removed
   */
  removeDecor(world: World, roomEntity: number, decorId: string): boolean {
    const prestige = world.getComponent(roomEntity, Prestige);
    if (!prestige) return false;

    const idx = prestige.decorItems.findIndex((d) => d.id === decorId);
    if (idx === -1) return false;

    prestige.decorItems.splice(idx, 1);
    this.recalculate(world, roomEntity);
    return true;
  }

  /**
   * Recalculate a room's prestige level.
   * prestige = base room prestige + sum of decor item prestige values.
   * The base prestige comes from the room type definition.
   */
  recalculate(world: World, roomEntity: number): void {
    const prestige = world.getComponent(roomEntity, Prestige);
    if (!prestige) return;

    // Base prestige from the room type (stored on the Prestige component
    // as `baseLevel` — set when the room entity is created). If not set,
    // default to 0.
    const base = (prestige as Prestige & { baseLevel?: number }).baseLevel ?? 0;
    const decorSum = prestige.decorItems.reduce((sum, d) => sum + d.prestigeValue, 0);
    prestige.level = base + decorSum;
  }

  /**
   * Get the expected prestige level for a given cultist tier.
   */
  getExpectedPrestige(tier: QualityTier): number {
    return TIER_EXPECTED_PRESTIGE[tier] ?? 1;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}