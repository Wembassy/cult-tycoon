/**
 * FogOfWar — Tracks explored and currently-visible tiles.
 *
 * Three states per tile:
 * - Hidden:    never seen (rendered dark/black)
 * - Explored:  seen before but not currently in view (rendered dimmed)
 * - Visible:   currently in sight of a follower (rendered normally)
 *
 * Visibility is a radius around each follower. Explored tiles stay explored
 * permanently (once discovered, you remember the terrain).
 */

export type FogState = 'hidden' | 'explored' | 'visible';

export class FogOfWar {
  private explored: Set<string> = new Set();
  private visible: Set<string> = new Set();
  private previouslyVisible: Set<string> = new Set();

  readonly visibilityRadius: number;

  constructor(visibilityRadius: number = 8) {
    this.visibilityRadius = visibilityRadius;
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  /**
   * Update visibility based on follower positions.
   * Call this each tick (or every N ticks for performance).
   */
  update(positions: { x: number; y: number }[]): void {
    // Swap: previous visible becomes previouslyVisible
    this.previouslyVisible = this.visible;
    this.visible = new Set();

    for (const pos of positions) {
      const r = this.visibilityRadius;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= r) {
            const x = Math.round(pos.x) + dx;
            const y = Math.round(pos.y) + dy;
            const k = this.key(x, y);
            this.visible.add(k);
            this.explored.add(k);
          }
        }
      }
    }
  }

  getState(x: number, y: number): FogState {
    const k = this.key(x, y);
    if (this.visible.has(k)) return 'visible';
    if (this.explored.has(k)) return 'explored';
    return 'hidden';
  }

  isVisible(x: number, y: number): boolean {
    return this.visible.has(this.key(x, y));
  }

  isExplored(x: number, y: number): boolean {
    return this.explored.has(this.key(x, y));
  }

  /**
   * Returns true if the tile's fog state changed since the last update.
   * Useful for only updating meshes whose appearance needs to change.
   */
  changedSinceLastUpdate(x: number, y: number): boolean {
    const k = this.key(x, y);
    const wasVisible = this.previouslyVisible.has(k);
    const isVisible = this.visible.has(k);
    return wasVisible !== isVisible;
  }

  /**
   * Get all tiles that became newly visible since last update.
   */
  getNewlyVisible(): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = [];
    for (const k of this.visible) {
      if (!this.previouslyVisible.has(k)) {
        const parts = k.split(',');
        result.push({ x: parseInt(parts[0]), y: parseInt(parts[1]) });
      }
    }
    return result;
  }

  /**
   * Get all tiles that were visible but are no longer visible.
   */
  getNewlyHidden(): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = [];
    for (const k of this.previouslyVisible) {
      if (!this.visible.has(k)) {
        const parts = k.split(',');
        result.push({ x: parseInt(parts[0]), y: parseInt(parts[1]) });
      }
    }
    return result;
  }

  /**
   * Force-reveal a tile (e.g., starting area).
   */
  reveal(x: number, y: number): void {
    this.explored.add(this.key(x, y));
    this.visible.add(this.key(x, y));
  }

  /**
   * Reveal a rectangular area.
   */
  revealArea(x: number, y: number, radius: number): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          this.reveal(x + dx, y + dy);
        }
      }
    }
  }

  get exploredCount(): number { return this.explored.size; }
  get visibleCount(): number { return this.visible.size; }
}