/**
 * Cult ideology domain model.
 *
 * Ideology is a ruleset that can alter follower mood, belief, roles, and later
 * recruitment/ritual behavior. Keep it independent from UI so start-game setup
 * and doctrine evolution can both edit the same data.
 */

export type IdeologyCategory =
  | 'work_ethic'
  | 'wealth'
  | 'food'
  | 'relationships'
  | 'community'
  | 'authority'
  | 'violence'
  | 'outsiders'
  | 'nature'
  | 'comfort'
  | 'ritual'
  | 'spirituality';

export type PreceptStance =
  | 'required'
  | 'preferred'
  | 'accepted'
  | 'disapproved'
  | 'prohibited';

export interface IdeologyPrecept {
  category: IdeologyCategory;
  principle: string;
  label: string;
  stance: PreceptStance;
}

export type CultRoleKey = 'leader' | 'evangelist' | 'ritual_guide' | 'enforcer';

export interface CultRoleAssignment {
  role: CultRoleKey;
  entityId: number | null;
}

export interface CultIdeology {
  id: string;
  name: string;
  coreBeliefs: string[];
  precepts: Record<IdeologyCategory, IdeologyPrecept>;
  roles: Record<CultRoleKey, number | null>;
  rituals: string[];
  doctrinePoints: number;
}

export type IdeologyFoundation = 'communal_devotion' | 'ascetic_order';

const PRECEPTS_COMMUNAL: Record<IdeologyCategory, IdeologyPrecept> = {
  work_ethic: { category: 'work_ethic', principle: 'shared_labor', label: 'Shared labor is sacred', stance: 'preferred' },
  wealth: { category: 'wealth', principle: 'shared_wealth', label: 'Resources belong to the community', stance: 'preferred' },
  food: { category: 'food', principle: 'communal_meals', label: 'Proper communal meals matter', stance: 'preferred' },
  relationships: { category: 'relationships', principle: 'free_bonds', label: 'Personal bonds are accepted', stance: 'accepted' },
  community: { category: 'community', principle: 'collective_life', label: 'The community comes first', stance: 'required' },
  authority: { category: 'authority', principle: 'guiding_leader', label: 'A leader guides rather than dominates', stance: 'preferred' },
  violence: { category: 'violence', principle: 'avoid_violence', label: 'Violence should be avoided', stance: 'disapproved' },
  outsiders: { category: 'outsiders', principle: 'welcome_converts', label: 'Outsiders should be welcomed and converted', stance: 'preferred' },
  nature: { category: 'nature', principle: 'stewardship', label: 'Nature should be respected', stance: 'accepted' },
  comfort: { category: 'comfort', principle: 'modest_comfort', label: 'Modest comfort is healthy', stance: 'accepted' },
  ritual: { category: 'ritual', principle: 'shared_ritual', label: 'Ritual binds the community', stance: 'required' },
  spirituality: { category: 'spirituality', principle: 'devotion', label: 'Spiritual devotion is central', stance: 'required' },
};

const PRECEPTS_ASCETIC: Record<IdeologyCategory, IdeologyPrecept> = {
  work_ethic: { category: 'work_ethic', principle: 'discipline', label: 'Discipline through labor', stance: 'required' },
  wealth: { category: 'wealth', principle: 'reject_excess', label: 'Material excess corrupts', stance: 'disapproved' },
  food: { category: 'food', principle: 'simple_food', label: 'Simple food is virtuous', stance: 'preferred' },
  relationships: { category: 'relationships', principle: 'restrained_bonds', label: 'Personal attachments must not weaken duty', stance: 'disapproved' },
  community: { category: 'community', principle: 'ordered_collective', label: 'The group serves the doctrine', stance: 'preferred' },
  authority: { category: 'authority', principle: 'strict_hierarchy', label: 'Hierarchy must be obeyed', stance: 'required' },
  violence: { category: 'violence', principle: 'defensive_force', label: 'Force is acceptable in defense of the order', stance: 'accepted' },
  outsiders: { category: 'outsiders', principle: 'skeptical_outsiders', label: 'Outsiders must prove themselves', stance: 'disapproved' },
  nature: { category: 'nature', principle: 'austere_nature', label: 'Harsh nature purifies', stance: 'preferred' },
  comfort: { category: 'comfort', principle: 'reject_luxury', label: 'Luxury weakens devotion', stance: 'disapproved' },
  ritual: { category: 'ritual', principle: 'formal_ritual', label: 'Ritual discipline is mandatory', stance: 'required' },
  spirituality: { category: 'spirituality', principle: 'absolute_devotion', label: 'Doubt must be overcome', stance: 'required' },
};

export function createIdeologyFoundation(foundation: IdeologyFoundation): CultIdeology {
  if (foundation === 'ascetic_order') {
    return {
      id: 'ascetic_order',
      name: 'The Ascetic Order',
      coreBeliefs: ['Discipline', 'Sacrifice', 'Hierarchy'],
      precepts: clonePrecepts(PRECEPTS_ASCETIC),
      roles: { leader: null, evangelist: null, ritual_guide: null, enforcer: null },
      rituals: ['gathering', 'devotion'],
      doctrinePoints: 0,
    };
  }

  return {
    id: 'communal_devotion',
    name: 'The Communal Path',
    coreBeliefs: ['Community', 'Devotion', 'Shared Purpose'],
    precepts: clonePrecepts(PRECEPTS_COMMUNAL),
    roles: { leader: null, evangelist: null, ritual_guide: null, enforcer: null },
    rituals: ['gathering', 'devotion'],
    doctrinePoints: 0,
  };
}

export function cloneIdeology(ideology: CultIdeology): CultIdeology {
  return {
    ...ideology,
    coreBeliefs: [...ideology.coreBeliefs],
    precepts: clonePrecepts(ideology.precepts),
    roles: { ...ideology.roles },
    rituals: [...ideology.rituals],
  };
}

function clonePrecepts(
  precepts: Record<IdeologyCategory, IdeologyPrecept>,
): Record<IdeologyCategory, IdeologyPrecept> {
  return Object.fromEntries(
    Object.entries(precepts).map(([key, value]) => [key, { ...value }]),
  ) as Record<IdeologyCategory, IdeologyPrecept>;
}
