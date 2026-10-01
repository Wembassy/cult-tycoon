export type QualityTier = 'very_poor' | 'poor' | 'average' | 'good' | 'very_good' | 'incredible';

export const TIER_LEVEL_CAPS: Record<QualityTier, number> = {
  very_poor: 3,
  poor: 5,
  average: 7,
  good: 9,
  very_good: 12,
  incredible: 15,
};

export const TIER_FAITH_COST: Record<QualityTier, number> = {
  very_poor: 5,
  poor: 10,
  average: 20,
  good: 40,
  very_good: 75,
  incredible: 120,
};

export const TIER_SKILL_RANGE: Record<QualityTier, [number, number]> = {
  very_poor: [1, 2],
  poor: [1, 3],
  average: [2, 4],
  good: [3, 5],
  very_good: [4, 6],
  incredible: [5, 8],
};

export const ALL_TIERS: QualityTier[] = [
  'very_poor',
  'poor',
  'average',
  'good',
  'very_good',
  'incredible',
];