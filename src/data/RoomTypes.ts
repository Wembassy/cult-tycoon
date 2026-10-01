/**
 * RoomTypeDefinition — Static data for each room type in the game.
 *
 * Each room type defines:
 *  - Cost to build (money, faith, influence)
 *  - Minimum size requirements
 *  - Research prerequisites (tech tree unlocks)
 *  - Base prestige level (before decor)
 *  - Job slots (which jobs can be assigned and how many cultists)
 *  - Needs provided (which cultist needs are satisfied and at what rate)
 *
 * Refer to docs/gameplay-design-reference.md §7 Rooms for design details.
 */

export type RoomCategory =
  | 'basic'
  | 'living'
  | 'exploitation'
  | 'research'
  | 'security';

export interface RoomTypeDefinition {
  /** Unique identifier, used as the RoomType key */
  id: string;
  /** Display name shown in UI */
  name: string;
  /** Category for grouping/filtering in the build menu */
  category: RoomCategory;
  /** Minimum room dimensions (in tiles) required to place this room type */
  minSize: { w: number; h: number };
  /** Resource costs to construct */
  cost: { money: number; faith?: number; influence?: number };
  /** Tech tree node ID that must be researched before this room can be built */
  researchRequired?: string;
  /** Base prestige level (decor adds on top of this) */
  basePrestige: number;
  /** Jobs available in this room and their capacity */
  jobSlots: { job: string; capacity: number }[];
  /** Cultist needs satisfied by being in this room (per tick rate) */
  needsProvided: { need: string; rate: number }[];
  /** Description for the build menu / encyclopedia */
  description: string;
}

// ─── MVP Room Definitions ──────────────────────────────────────

export const ROOM_TYPES: Record<string, RoomTypeDefinition> = {
  lobby: {
    id: 'lobby',
    name: 'Lobby',
    category: 'basic',
    minSize: { w: 3, h: 3 },
    cost: { money: 100 },
    basePrestige: 0,
    jobSlots: [{ job: 'recruitment', capacity: 2 }],
    needsProvided: [],
    description:
      'The entrance to your compound. Followers arrive here and can be recruited as cultists.',
  },

  temple: {
    id: 'temple',
    name: 'Temple',
    category: 'exploitation',
    minSize: { w: 4, h: 4 },
    cost: { money: 300, faith: 20 },
    basePrestige: 2,
    jobSlots: [{ job: 'pray', capacity: 4 }],
    needsProvided: [{ need: 'faith', rate: 2.0 }],
    description:
      'A sacred space for sermons and prayer. Cultists working here generate faith and satisfy their own spiritual needs.',
  },

  kitchen: {
    id: 'kitchen',
    name: 'Kitchen',
    category: 'living',
    minSize: { w: 3, h: 3 },
    cost: { money: 250 },
    researchRequired: 'kitchen',
    basePrestige: 1,
    jobSlots: [{ job: 'cook', capacity: 2 }],
    needsProvided: [{ need: 'hunger', rate: 5.0 }],
    description:
      'A proper kitchen for cooking meals. Far more efficient than vending machines. Requires the Kitchen tech.',
  },

  canteen: {
    id: 'canteen',
    name: 'Canteen',
    category: 'living',
    minSize: { w: 3, h: 3 },
    cost: { money: 150 },
    basePrestige: 1,
    jobSlots: [],
    needsProvided: [{ need: 'hunger', rate: 3.0 }],
    description:
      'A dining area where cultists eat. Initially equipped with vending machines; upgrade with a kitchen for better food.',
  },

  bedroom: {
    id: 'bedroom',
    name: 'Bedroom',
    category: 'living',
    minSize: { w: 3, h: 3 },
    cost: { money: 200 },
    basePrestige: 1,
    jobSlots: [],
    needsProvided: [{ need: 'energy', rate: 10.0 }],
    description:
      'A room with beds for cultists to sleep in. Each bed is assigned to a specific cultist. Restores energy over time.',
  },

  bathroom: {
    id: 'bathroom',
    name: 'Bathroom',
    category: 'living',
    minSize: { w: 2, h: 2 },
    cost: { money: 150 },
    basePrestige: 0,
    jobSlots: [],
    needsProvided: [
      { need: 'bladder', rate: 8.0 },
      { need: 'hygiene', rate: 4.0 },
    ],
    description:
      'Toilets and showers for cultists. Starts with buckets and can be upgraded with research. Satisfies bladder and hygiene needs.',
  },

  research_office: {
    id: 'research_office',
    name: 'Research Office',
    category: 'research',
    minSize: { w: 3, h: 3 },
    cost: { money: 400, influence: 10 },
    basePrestige: 1,
    jobSlots: [{ job: 'research', capacity: 4 }],
    needsProvided: [],
    description:
      'A workspace for cultists to generate research points. Research can be performed during any shift, including night.',
  },

  recreation_room: {
    id: 'recreation_room',
    name: 'Recreation Room',
    category: 'living',
    minSize: { w: 3, h: 3 },
    cost: { money: 300 },
    researchRequired: 'recreation',
    basePrestige: 2,
    jobSlots: [],
    needsProvided: [{ need: 'fun', rate: 5.0 }],
    description:
      'A room for relaxation with games, vinyl, and board games. Restores the fun stat. Requires the Recreation tech.',
  },
};

// ─── Helper Functions ──────────────────────────────────────────

/**
 * Get a room type definition by its ID.
 * @param id The room type identifier (e.g. 'lobby', 'temple')
 * @returns The RoomTypeDefinition, or undefined if not found
 */
export function getRoomType(id: string): RoomTypeDefinition | undefined {
  return ROOM_TYPES[id];
}