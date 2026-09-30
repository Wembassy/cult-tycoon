/**
 * WorldGen — Basic terrain generation for the game world.
 * Generates a flat grid with biome patches (grass dominant, with dirt, stone, and water features).
 */

import { TileMap, TerrainType } from './TileMap';

export interface WorldGenConfig {
  width: number;
  height: number;
  waterPools: number;
  stonePatches: number;
  dirtPatches: number;
  seed: number;
}

export class WorldGen {
  private rng: () => number;
  private seedValue: number;

  constructor(seed: number = Date.now()) {
    this.seedValue = seed;
    let state = seed;
    this.rng = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /**
   * Generate a world with the given configuration.
   * Default: 32x32 grid, mostly grass with scattered biome patches.
   */
  generate(config: Partial<WorldGenConfig> = {}): TileMap {
    const {
      width = 32,
      height = 32,
      waterPools = 2,
      stonePatches = 3,
      dirtPatches = 4,
    } = config;

    // Use the seed from config if provided, otherwise use constructor seed
    const seed = config.seed ?? this.seedValue;
    const map = new TileMap(width, height);
    const gen = new WorldGen(seed);

    // Generate water pools
    for (let i = 0; i < waterPools; i++) {
      gen.drawBlob(map, Math.floor(gen.rng() * width), Math.floor(gen.rng() * height), 2 + Math.floor(gen.rng() * 2), 'water');
    }

    // Generate stone patches
    for (let i = 0; i < stonePatches; i++) {
      gen.drawBlob(map, Math.floor(gen.rng() * width), Math.floor(gen.rng() * height), 1 + Math.floor(gen.rng() * 2), 'stone');
    }

    // Generate dirt patches
    for (let i = 0; i < dirtPatches; i++) {
      gen.drawBlob(map, Math.floor(gen.rng() * width), Math.floor(gen.rng() * height), 1 + Math.floor(gen.rng() * 3), 'dirt');
    }

    return map;
  }

  private drawBlob(map: TileMap, cx: number, cy: number, radius: number, terrain: TerrainType): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius + this.rng() * 0.5) {
          map.setTerrain(cx + dx, cy + dy, terrain);
        }
      }
    }
  }
}