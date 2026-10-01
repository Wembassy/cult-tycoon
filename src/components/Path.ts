import type { Component } from '../ecs/Component';

/**
 * Path component — holds pathfinding data for an entity.
 * Managed by PathfindSystem.
 */
export class Path implements Component {
  constructor(public readonly entity: number) {}

  /** Waypoints from start to goal. */
  waypoints: { x: number; y: number }[] = [];
  /** Current target index in the waypoints array. */
  index = 0;
  /** True when a path has been computed and is ready to follow. */
  ready = false;
  /** True when a path request is pending (queued for processing). */
  pending = false;
  /** True when the path is stale (walls/doors changed since computation). */
  dirty = false;
  /** Callback invoked when the path is ready. */
  onComplete: ((path: { x: number; y: number }[], success: boolean) => void) | null = null;
}