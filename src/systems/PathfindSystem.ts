/**
 * PathfindSystem — Higher-level pathfinding manager.
 *
 * Manages path requests, budgets computation per tick,
 * and caches results until invalidated by building changes.
 */

import type { World } from '../ecs/World';
import type { System } from '../ecs/System';
import { Path } from '../components/Path';
import { Pathfinder, type PathResult } from '../world/Pathfinder';
import type { TileMap } from '../world/TileMap';

export interface PathfindSystemConfig {
  /** Maximum paths to compute per update tick. */
  maxPathsPerTick: number;
}

const DEFAULT_CONFIG: PathfindSystemConfig = {
  maxPathsPerTick: 5,
};

interface PendingRequest {
  entity: number;
  startX: number;
  startY: number;
  goalX: number;
  goalY: number;
  onComplete: ((path: { x: number; y: number }[], success: boolean) => void) | null;
}

export class PathfindSystem implements System {
  private pathfinder: Pathfinder;
  private config: PathfindSystemConfig;
  private queue: PendingRequest[] = [];
  /** Cached paths keyed by "sx,sy->gx,gy". */
  private cache: Map<string, PathResult> = new Map();
  private cacheVersion = 0;
  private lastCacheVersion = -1;
  private world: World | null = null;

  constructor(_map: TileMap, pathfinder: Pathfinder, config: Partial<PathfindSystemConfig> = {}) {
    this.pathfinder = pathfinder;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Bind the world reference (called automatically on first update,
   * or can be called manually before requestPath).
   */
  bindWorld(world: World): void {
    this.world = world;
  }

  /**
   * Queue a pathfinding request for an entity.
   * The entity's Path component is marked as pending.
   * The path will be computed during the next update() tick (budget permitting).
   */
  requestPath(
    entity: number,
    startX: number,
    startY: number,
    goalX: number,
    goalY: number,
    onComplete?: (path: { x: number; y: number }[], success: boolean) => void,
  ): void {
    // Set up Path component if world is available
    const pathComp = this.world?.getComponent(entity, Path);
    if (pathComp) {
      pathComp.pending = true;
      pathComp.ready = false;
      pathComp.dirty = false;
      if (onComplete) {
        pathComp.onComplete = onComplete;
      }
    }

    // Avoid duplicate requests for the same entity
    this.queue = this.queue.filter(r => r.entity !== entity);
    this.queue.push({ entity, startX, startY, goalX, goalY, onComplete: onComplete ?? null });
  }

  /**
   * Invalidate all cached paths (call when walls/doors change).
   */
  invalidateCache(): void {
    this.cacheVersion++;
    this.pathfinder.invalidateCache();
  }

  /**
   * Process queued path requests up to the per-tick budget.
   * Also resolves cache lookups without counting against the budget.
   */
  update(world: World, _dt: number): void {
    // Ensure world reference is set
    if (!this.world) this.world = world;

    // Clear cache if version changed
    if (this.lastCacheVersion !== this.cacheVersion) {
      this.cache.clear();
      this.lastCacheVersion = this.cacheVersion;
    }

    if (this.queue.length === 0) return;

    let processed = 0;
    const remaining: PendingRequest[] = [];

    for (const request of this.queue) {
      if (processed >= this.config.maxPathsPerTick) {
        // Budget exhausted — keep for next tick
        remaining.push(request);
        continue;
      }

      this.processRequest(request);
      processed++;
    }

    this.queue = remaining;
  }

  private processRequest(request: PendingRequest): void {
    const { entity, startX, startY, goalX, goalY, onComplete } = request;
    const cacheKey = `${startX},${startY}->${goalX},${goalY}`;

    // Check local cache first (doesn't count against budget)
    let result: PathResult;
    if (this.cache.has(cacheKey)) {
      result = this.cache.get(cacheKey)!;
    } else {
      result = this.pathfinder.findPath(startX, startY, goalX, goalY);
      this.cache.set(cacheKey, result);
    }

    // Update entity's Path component
    const pathComp = this.world?.getComponent(entity, Path);
    if (!pathComp) {
      // Still fire callback even if component is gone
      if (onComplete) onComplete(result.path, result.success);
      return;
    }

    pathComp.pending = false;
    pathComp.ready = true;
    pathComp.waypoints = result.success ? result.path : [];
    pathComp.index = result.success && result.path.length > 1 ? 1 : 0;
    pathComp.dirty = false;

    // Fire callback
    if (onComplete) {
      onComplete(result.path, result.success);
    }
  }

  /**
   * Get the current queue length (for debugging/testing).
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Get the current cache size (for debugging/testing).
   */
  get cacheSize(): number {
    return this.cache.size;
  }

  /**
   * Check if an entity has a pending path request.
   */
  isPending(entity: number): boolean {
    return this.queue.some(r => r.entity === entity);
  }
}