/**
 * Pathfinder — A* over fine Navigation Space.
 *
 * Public inputs/outputs remain in continuous local simulation coordinates so
 * follower AI and job targets do not need to know the navigation raster size.
 * Internally, A* runs on NavigationGrid cells and respects blocked transitions
 * created by edge-based walls.
 */

import { TileMap } from '../world/TileMap';
import { NavigationGrid } from './NavigationGrid';

export interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

export interface PathResult {
  path: { x: number; y: number }[];
  success: boolean;
  length: number;
}

interface HeapNode {
  x: number;
  y: number;
  f: number;
  h: number;
}

const DIRS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

const NAV_COST = 1;

class MinHeap {
  private values: HeapNode[] = [];

  get size(): number { return this.values.length; }

  push(value: HeapNode): void {
    this.values.push(value);
    this.bubbleUp(this.values.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.values.length === 0) return undefined;
    const first = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length > 0) {
      this.values[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  private less(a: HeapNode, b: HeapNode): boolean {
    return a.f < b.f || (a.f === b.f && a.h < b.h);
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.less(this.values[index], this.values[parent])) break;
      [this.values[index], this.values[parent]] = [this.values[parent], this.values[index]];
      index = parent;
    }
  }

  private sinkDown(index: number): void {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.values.length && this.less(this.values[left], this.values[smallest])) smallest = left;
      if (right < this.values.length && this.less(this.values[right], this.values[smallest])) smallest = right;
      if (smallest === index) return;
      [this.values[index], this.values[smallest]] = [this.values[smallest], this.values[index]];
      index = smallest;
    }
  }
}

export class Pathfinder {
  private cache: Map<string, PathResult> = new Map();
  private cacheVersion = 0;
  private lastCacheVersion = -1;

  constructor(
    private readonly map: TileMap,
    private readonly navigation: NavigationGrid = new NavigationGrid(map),
  ) {}

  invalidateCache(): void {
    this.cacheVersion++;
  }

  /**
   * Find a path using local simulation coordinates. The returned waypoints use
   * the same coordinate convention as follower Transform.x/y.
   */
  findPath(startX: number, startY: number, goalX: number, goalY: number): PathResult {
    if (!this.isLocalInBounds(startX, startY) || !this.isLocalInBounds(goalX, goalY)) {
      return { path: [], success: false, length: 0 };
    }

    const cacheKey = `${startX},${startY}->${goalX},${goalY}`;
    if (this.lastCacheVersion === this.cacheVersion && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    if (this.lastCacheVersion !== this.cacheVersion) {
      this.cache.clear();
      this.lastCacheVersion = this.cacheVersion;
    }

    const start = this.navigation.localToNav(startX, startY);
    const requestedGoal = this.navigation.localToNav(goalX, goalY);

    if (!this.navigation.isNavWalkable(start.x, start.y)) {
      const failed = { path: [], success: false, length: 0 };
      this.cache.set(cacheKey, failed);
      return failed;
    }

    let goal = requestedGoal;
    let usedFallbackGoal = false;
    if (!this.navigation.isNavWalkable(goal.x, goal.y)) {
      const nearest = this.findNearestAccessibleNav(goal.x, goal.y);
      if (!nearest || (nearest.x === start.x && nearest.y === start.y)) {
        const failed = { path: [], success: false, length: 0 };
        this.cache.set(cacheKey, failed);
        return failed;
      }
      goal = nearest;
      usedFallbackGoal = true;
    }

    const navPath = this.aStarNav(start.x, start.y, goal.x, goal.y);
    if (navPath.length === 0) {
      const failed = { path: [], success: false, length: 0 };
      this.cache.set(cacheKey, failed);
      return failed;
    }

    const smoothedNav = this.smoothNavPath(navPath);
    const localPath = smoothedNav.map(point => this.navigation.navToLocalCenter(point.x, point.y));

    // Preserve exact caller coordinates at semantic endpoints. Intermediate
    // waypoints remain fine-cell centers and route around construction edges.
    localPath[0] = { x: startX, y: startY };
    if (!usedFallbackGoal) {
      localPath[localPath.length - 1] = { x: goalX, y: goalY };
    }

    const result: PathResult = {
      path: localPath,
      success: true,
      length: localPath.length,
    };
    this.cache.set(cacheKey, result);
    return result;
  }

  private aStarNav(startX: number, startY: number, goalX: number, goalY: number): { x: number; y: number }[] {
    const open = new MinHeap();
    const closed = new Set<string>();
    const gScore = new Map<string, number>();
    const cameFrom = new Map<string, string>();

    const startKey = this.key(startX, startY);
    const startH = this.heuristic(startX, startY, goalX, goalY);
    gScore.set(startKey, 0);
    open.push({ x: startX, y: startY, f: startH, h: startH });

    const maxIterations = this.navigation.width * this.navigation.height;
    let iterations = 0;

    while (open.size > 0 && iterations < maxIterations) {
      iterations++;
      const current = open.pop()!;
      const currentKey = this.key(current.x, current.y);
      if (closed.has(currentKey)) continue;

      if (current.x === goalX && current.y === goalY) {
        return this.reconstructNavPath(currentKey, cameFrom);
      }

      closed.add(currentKey);
      const currentG = gScore.get(currentKey) ?? Infinity;

      for (const { dx, dy } of DIRS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const neighborKey = this.key(nx, ny);

        if (closed.has(neighborKey)) continue;
        if (!this.navigation.isInBounds(nx, ny)) continue;
        if (!this.navigation.canTraverse(current.x, current.y, nx, ny)) continue;

        const tentativeG = currentG + NAV_COST;
        if (tentativeG >= (gScore.get(neighborKey) ?? Infinity)) continue;

        cameFrom.set(neighborKey, currentKey);
        gScore.set(neighborKey, tentativeG);
        const h = this.heuristic(nx, ny, goalX, goalY);
        open.push({ x: nx, y: ny, h, f: tentativeG + h });
      }
    }

    return [];
  }

  private reconstructNavPath(goalKey: string, cameFrom: Map<string, string>): { x: number; y: number }[] {
    const keys = [goalKey];
    let current = goalKey;
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      keys.push(current);
    }
    keys.reverse();
    return keys.map(key => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
  }

  /** Preserve direction changes while removing redundant fine-cell waypoints. */
  private smoothNavPath(path: { x: number; y: number }[]): { x: number; y: number }[] {
    if (path.length <= 2) return path;

    const smoothed: { x: number; y: number }[] = [path[0]];
    let lastDx = path[1].x - path[0].x;
    let lastDy = path[1].y - path[0].y;

    for (let i = 2; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      if (dx !== lastDx || dy !== lastDy) {
        smoothed.push(path[i - 1]);
        lastDx = dx;
        lastDy = dy;
      }
    }
    smoothed.push(path[path.length - 1]);
    return smoothed;
  }

  private findNearestAccessibleNav(x: number, y: number): { x: number; y: number } | null {
    const queue: { x: number; y: number; dist: number }[] = [{ x, y, dist: 0 }];
    const visited = new Set<string>([this.key(x, y)]);
    const maxRadius = 10 * this.navigation.subdivisions;
    let head = 0;

    while (head < queue.length) {
      const current = queue[head++];
      if (current.dist > maxRadius) break;
      if (this.navigation.isNavWalkable(current.x, current.y)) {
        return { x: current.x, y: current.y };
      }

      for (const { dx, dy } of DIRS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const key = this.key(nx, ny);
        if (visited.has(key) || !this.navigation.isInBounds(nx, ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, dist: current.dist + 1 });
      }
    }
    return null;
  }

  private isLocalInBounds(x: number, y: number): boolean {
    return x >= -0.5 && x < this.map.width - 0.5 &&
      y >= -0.5 && y < this.map.height - 0.5;
  }

  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }
}
