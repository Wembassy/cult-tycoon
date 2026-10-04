/**
 * NavigationGrid — fine pathfinding state independent from terrain/build storage.
 *
 * Navigation Space is a 10x raster over the legacy local simulation coordinates.
 * Follower Transform.x/y still use tile-center logical coordinates (tile 0 center
 * is x=0), while construction edges use tile-boundary coordinates (tile 0 spans
 * construction x=0..10). Conversion helpers below account for that half-tile
 * legacy offset explicitly.
 */

import { TileMap } from './TileMap';
import { ALPHA_SPATIAL_CONFIG, type SpatialConfig } from './Spatial';
import type { ConstructionOrientation } from '../systems/BuildingSystem';

export type NavigationBlockerSource = string;

export class NavigationGrid {
  private readonly blockers = new Map<string, Set<NavigationBlockerSource>>();
  private readonly blockedEdges = new Map<string, Set<NavigationBlockerSource>>();
  readonly subdivisions: number;

  constructor(
    private readonly map: TileMap,
    config: SpatialConfig = ALPHA_SPATIAL_CONFIG,
  ) {
    this.subdivisions = Math.max(1, Math.floor(config.navigationSubdivisions));
  }

  /** Fine Navigation Space dimensions. */
  get width(): number { return this.map.width * this.subdivisions; }
  get height(): number { return this.map.height * this.subdivisions; }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /** Convert legacy continuous follower/simulation coordinates to Navigation Space. */
  localToNav(x: number, y: number): { x: number; y: number } {
    return {
      x: this.clampX(Math.floor((x + 0.5) * this.subdivisions)),
      y: this.clampY(Math.floor((y + 0.5) * this.subdivisions)),
    };
  }

  /** Convert a Navigation cell center back to legacy continuous follower coordinates. */
  navToLocalCenter(x: number, y: number): { x: number; y: number } {
    return {
      x: (x + 0.5) / this.subdivisions - 0.5,
      y: (y + 0.5) / this.subdivisions - 0.5,
    };
  }

  /** Fine-cell walkability used by Pathfinder. */
  isNavWalkable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    const terrainX = Math.floor(x / this.subdivisions);
    const terrainY = Math.floor(y / this.subdivisions);
    const tile = this.map.getTile(terrainX, terrainY);
    if (!tile || tile.terrain === 'water') return false;

    // World-space obstacles remain coarse for the moment. They are deliberately
    // independent from building occupancy and can become local obstacle shapes later.
    if (tile.decor === 'tree' || tile.decor === 'rock') return false;

    return !this.blockers.has(this.key(x, y));
  }

  /** Compatibility/local-space query at the center of a terrain tile. */
  isWalkable(x: number, y: number): boolean {
    const nav = this.localToNav(x, y);
    return this.isNavWalkable(nav.x, nav.y);
  }

  /**
   * Block an entire legacy local terrain cell. This keeps tests/world obstacles
   * readable while the pathfinder itself operates on fine Navigation cells.
   */
  addBlocker(x: number, y: number, source: NavigationBlockerSource): void {
    const baseX = Math.floor(x) * this.subdivisions;
    const baseY = Math.floor(y) * this.subdivisions;
    for (let ny = baseY; ny < baseY + this.subdivisions; ny++) {
      for (let nx = baseX; nx < baseX + this.subdivisions; nx++) {
        this.addNavBlocker(nx, ny, source);
      }
    }
  }

  removeBlocker(x: number, y: number, source: NavigationBlockerSource): void {
    const baseX = Math.floor(x) * this.subdivisions;
    const baseY = Math.floor(y) * this.subdivisions;
    for (let ny = baseY; ny < baseY + this.subdivisions; ny++) {
      for (let nx = baseX; nx < baseX + this.subdivisions; nx++) {
        this.removeNavBlocker(nx, ny, source);
      }
    }
  }

  addNavBlocker(x: number, y: number, source: NavigationBlockerSource): void {
    if (!this.isInBounds(x, y)) return;
    const key = this.key(x, y);
    let sources = this.blockers.get(key);
    if (!sources) {
      sources = new Set();
      this.blockers.set(key, sources);
    }
    sources.add(source);
  }

  removeNavBlocker(x: number, y: number, source: NavigationBlockerSource): void {
    const key = this.key(x, y);
    const sources = this.blockers.get(key);
    if (!sources) return;
    sources.delete(source);
    if (sources.size === 0) this.blockers.delete(key);
  }

  clearBlockersAt(x: number, y: number): void {
    const baseX = Math.floor(x) * this.subdivisions;
    const baseY = Math.floor(y) * this.subdivisions;
    for (let ny = baseY; ny < baseY + this.subdivisions; ny++) {
      for (let nx = baseX; nx < baseX + this.subdivisions; nx++) {
        this.blockers.delete(this.key(nx, ny));
      }
    }
  }

  clearDynamicBlockers(): void {
    this.blockers.clear();
    this.blockedEdges.clear();
  }

  hasDynamicBlocker(x: number, y: number): boolean {
    const baseX = Math.floor(x) * this.subdivisions;
    const baseY = Math.floor(y) * this.subdivisions;
    for (let ny = baseY; ny < baseY + this.subdivisions; ny++) {
      for (let nx = baseX; nx < baseX + this.subdivisions; nx++) {
        if (this.blockers.has(this.key(nx, ny))) return true;
      }
    }
    return false;
  }

  /**
   * Block traversal across a construction edge. Alpha currently uses the same
   * subdivision count for Construction and Navigation Space (10x), so every
   * construction wall segment maps exactly to one navigation transition.
   */
  addConstructionEdge(
    x: number,
    y: number,
    orientation: ConstructionOrientation,
    constructionSubdivisions: number,
    source: NavigationBlockerSource,
  ): void {
    for (const edge of this.mapConstructionEdgeToNavigation(x, y, orientation, constructionSubdivisions)) {
      this.addNavEdge(edge.x, edge.y, edge.orientation, source);
    }
  }

  removeConstructionEdge(
    x: number,
    y: number,
    orientation: ConstructionOrientation,
    constructionSubdivisions: number,
    source: NavigationBlockerSource,
  ): void {
    for (const edge of this.mapConstructionEdgeToNavigation(x, y, orientation, constructionSubdivisions)) {
      this.removeNavEdge(edge.x, edge.y, edge.orientation, source);
    }
  }

  canTraverse(fromX: number, fromY: number, toX: number, toY: number): boolean {
    if (!this.isNavWalkable(toX, toY)) return false;
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;

    if (dx === 1) return !this.blockedEdges.has(this.edgeKey(fromX + 1, fromY, 'vertical'));
    if (dx === -1) return !this.blockedEdges.has(this.edgeKey(fromX, fromY, 'vertical'));
    if (dy === 1) return !this.blockedEdges.has(this.edgeKey(fromX, fromY + 1, 'horizontal'));
    return !this.blockedEdges.has(this.edgeKey(fromX, fromY, 'horizontal'));
  }

  private mapConstructionEdgeToNavigation(
    x: number,
    y: number,
    orientation: ConstructionOrientation,
    constructionSubdivisions: number,
  ): Array<{ x: number; y: number; orientation: ConstructionOrientation }> {
    const constructionS = Math.max(1, Math.floor(constructionSubdivisions));
    const navS = this.subdivisions;
    const startPhysicalX = x / constructionS;
    const startPhysicalY = y / constructionS;
    const endPhysicalX = orientation === 'horizontal' ? (x + 1) / constructionS : startPhysicalX;
    const endPhysicalY = orientation === 'vertical' ? (y + 1) / constructionS : startPhysicalY;

    const edgeX = Math.round(startPhysicalX * navS);
    const edgeY = Math.round(startPhysicalY * navS);
    const segmentCount = Math.max(
      1,
      Math.round(
        (orientation === 'horizontal'
          ? endPhysicalX - startPhysicalX
          : endPhysicalY - startPhysicalY) * navS,
      ),
    );

    const edges: Array<{ x: number; y: number; orientation: ConstructionOrientation }> = [];
    for (let i = 0; i < segmentCount; i++) {
      edges.push({
        x: orientation === 'horizontal' ? edgeX + i : edgeX,
        y: orientation === 'vertical' ? edgeY + i : edgeY,
        orientation,
      });
    }
    return edges;
  }

  private addNavEdge(
    x: number,
    y: number,
    orientation: ConstructionOrientation,
    source: NavigationBlockerSource,
  ): void {
    const key = this.edgeKey(x, y, orientation);
    let sources = this.blockedEdges.get(key);
    if (!sources) {
      sources = new Set();
      this.blockedEdges.set(key, sources);
    }
    sources.add(source);
  }

  private removeNavEdge(
    x: number,
    y: number,
    orientation: ConstructionOrientation,
    source: NavigationBlockerSource,
  ): void {
    const key = this.edgeKey(x, y, orientation);
    const sources = this.blockedEdges.get(key);
    if (!sources) return;
    sources.delete(source);
    if (sources.size === 0) this.blockedEdges.delete(key);
  }

  private edgeKey(x: number, y: number, orientation: ConstructionOrientation): string {
    return `${x},${y},${orientation}`;
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  private clampX(x: number): number {
    return Math.max(0, Math.min(this.width - 1, x));
  }

  private clampY(y: number): number {
    return Math.max(0, Math.min(this.height - 1, y));
  }
}
