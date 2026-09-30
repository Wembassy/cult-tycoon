/**
 * AISystem — Follower AI state machine.
 * States: idle → moving → working → done → idle (or → needs → idle)
 *
 * Transitions driven by:
 * - NeedsSystem (sets state to 'needs' on critical needs)
 * - JobSystem (sets state to 'moving' on job assignment, 'working' when arrived)
 * - AISystem (pathfinding, arrival detection, state timeouts)
 */

import type { World } from '../ecs/World';
import { FollowerAI } from '../components/FollowerAI';
import { Transform } from '../components/Transform';
import { Job } from '../components/Job';
import { Needs } from '../components/Needs';
import { Pathfinder } from '../world/Pathfinder';
import { TileMap } from '../world/TileMap';

export interface AISystemConfig {
  moveSpeed: number;       // tiles per tick
  idleTimeout: number;     // ticks before idle follower looks for work
  needsCooldown: number;   // ticks before needs-satisfied follower returns to idle
  stuckTimeout: number;    // ticks before stuck follower re-paths
  doneCooldown: number;    // ticks in 'done' before returning to idle
}

const DEFAULT_CONFIG: AISystemConfig = {
  moveSpeed: 0.5,
  idleTimeout: 30,
  needsCooldown: 60,
  stuckTimeout: 50,
  doneCooldown: 10,
};

export class AISystem {
  private config: AISystemConfig;
  private pathfinder: Pathfinder;

  constructor(_map: TileMap, pathfinder: Pathfinder, config: Partial<AISystemConfig> = {}) {
    this.pathfinder = pathfinder;
    this.pathfinder = pathfinder;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update AI for all followers.
   * Returns the number of state transitions that occurred.
   */
  update(world: World, dt: number): number {
    const entities = world.query([FollowerAI, Transform]);
    let transitions = 0;

    for (const entity of entities) {
      const ai = world.getComponent(entity, FollowerAI)!;
      const transform = world.getComponent(entity, Transform)!;
      ai.stateTimer += dt;

      switch (ai.state) {
        case 'idle':
          transitions += this.handleIdle(world, entity, ai);
          break;
        case 'moving':
          transitions += this.handleMoving(world, entity, ai, transform);
          break;
        case 'working':
          // JobSystem handles work progress; AI just waits
          break;
        case 'needs':
          transitions += this.handleNeeds(world, entity, ai);
          break;
        case 'done':
          transitions += this.handleDone(ai);
          break;
        case 'stuck':
          transitions += this.handleStuck(world, entity, ai, transform);
          break;
      }
    }

    return transitions;
  }

  private handleIdle(world: World, entity: number, ai: FollowerAI): number {
    // After idle timeout, try to find something to do
    if (ai.stateTimer >= this.config.idleTimeout) {
      const needs = world.getComponent(entity, Needs);
      if (needs) {
        // Check if any needs are critical
        if (needs.hunger < 30 || needs.faith < 30 || needs.fun < 20) {
          ai.state = 'needs';
          ai.stateTimer = 0;
          return 1;
        }
      }
      // JobSystem will assign work if available; reset timer
      ai.stateTimer = 0;
    }
    return 0;
  }

  private handleMoving(world: World, entity: number, ai: FollowerAI, transform: Transform): number {
    const job = world.getComponent(entity, Job);

    // If no path, compute one
    if (ai.path.length === 0 && job?.targetTile) {
      const path = this.pathfinder.findPath(
        Math.round(transform.x),
        Math.round(transform.y),
        job.targetTile.x,
        job.targetTile.y
      );

      if (path.success && path.path.length > 0) {
        ai.path = path.path;
        ai.pathIndex = 1; // skip current tile
      } else {
        // Can't path to job — mark stuck
        ai.state = 'stuck';
        ai.stateTimer = 0;
        return 1;
      }
    }

    // Follow path
    if (ai.path.length > 0 && ai.pathIndex < ai.path.length) {
      const target = ai.path[ai.pathIndex];
      const dx = target.x - transform.x;
      const dy = target.y - transform.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= this.config.moveSpeed) {
        // Reached this tile
        transform.x = target.x;
        transform.y = target.y;
        ai.pathIndex++;

        // Reached destination?
        if (ai.pathIndex >= ai.path.length) {
          ai.path = [];
          ai.pathIndex = 0;
          ai.state = 'working';
          ai.stateTimer = 0;
          return 1;
        }
      } else {
        // Move toward target
        const moveX = (dx / dist) * this.config.moveSpeed;
        const moveY = (dy / dist) * this.config.moveSpeed;
        transform.x += moveX;
        transform.y += moveY;
      }
    }

    // Stuck timeout
    if (ai.stateTimer >= this.config.stuckTimeout) {
      ai.state = 'stuck';
      ai.stateTimer = 0;
      ai.path = [];
      ai.pathIndex = 0;
      return 1;
    }

    return 0;
  }

  private handleNeeds(world: World, entity: number, ai: FollowerAI): number {
    const needs = world.getComponent(entity, Needs);
    if (!needs) {
      ai.state = 'idle';
      ai.stateTimer = 0;
      return 1;
    }

    // If needs are still critical, keep waiting (follower is "taking care of needs")
    // In a full implementation, this would path to a relevant building (kitchen, shrine, etc.)
    // For now, just wait for needs cooldown then return to idle
    if (ai.stateTimer >= this.config.needsCooldown) {
      // Restore some needs (simulating eating/praying/etc.)
      needs.hunger = clamp(needs.hunger + 30, 0, 100);
      needs.faith = clamp(needs.faith + 20, 0, 100);
      needs.fun = clamp(needs.fun + 25, 0, 100);
      needs.sanity = clamp(needs.sanity + 15, 0, 100);

      ai.state = 'idle';
      ai.stateTimer = 0;
      return 1;
    }

    return 0;
  }

  private handleDone(ai: FollowerAI): number {
    if (ai.stateTimer >= this.config.doneCooldown) {
      ai.state = 'idle';
      ai.stateTimer = 0;
      return 1;
    }
    return 0;
  }

  private handleStuck(world: World, entity: number, ai: FollowerAI, transform: Transform): number {
    // Try to re-path
    const job = world.getComponent(entity, Job);

    if (job?.targetTile) {
      // Try finding path to nearest accessible tile near the target
      const path = this.pathfinder.findPath(
        Math.round(transform.x),
        Math.round(transform.y),
        job.targetTile.x,
        job.targetTile.y
      );

      if (path.success && path.path.length > 0) {
        ai.path = path.path;
        ai.pathIndex = 1;
        ai.state = 'moving';
        ai.stateTimer = 0;
        return 1;
      }
    }

    // Give up after stuck timeout
    if (ai.stateTimer >= this.config.stuckTimeout * 2) {
      // Abandon job
      const jobComp = world.getComponent(entity, Job);
      if (jobComp) {
        jobComp.type = 'idle';
        jobComp.jobId = null;
        jobComp.targetTile = null;
        jobComp.workProgress = 0;
      }
      ai.state = 'idle';
      ai.stateTimer = 0;
      ai.path = [];
      ai.pathIndex = 0;
      return 1;
    }

    return 0;
  }

  getConfig(): AISystemConfig {
    return { ...this.config };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}