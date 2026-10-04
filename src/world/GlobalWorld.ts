/**
 * GlobalWorld — lightweight strategic layer used for Alpha start selection.
 *
 * Regions are deterministic from seed. The Alpha only uses this layer to pick
 * the initial settlement, but the model intentionally leaves room for later
 * travel, routes, settlements, and multiple local maps.
 */

export type GlobalBiome =
  | 'temperate_forest'
  | 'dry_plains'
  | 'rocky_highlands'
  | 'cold_steppe';

export interface GlobalSettlement {
  id: string;
  name: string;
  x: number;
  y: number;
  population: number;
}

export interface GlobalRegion {
  id: string;
  x: number;
  y: number;
  biome: GlobalBiome;
  temperatureC: number;
  treeDensity: number;
  rockDensity: number;
  foodAvailability: number;
  outsiderTraffic: number;
  nearestSettlementId: string;
  settlementDistance: number;
  routeProximity: number;
  localSeed: number;
  waterPools: number;
  stonePatches: number;
  dirtPatches: number;
}

export interface GlobalWorld {
  seed: number;
  width: number;
  height: number;
  settlements: GlobalSettlement[];
  regions: GlobalRegion[];
}

export interface LocalWorldParameters {
  seed: number;
  width: number;
  height: number;
  waterPools: number;
  stonePatches: number;
  dirtPatches: number;
  treeDensity: number;
  rockDensity: number;
  bushDensity: number;
  flowerDensity: number;
}

const SETTLEMENT_NAMES = [
  'Ashfield', 'Bracken', 'Coldwater', 'Dunwich', 'Elder Crossing',
  'Fox Hollow', 'Grayhaven', 'Harrow', 'Ironwood', 'Juniper',
];

export function generateGlobalWorld(seed: number, width = 8, height = 6): GlobalWorld {
  const rng = makeRng(seed);
  const settlements: GlobalSettlement[] = [];
  const settlementCount = 5;

  for (let i = 0; i < settlementCount; i++) {
    settlements.push({
      id: `settlement:${i}`,
      name: SETTLEMENT_NAMES[i % SETTLEMENT_NAMES.length],
      x: Math.floor(rng() * width),
      y: Math.floor(rng() * height),
      population: 800 + Math.floor(rng() * 9200),
    });
  }

  const regions: GlobalRegion[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const localRng = makeRng(hashSeed(seed, x, y));
      const latitude = height <= 1 ? 0.5 : y / (height - 1);
      const elevation = localRng();
      const moisture = localRng();
      const baseTemp = 24 - latitude * 22 - elevation * 7 + localRng() * 4;

      const biome: GlobalBiome =
        elevation > 0.72 ? 'rocky_highlands' :
        baseTemp < 7 ? 'cold_steppe' :
        moisture < 0.34 ? 'dry_plains' :
        'temperate_forest';

      const nearest = settlements
        .map(settlement => ({
          settlement,
          distance: Math.abs(settlement.x - x) + Math.abs(settlement.y - y),
        }))
        .sort((a, b) => a.distance - b.distance)[0];

      // Alpha route approximation: routes radiate horizontally/vertically from
      // population centers. This can later be replaced by an explicit graph.
      const routeProximity = settlements.reduce((best, settlement) => {
        const axisDistance = Math.min(Math.abs(settlement.x - x), Math.abs(settlement.y - y));
        return Math.min(best, axisDistance);
      }, Math.max(width, height));

      const routeScore = clamp01(1 - routeProximity / 3);
      const settlementScore = clamp01(1 - nearest.distance / Math.max(width, height));
      const traffic = Math.round(clamp01(settlementScore * 0.72 + routeScore * 0.28) * 100);

      const biomeTree =
        biome === 'temperate_forest' ? 0.085 :
        biome === 'cold_steppe' ? 0.025 :
        biome === 'dry_plains' ? 0.018 : 0.02;
      const biomeRock =
        biome === 'rocky_highlands' ? 0.075 :
        biome === 'cold_steppe' ? 0.035 :
        biome === 'dry_plains' ? 0.028 : 0.02;
      const food =
        biome === 'temperate_forest' ? 78 :
        biome === 'dry_plains' ? 38 :
        biome === 'cold_steppe' ? 28 : 34;

      regions.push({
        id: `region:${x},${y}`,
        x,
        y,
        biome,
        temperatureC: Math.round(baseTemp),
        treeDensity: clamp(biomeTree + localRng() * 0.02, 0.005, 0.12),
        rockDensity: clamp(biomeRock + localRng() * 0.018, 0.008, 0.11),
        foodAvailability: Math.round(clamp(food + localRng() * 18 - 9, 5, 100)),
        outsiderTraffic: traffic,
        nearestSettlementId: nearest.settlement.id,
        settlementDistance: nearest.distance,
        routeProximity,
        localSeed: hashSeed(seed ^ 0x5f3759df, x, y),
        waterPools:
          biome === 'temperate_forest' ? 7 :
          biome === 'dry_plains' ? 2 :
          biome === 'cold_steppe' ? 3 : 4,
        stonePatches:
          biome === 'rocky_highlands' ? 15 :
          biome === 'dry_plains' ? 8 : 7,
        dirtPatches:
          biome === 'dry_plains' ? 16 :
          biome === 'rocky_highlands' ? 7 : 10,
      });
    }
  }

  return { seed, width, height, settlements, regions };
}

export function getGlobalRegion(world: GlobalWorld, x: number, y: number): GlobalRegion | null {
  return world.regions.find(region => region.x === x && region.y === y) ?? null;
}

export function getSettlement(world: GlobalWorld, id: string): GlobalSettlement | null {
  return world.settlements.find(settlement => settlement.id === id) ?? null;
}

export function localParametersForRegion(region: GlobalRegion): LocalWorldParameters {
  return {
    seed: region.localSeed,
    width: 64,
    height: 64,
    waterPools: region.waterPools,
    stonePatches: region.stonePatches,
    dirtPatches: region.dirtPatches,
    treeDensity: region.treeDensity,
    rockDensity: region.rockDensity,
    bushDensity: clamp(region.foodAvailability / 100 * 0.055, 0.008, 0.06),
    flowerDensity: region.biome === 'temperate_forest' ? 0.025 : 0.012,
  };
}

function hashSeed(seed: number, x: number, y: number): number {
  let value = seed | 0;
  value ^= Math.imul(x + 1, 0x45d9f3b);
  value ^= Math.imul(y + 1, 0x119de1f3);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
