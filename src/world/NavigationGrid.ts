/**
 * NavigationGrid — pathfinding-specific walkability state.
 *
 * This deliberately does not use TileMap.occupied. World decor/terrain and
 * navigation blockers are separate concerns from construction storage.
 */

import { TileMap } from './TileMap';

export type NavigationBlockerSource = string;

export class NavigationGrid {
  private readonly blockers = new Map<string, Set<NavigationBlockerSource>>();

  constructor(private readonly map: TileMap) {}

  get width(): number { return this.map.width; }
  get height(): number { return this.map.height; }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.map.width && y >= 0 && y < this.map.height;
  }

  /**
   * Terrain/decor walkability. Construction state is intentionally absent.
   * Dynamic architecture is registered through addBlocker/removeBlocker.
   */
  isWalkable(x: number, y: number): boolean {
    const tile = this.map.getTile(x, y);
    if (!tile) return false;
    if (tile.terrain === 'water') return false;
    if (tile.decor === 'tree' || tile.decor === 'rock') return false;
    return !this.blockers.has(this.key(x, y));
  }

  addBlocker(x: number, y: number, source: NavigationBlockerSource): void {
    if (!this.isInBounds(x, y)) return;
    const key = this.key(x, y);
    let sources = this.blockers.get(key);
    if (!sources) {
      sources = new Set();
      this.blockers.set(key, sources);
    }
    sources.add(source);
  }

  removeBlocker(x: number, y: number, source: NavigationBlockerSource): void {
    const key = this.key(x, y);
    const sources = this.blockers.get(key);
    if (!sources) return;
    sources.delete(source);
    if (sources.size === 0) this.blockers.delete(key);
  }

  clearBlockersAt(x: number, y: number): void {
    this.blockers.delete(this.key(x, y));
  }

  clearDynamicBlockers(): void {
    this.blockers.clear();
  }

  hasDynamicBlocker(x: number, y: number): boolean {
    return this.blockers.has(this.key(x, y));
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }
}
