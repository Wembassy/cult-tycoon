/**
 * Prestige — Room decor component.
 *
 * Attached to room entities. Tracks the calculated prestige level,
 * the expected level (set based on cultist tiers using the room),
 * and the decor items placed in the room.
 *
 * See: docs/gameplay-design-reference.md §12 Prestige System
 */

import type { Component } from '../ecs/Component';

export interface DecorItem {
  id: string;
  name: string;
  prestigeValue: number;
  position: { x: number; y: number };
}

export class Prestige implements Component {
  constructor(public readonly entity: number) {}

  /** Calculated prestige level (base + decor). */
  level: number = 0;

  /** Expected prestige level by cultists using this room (based on their tier). */
  expectedLevel: number = 1;

  /** Decor items placed in this room. */
  decorItems: DecorItem[] = [];
}