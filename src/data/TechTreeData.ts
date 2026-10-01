/**
 * TechTreeData — 15-node branching tech tree across 5 branches.
 * Branches: living, exploitation, management, divine, security.
 *
 * @see docs/gameplay-design-reference.md §8 Tech Tree
 */

export type TechBranch = 'living' | 'exploitation' | 'management' | 'divine' | 'security';

export type IdeologyPath = 'eldritch' | 'peace_love' | 'futuristic';

export interface TechNode {
  id: string;
  name: string;
  branch: TechBranch;
  cost: { influence: number; faith?: number; research?: number };
  prerequisites: string[];
  unlocked: boolean;
  description: string;
  effects: {
    unlocksRoom?: string;
    unlocksObject?: string;
    maxPopulationPlus?: number;
    recruitmentBonus?: number;
    heatReductionRate?: number;
    unlockIdeology?: IdeologyPath;
  };
}

export const TECH_TREE_NODES: TechNode[] = [
  // ─── Living Conditions ───
  {
    id: 'beds_ii',
    name: 'Beds II',
    branch: 'living',
    cost: { influence: 50 },
    prerequisites: [],
    unlocked: false,
    description: 'Better beds improve rest quality and follower morale.',
    effects: { unlocksObject: 'better_bed' },
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    branch: 'living',
    cost: { influence: 80 },
    prerequisites: [],
    unlocked: false,
    description: 'Unlock the kitchen room for improved follower meals.',
    effects: { unlocksRoom: 'kitchen' },
  },
  {
    id: 'bathroom_upgrades',
    name: 'Bathroom Upgrades',
    branch: 'living',
    cost: { influence: 60 },
    prerequisites: [],
    unlocked: false,
    description: 'Better toilets and showers improve hygiene and comfort.',
    effects: { unlocksObject: 'upgraded_toilet' },
  },
  {
    id: 'recreation',
    name: 'Recreation Room',
    branch: 'living',
    cost: { influence: 100 },
    prerequisites: ['beds_ii'],
    unlocked: false,
    description: 'Unlock the recreation room to keep followers entertained.',
    effects: { unlocksRoom: 'recreation' },
  },

  // ─── Exploitation ───
  {
    id: 'treatment_ii',
    name: 'Treatment II',
    branch: 'exploitation',
    cost: { influence: 70 },
    prerequisites: [],
    unlocked: false,
    description: 'Improved follower treatments yield more income.',
    effects: { recruitmentBonus: 5 },
  },
  {
    id: 'distillery',
    name: 'Distillery',
    branch: 'exploitation',
    cost: { influence: 120 },
    prerequisites: ['treatment_ii'],
    unlocked: false,
    description: 'Unlock the distillery room for spirit production.',
    effects: { unlocksRoom: 'distillery' },
  },
  {
    id: 'propaganda_ministry',
    name: 'Ministry of Truth',
    branch: 'exploitation',
    cost: { influence: 100 },
    prerequisites: ['treatment_ii'],
    unlocked: false,
    description: 'Unlock the Ministry of Truth for propaganda generation.',
    effects: { unlocksRoom: 'ministry_of_truth' },
  },

  // ─── Cult Management ───
  {
    id: 'recruitment_ii',
    name: 'Recruitment II',
    branch: 'management',
    cost: { influence: 100 },
    prerequisites: [],
    unlocked: false,
    description: 'Increase max population by 10.',
    effects: { maxPopulationPlus: 10 },
  },
  {
    id: 'follower_education',
    name: 'Follower Education',
    branch: 'management',
    cost: { influence: 150 },
    prerequisites: ['recruitment_ii'],
    unlocked: false,
    description: 'Followers gain skills faster through education.',
    effects: { recruitmentBonus: 10 },
  },
  {
    id: 'ministry_alteration',
    name: 'Ministry of Alteration',
    branch: 'management',
    cost: { influence: 200 },
    prerequisites: ['recruitment_ii'],
    unlocked: false,
    description: 'Unlock trait removal to shape your followers.',
    effects: { unlocksRoom: 'alteration_chamber' },
  },

  // ─── Divine / Leader ───
  {
    id: 'divine_inspiration',
    name: 'Divine Inspiration',
    branch: 'divine',
    cost: { influence: 300 },
    prerequisites: [], // special: any 3 other nodes — handled in getAvailableTechs
    unlocked: false,
    description: 'Choose your ideology path and shape the endgame.',
    effects: {},
  },
  {
    id: 'eldritch_path',
    name: 'Eldritch Horror Path',
    branch: 'divine',
    cost: { influence: 500, faith: 100 },
    prerequisites: ['divine_inspiration'],
    unlocked: false,
    description: 'Unlock the Eldritch Horror endgame path.',
    effects: { unlockIdeology: 'eldritch' },
  },
  {
    id: 'peace_love_path',
    name: 'Peace & Love Path',
    branch: 'divine',
    cost: { influence: 500, faith: 100 },
    prerequisites: ['divine_inspiration'],
    unlocked: false,
    description: 'Unlock the Peace & Love endgame path.',
    effects: { unlockIdeology: 'peace_love' },
  },

  // ─── Security / PR ───
  {
    id: 'propaganda_basics',
    name: 'Propaganda Basics',
    branch: 'security',
    cost: { influence: 80 },
    prerequisites: [],
    unlocked: false,
    description: 'Reduce heat generation through basic propaganda.',
    effects: { heatReductionRate: 0.1 },
  },
  {
    id: 'mission_specialists',
    name: 'Mission Specialists',
    branch: 'security',
    cost: { influence: 120 },
    prerequisites: ['propaganda_basics'],
    unlocked: false,
    description: 'Better mission success rates.',
    effects: { recruitmentBonus: 5 },
  },
  {
    id: 'counter_intelligence',
    name: 'Counter Intelligence',
    branch: 'security',
    cost: { influence: 150 },
    prerequisites: ['propaganda_basics'],
    unlocked: false,
    description: 'Slower notoriety growth through counter-intelligence.',
    effects: { heatReductionRate: 0.2 },
  },
];

// ─── Helpers ───

/**
 * Get a tech node by id.
 */
export function getTechNode(id: string): TechNode | undefined {
  return TECH_TREE_NODES.find(n => n.id === id);
}

/**
 * Returns nodes whose prerequisites are all met (and not yet unlocked).
 * Handles the special case of `divine_inspiration` which requires any 3 other nodes.
 */
export function getAvailableTechs(unlockedIds: string[]): TechNode[] {
  const unlockedSet = new Set(unlockedIds);

  return TECH_TREE_NODES.filter(node => {
    if (unlockedSet.has(node.id)) return false;

    if (node.id === 'divine_inspiration') {
      // Special: requires any 3 other nodes unlocked (excluding divine branch siblings)
      const otherUnlocked = unlockedIds.filter(id => id !== 'divine_inspiration');
      return otherUnlocked.length >= 3;
    }

    if (node.prerequisites.length === 0) return true;
    return node.prerequisites.every(prereq => unlockedSet.has(prereq));
  });
}

/**
 * Group nodes by branch.
 */
export function getTechBranches(): Record<TechBranch, TechNode[]> {
  const branches: Record<TechBranch, TechNode[]> = {
    living: [],
    exploitation: [],
    management: [],
    divine: [],
    security: [],
  };

  for (const node of TECH_TREE_NODES) {
    branches[node.branch].push(node);
  }

  return branches;
}