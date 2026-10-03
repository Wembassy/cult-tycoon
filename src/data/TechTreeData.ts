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
    foodBonus?: number;
    donationBonus?: number;
    influenceBonus?: number;
    recoveryBonus?: number;
    missionSuccessBonus?: number;
    missionRewardBonus?: number;
  };
}

export const TECH_TREE_NODES: TechNode[] = [
  // ─── Living Conditions ───
  {
    id: 'beds_ii',
    name: 'Bunk Beds',
    branch: 'living',
    cost: { influence: 50 },
    prerequisites: [],
    unlocked: false,
    description: 'Unlock two-person bunk beds and improve recovery by 10%.',
    effects: { unlocksObject: 'bunk_bed', recoveryBonus: 0.1 },
  },
  {
    id: 'kitchen',
    name: 'Efficient Kitchens',
    branch: 'living',
    cost: { influence: 80 },
    prerequisites: [],
    unlocked: false,
    description: 'Unlock the large cauldron. Cooks produce 25% more food.',
    effects: { unlocksObject: 'cauldron', foodBonus: 0.25 },
  },
  {
    id: 'bathroom_upgrades',
    name: 'Comfort & Care',
    branch: 'living',
    cost: { influence: 60 },
    prerequisites: [],
    unlocked: false,
    description: 'Improve recovery at all facilities by another 15%.',
    effects: { recoveryBonus: 0.15 },
  },
  {
    id: 'recreation',
    name: 'Peaceful Gardens',
    branch: 'living',
    cost: { influence: 100 },
    prerequisites: ['beds_ii'],
    unlocked: false,
    description: 'Unlock the Zen Garden; improve recovery by another 15%.',
    effects: { unlocksObject: 'zen_garden', recoveryBonus: 0.15 },
  },

  // ─── Exploitation ───
  {
    id: 'treatment_ii',
    name: 'Supporter Outreach',
    branch: 'exploitation',
    cost: { influence: 70 },
    prerequisites: [],
    unlocked: false,
    description: 'Supporter donations increase by 25%.',
    effects: { donationBonus: 0.25 },
  },
  {
    id: 'distillery',
    name: 'Communal Harvest',
    branch: 'exploitation',
    cost: { influence: 120 },
    prerequisites: ['treatment_ii'],
    unlocked: false,
    description: 'Unlock the farm plot; cooks produce another 25% more food.',
    effects: { unlocksObject: 'farm_plot', foodBonus: 0.25 },
  },
  {
    id: 'propaganda_ministry',
    name: 'Public Relations',
    branch: 'exploitation',
    cost: { influence: 100 },
    prerequisites: ['treatment_ii'],
    unlocked: false,
    description: 'Mission rewards increase by 20%.',
    effects: { missionRewardBonus: 0.2 },
  },

  // ─── Cult Management ───
  {
    id: 'recruitment_ii',
    name: 'Recruitment Network',
    branch: 'management',
    cost: { influence: 100 },
    prerequisites: [],
    unlocked: false,
    description: 'Increase population capacity by 10. Applicants still need beds.',
    effects: { maxPopulationPlus: 10 },
  },
  {
    id: 'follower_education',
    name: 'Shared Learning',
    branch: 'management',
    cost: { influence: 150 },
    prerequisites: ['recruitment_ii'],
    unlocked: false,
    description: 'Unlock the library shelf. Researchers produce 30% more influence.',
    effects: { unlocksObject: 'library_shelf', influenceBonus: 0.3 },
  },
  {
    id: 'ministry_alteration',
    name: 'Community Endowment',
    branch: 'management',
    cost: { influence: 200 },
    prerequisites: ['recruitment_ii'],
    unlocked: false,
    description: 'Supporter donations increase by a further 50%.',
    effects: { donationBonus: 0.5 },
  },

  // ─── Divine / Leader ───
  {
    id: 'divine_inspiration',
    name: 'Divine Inspiration',
    branch: 'divine',
    cost: { influence: 180 },
    prerequisites: [], // special: any 3 other nodes — handled in getAvailableTechs
    unlocked: false,
    description:
      'After three discoveries, unlock the Ascension ritual. It requires eight followers, three completed missions, and a functional Ritual Room.',
    effects: {},
  },
  {
    id: 'eldritch_path',
    name: 'Forbidden Knowledge',
    branch: 'divine',
    cost: { influence: 250, faith: 70 },
    prerequisites: ['divine_inspiration'],
    unlocked: false,
    description:
      'Choose a doctrine: researchers produce 50% more influence. Excludes Peace & Love.',
    effects: { unlockIdeology: 'eldritch', influenceBonus: 0.5 },
  },
  {
    id: 'peace_love_path',
    name: 'Peace & Love',
    branch: 'divine',
    cost: { influence: 250, faith: 70 },
    prerequisites: ['divine_inspiration'],
    unlocked: false,
    description:
      'Choose a doctrine: improve need recovery by 35%, and reduce heat slowly. Excludes Forbidden Knowledge.',
    effects: { unlockIdeology: 'peace_love', recoveryBonus: 0.35, heatReductionRate: 0.006 },
  },

  // ─── Security / PR ───
  {
    id: 'propaganda_basics',
    name: 'Good Neighbors',
    branch: 'security',
    cost: { influence: 80 },
    prerequisites: [],
    unlocked: false,
    description: 'Community outreach removes 0.6 heat per minute.',
    effects: { heatReductionRate: 0.01 },
  },
  {
    id: 'mission_specialists',
    name: 'Mission Specialists',
    branch: 'security',
    cost: { influence: 120 },
    prerequisites: ['propaganda_basics'],
    unlocked: false,
    description: 'Improve mission success probability by 15 percentage points.',
    effects: { missionSuccessBonus: 0.15 },
  },
  {
    id: 'counter_intelligence',
    name: 'Discretion',
    branch: 'security',
    cost: { influence: 150 },
    prerequisites: ['propaganda_basics'],
    unlocked: false,
    description: 'Remove another 0.9 heat per minute.',
    effects: { heatReductionRate: 0.015 },
  },
];

// ─── Helpers ───

/**
 * Get a tech node by id.
 */
export function getTechNode(id: string): TechNode | undefined {
  return TECH_TREE_NODES.find((n) => n.id === id);
}

/**
 * Returns nodes whose prerequisites are all met (and not yet unlocked).
 * Handles the special case of `divine_inspiration` which requires any 3 other nodes.
 */
export function getAvailableTechs(unlockedIds: string[]): TechNode[] {
  const unlockedSet = new Set(unlockedIds);

  return TECH_TREE_NODES.filter((node) => {
    if (unlockedSet.has(node.id)) return false;
    if (node.id === 'eldritch_path' && unlockedSet.has('peace_love_path')) return false;
    if (node.id === 'peace_love_path' && unlockedSet.has('eldritch_path')) return false;

    if (node.id === 'divine_inspiration') {
      // Special: requires any 3 other nodes unlocked (excluding divine branch siblings)
      const otherUnlocked = unlockedIds.filter((id) => id !== 'divine_inspiration');
      return otherUnlocked.length >= 3;
    }

    if (node.prerequisites.length === 0) return true;
    return node.prerequisites.every((prereq) => unlockedSet.has(prereq));
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
/** Premium furniture is unlocked through discoveries, not just hidden in the UI. */
export function requiredTechForObject(id: string): TechNode | undefined {
  return TECH_TREE_NODES.find((node) => node.effects.unlocksObject === id);
}
