/**
 * Spatial — central coordinate-space configuration and conversions.
 *
 * Alpha architecture:
 * - Global World Space: strategic start-layer (not represented numerically here yet)
 * - Local World Space: continuous world coordinates used by rendering/entities
 * - Navigation Space: discrete pathfinding cells
 * - Construction Space: fine architectural placement lattice
 *
 * Keep all cross-space conversions here so gameplay systems do not hand-roll
 * scale assumptions.
 */

export interface SpatialConfig {
  /** Number of construction cells per one local-world terrain unit. */
  constructionSubdivisions: number;
  /** Number of navigation cells per one local-world terrain unit. */
  navigationSubdivisions: number;
}

export const ALPHA_SPATIAL_CONFIG: Readonly<SpatialConfig> = Object.freeze({
  constructionSubdivisions: 10,
  navigationSubdivisions: 10,
});

export interface GridCoord {
  x: number;
  y: number;
}

export interface WorldCoord {
  x: number;
  z: number;
}

function subdivisions(value: number): number {
  return Math.max(1, Math.floor(value));
}

export function worldToConstruction(
  x: number,
  z: number,
  config: SpatialConfig = ALPHA_SPATIAL_CONFIG,
): GridCoord {
  const s = subdivisions(config.constructionSubdivisions);
  return { x: Math.floor(x * s), y: Math.floor(z * s) };
}

export function constructionToWorld(
  x: number,
  y: number,
  config: SpatialConfig = ALPHA_SPATIAL_CONFIG,
): WorldCoord {
  const s = subdivisions(config.constructionSubdivisions);
  return { x: x / s, z: y / s };
}

export function constructionCellCenterToWorld(
  x: number,
  y: number,
  config: SpatialConfig = ALPHA_SPATIAL_CONFIG,
): WorldCoord {
  const s = subdivisions(config.constructionSubdivisions);
  return { x: (x + 0.5) / s, z: (y + 0.5) / s };
}

export function constructionToTerrain(
  x: number,
  y: number,
  config: SpatialConfig = ALPHA_SPATIAL_CONFIG,
): GridCoord {
  const s = subdivisions(config.constructionSubdivisions);
  return { x: Math.floor(x / s), y: Math.floor(y / s) };
}

export function worldToNavigation(
  x: number,
  z: number,
  config: SpatialConfig = ALPHA_SPATIAL_CONFIG,
): GridCoord {
  const s = subdivisions(config.navigationSubdivisions);
  return { x: Math.floor(x * s), y: Math.floor(z * s) };
}

export function navigationToWorldCenter(
  x: number,
  y: number,
  config: SpatialConfig = ALPHA_SPATIAL_CONFIG,
): WorldCoord {
  const s = subdivisions(config.navigationSubdivisions);
  return { x: (x + 0.5) / s, z: (y + 0.5) / s };
}
