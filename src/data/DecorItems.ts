/**
 * DecorItems — Static definitions for all room decor items.
 *
 * Each decor item has a prestige value and a cost (money).
 * Ornaments are special: cost 0, only obtainable from missions.
 *
 * See: docs/gameplay-design-reference.md §12 Prestige System
 */

export interface DecorItemDefinition {
  id: string;
  name: string;
  prestigeValue: number;
  cost: number;
  missionOnly: boolean;
}

export const DECOR_ITEMS: Record<string, DecorItemDefinition> = {
  rug: {
    id: 'rug',
    name: 'Rug',
    prestigeValue: 2,
    cost: 10,
    missionOnly: false,
  },
  plant: {
    id: 'plant',
    name: 'Plant',
    prestigeValue: 3,
    cost: 15,
    missionOnly: false,
  },
  lamp: {
    id: 'lamp',
    name: 'Lamp',
    prestigeValue: 2,
    cost: 8,
    missionOnly: false,
  },
  painting: {
    id: 'painting',
    name: 'Painting',
    prestigeValue: 5,
    cost: 25,
    missionOnly: false,
  },
  statue: {
    id: 'statue',
    name: 'Statue',
    prestigeValue: 8,
    cost: 50,
    missionOnly: false,
  },
  ornament: {
    id: 'ornament',
    name: 'Ornament',
    prestigeValue: 12,
    cost: 0,
    missionOnly: true,
  },
  candle_set: {
    id: 'candle_set',
    name: 'Candle Set',
    prestigeValue: 4,
    cost: 12,
    missionOnly: false,
  },
  bookshelf: {
    id: 'bookshelf',
    name: 'Bookshelf',
    prestigeValue: 6,
    cost: 30,
    missionOnly: false,
  },
};

/**
 * Get a decor item definition by its ID.
 * @param id The decor item identifier (e.g. 'rug', 'plant')
 * @returns The DecorItemDefinition, or undefined if not found
 */
export function getDecorItem(id: string): DecorItemDefinition | undefined {
  return DECOR_ITEMS[id];
}