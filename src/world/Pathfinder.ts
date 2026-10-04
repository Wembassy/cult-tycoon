/**
 * Pathfinder — A* pathfinding on the tile grid.
 * 4-directional movement, cached paths, invalidation on building changes.
 */

import { TileMap } from '../world/TileMap';
import { NavigationGrid } from './NavigationGrid';

export interface PathNode {
  x: number;
  y: number;
  g: number; // cost from start
  h: number; // heuristic to goal
  f: number; // g + h
  parent: PathNode | null;
}

export interface PathResult {
  path: { x: number; y: number }[];
  success: boolean;
  length: number;
}

const DIRS = [
  { dx: 0, dy: -1 }, // north
  { dx: 1, dy: 0 },  // east
  { dx: 0, dy: 1 },  // south
  { dx: -1, dy: 0 }, // west
];

const TILE_COST = 1;
const MAX_PATHFIND_ITERATIONS = 10000;

export class Pathfinder {
  private map: TileMap;
  private navigation: NavigationGrid;
  private cache: Map<string, PathResult> = new Map();
  private cacheVersion = 0;
  private lastCacheVersion = -1;

  constructor(map: TileMap, navigation: NavigationGrid = new NavigationGrid(map)) {
    this.map = map;
    this.navigation = navigation;
  }

  /**
   * Invalidate the path cache (call when buildings change)
   */
  invalidateCache(): void {
    this.cacheVersion++;
  }

  /**
   * Find a path from start to goal using A*.
   * Returns smoothed path (redundant waypoints removed).
   */
  findPath(startX: number, startY: number, goalX: number, goalY: number): PathResult {
    const cacheKey = `${startX},${startY}->${goalX},${goalY}`;

    // Return cached path if available and cache is valid
    if (this.lastCacheVersion === this.cacheVersion && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // If cache version changed, clear cache
    if (this.lastCacheVersion !== this.cacheVersion) {
      this.cache.clear();
      this.lastCacheVersion = this.cacheVersion;
    }

    const result = this.aStar(startX, startY, goalX, goalY);
    if (!result.success) {
      this.cache.set(cacheKey, result);
      return result;
    }
    const smoothed = this.smoothPath(result.path);

    this.cache.set(cacheKey, smoothed);
    return smoothed;
  }

  private aStar(startX: number, startY: number, goalX: number, goalY: number): PathResult {
    // Check if start and goal are valid
    const startTile = this.map.getTile(startX, startY);
    const goalTile = this.map.getTile(goalX, goalY);

    if (!startTile || !goalTile) {
      return { path: [], success: false, length: 0 };
    }

    // If start is occupied (inside a wall), fail
    if (!this.navigation.isWalkable(startX, startY)) {
      return { path: [], success: false, length: 0 };
    }

    // If goal is occupied (wall), try nearest accessible tile
    if (!this.navigation.isWalkable(goalX, goalY)) {
      const nearest = this.findNearestAccessible(goalX, goalY);
      if (!nearest || (nearest.x === startX && nearest.y === startY)) {
        return { path: [], success: false, length: 0 };
      }
      return this.aStar(startX, startY, nearest.x, nearest.y);
    }

    const openList: PathNode[] = [];
    const closedSet = new Set<string>();
    const openSet = new Set<string>();

    const startNode: PathNode = {
      x: startX, y: startY, g: 0,
      h: this.heuristic(startX, startY, goalX, goalY),
      f: 0, parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);
    openSet.add(`${startX},${startY}`);

    let iterations = 0;

    while (openList.length > 0 && iterations < MAX_PATHFIND_ITERATIONS) {
      iterations++;

      // Find node with lowest f
      let currentIdx = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i].f < openList[currentIdx].f) {
          currentIdx = i;
        }
      }

      const current = openList[currentIdx];
      openList.splice(currentIdx, 1);
      openSet.delete(`${current.x},${current.y}`);

      // Goal reached
      if (current.x === goalX && current.y === goalY) {
        const path = this.reconstructPath(current);
        return { path, success: true, length: path.length };
      }

      closedSet.add(`${current.x},${current.y}`);

      // Explore neighbors
      for (const { dx, dy } of DIRS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = `${nx},${ny}`;

        if (closedSet.has(key)) continue;

        const tile = this.map.getTile(nx, ny);
        if (!tile) continue; // out of bounds
        if (!this.navigation.isWalkable(nx, ny)) continue;

        const cost = TILE_COST;
        const g = current.g + cost;

        let neighbor = openList.find(n => n.x === nx && n.y === ny);

        if (!neighbor) {
          if (openSet.has(key)) continue;
          neighbor = {
            x: nx, y: ny, g,
            h: this.heuristic(nx, ny, goalX, goalY),
            f: 0, parent: current,
          };
          neighbor.f = neighbor.g + neighbor.h;
          openList.push(neighbor);
          openSet.add(key);
        } else if (g < neighbor.g) {
          neighbor.g = g;
          neighbor.f = g + neighbor.h;
          neighbor.parent = current;
        }
      }
    }

    // No path found — try nearest accessible tile to goal
    const nearest = this.findNearestAccessible(goalX, goalY);
    if (nearest && (nearest.x !== goalX || nearest.y !== goalY)) {
      return this.aStar(startX, startY, nearest.x, nearest.y);
    }

    return { path: [], success: false, length: 0 };
  }

  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  private reconstructPath(node: PathNode): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let current: PathNode | null = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    return path;
  }

  /**
   * Remove redundant waypoints in straight lines
   */
  private smoothPath(path: { x: number; y: number }[]): PathResult {
    if (path.length <= 2) {
      return { path, success: true, length: path.length };
    }

    const smoothed: { x: number; y: number }[] = [path[0]];
    let lastDir = { dx: 0, dy: 0 };

    for (let i = 1; i < path.length; i++) {
      const dir = {
        dx: path[i].x - path[i - 1].x,
        dy: path[i].y - path[i - 1].y,
      };

      if (i === path.length - 1 || dir.dx !== lastDir.dx || dir.dy !== lastDir.dy) {
        smoothed.push(path[i]);
        lastDir = dir;
      }
    }

    return { path: smoothed, success: true, length: smoothed.length };
  }

  /**
   * Find the nearest accessible (non-occupied, non-water) tile to the given position
   */
  private findNearestAccessible(x: number, y: number): { x: number; y: number } | null {
    const queue: { x: number; y: number; dist: number }[] = [{ x, y, dist: 0 }];
    const visited = new Set<string>([`${x},${y}`]);

    while (queue.length > 0) {
      const { x: cx, y: cy, dist } = queue.shift()!;
      if (dist > 10) break; // limit search radius

      const tile = this.map.getTile(cx, cy);
      if (tile && this.navigation.isWalkable(cx, cy)) {
        return { x: cx, y: cy };
      }

      for (const { dx, dy } of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          const nTile = this.map.getTile(nx, ny);
          if (nTile && this.navigation.isWalkable(nx, ny)) {
            visited.add(key);
            queue.push({ x: nx, y: ny, dist: dist + 1 });
          }
        }
      }
    }

    return null;
  }
}