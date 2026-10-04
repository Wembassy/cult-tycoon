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

export type NeedKind = 'hunger' | 'faith' | 'fun' | 'sanity' | 'energy' | 'bladder' | 'hygiene';
export interface NeedFacilityTarget { x: number; y: number; }
export type NeedFacilityProvider = (need: NeedKind, from: { x: number; y: number }) => NeedFacilityTarget | null;

export interface AISystemConfig {
  moveSpeed: number;       // tiles per tick
  idleTimeout: number;     // ticks before idle follower looks for work
  needsCooldown: number;   // ticks before needs-satisfied follower returns to idle
  stuckTimeout: number;    // ticks before stuck follower re-paths
  doneCooldown: number;    // ticks in 'done' before returning to idle
}

const DEFAULT_CONFIG: AISystemConfig = {
  moveSpeed: 0.08,      // tiles per tick — slower for more visible movement
  idleTimeout: 15,      // ~0.5s at 30fps before wandering
  needsCooldown: 60,
  stuckTimeout: 50,
  doneCooldown: 5,      // short pause before next wander
};

export class AISystem {
  private config: AISystemConfig;
  private pathfinder: Pathfinder;
  private needFacilityProvider: NeedFacilityProvider | null = null;

  constructor(_map: TileMap, pathfinder: Pathfinder, config: Partial<AISystemConfig> = {}) {
    this.pathfinder = pathfinder;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setNeedFacilityProvider(provider: NeedFacilityProvider): void {
    this.needFacilityProvider = provider;
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
          transitions += this.handleNeeds(world, entity, ai, dt);
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
        const criticalNeed = this.getMostUrgentNeed(needs);
        if (criticalNeed) {
          ai.needTarget = criticalNeed;
          ai.state = 'needs';
          ai.stateTimer = 0;
          return 1;
        }
      }

      // No job assigned — wander to a random nearby tile so followers look alive
      const transform = world.getComponent(entity, Transform);
      if (transform) {
        const wanderRange = 12;
        const targetX = Math.round(transform.x) + Math.floor((Math.random() - 0.5) * wanderRange * 2);
        const targetY = Math.round(transform.y) + Math.floor((Math.random() - 0.5) * wanderRange * 2);

        const path = this.pathfinder.findPath(
        transform.x,
        transform.y,
          targetX,
          targetY,
        );

        if (path.success && path.path.length > 1) {
          ai.path = path.path;
          ai.pathIndex = 1;
          ai.state = 'moving';
          ai.stateTimer = 0;

          // Set a wander job so handleMoving knows this isn't a real job
          const job = world.getComponent(entity, Job);
          if (job) {
            job.type = 'wander';
            job.targetTile = { x: targetX, y: targetY };
          }
          return 1;
        }
      }

      // Couldn't find a wander path — reset timer and try again later
      ai.stateTimer = 0;
    }
    return 0;
  }

  private handleMoving(world: World, entity: number, ai: FollowerAI, transform: Transform): number {
    const job = world.getComponent(entity, Job);

    // If no path, compute one
    if (ai.path.length === 0 && job?.targetTile) {
      const path = this.pathfinder.findPath(
        transform.x,
        transform.y,
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
          // Need-seeking movement resolves into facility use before normal job logic.
          if (ai.needTarget && ai.needTargetTile) {
            ai.state = 'needs';
          } else if (job && job.type !== 'wander' && job.type !== 'idle') {
            ai.state = 'working';
          } else {
            ai.state = 'done';
            // Clear wander job
            if (job) {
              job.type = 'idle';
              job.targetTile = null;
            }
          }
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

  private handleNeeds(world: World, entity: number, ai: FollowerAI, dt: number): number {
    const needs = world.getComponent(entity, Needs);
    const transform = world.getComponent(entity, Transform);
    if (!needs || !transform) {
      this.clearNeedTarget(ai);
      ai.state = 'idle';
      ai.stateTimer = 0;
      return 1;
    }

    const need = ai.needTarget ?? this.getMostUrgentNeed(needs);
    if (!need) {
      this.finishNeedAndResumeJob(world, entity, ai);
      return 1;
    }
    ai.needTarget = need;

    // If we have not chosen a facility yet, ask the game layer for the nearest valid one.
    if (!ai.needTargetTile) {
      const facility = this.needFacilityProvider?.(need, { x: transform.x, y: transform.y }) ?? null;
      if (!facility) {
        // No appropriate facility exists. Stay needy so the player feels the consequence.
        ai.stateTimer = Math.min(ai.stateTimer, this.config.needsCooldown);
        return 0;
      }

      const path = this.pathfinder.findPath(
        transform.x,
        transform.y,
        facility.x,
        facility.y,
      );
      if (!path.success || path.path.length === 0) {
        return 0;
      }

      ai.needTargetTile = facility;
      ai.path = path.path;
      ai.pathIndex = path.path.length > 1 ? 1 : 0;
      if (path.path.length > 1) {
        ai.state = 'moving';
        ai.stateTimer = 0;
        return 1;
      }
    }

    // At the facility: restore only the need this facility is intended to satisfy.
    const recoveryRate = this.getNeedRecoveryRate(need);
    needs[need] = clamp(needs[need] + recoveryRate * dt, 0, 100);

    if (needs[need] >= 80) {
      this.finishNeedAndResumeJob(world, entity, ai);
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
        transform.x,
        transform.y,
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
      this.clearNeedTarget(ai);
      ai.state = 'idle';
      ai.stateTimer = 0;
      ai.path = [];
      ai.pathIndex = 0;
      return 1;
    }

    return 0;
  }

  private getMostUrgentNeed(needs: Needs): NeedKind | null {
    const thresholds: { need: NeedKind; threshold: number }[] = [
      { need: 'hunger', threshold: 30 },
      { need: 'energy', threshold: 25 },
      { need: 'bladder', threshold: 25 },
      { need: 'hygiene', threshold: 25 },
      { need: 'faith', threshold: 30 },
      { need: 'sanity', threshold: 25 },
      { need: 'fun', threshold: 25 },
    ];

    let selected: NeedKind | null = null;
    let lowestRatio = Infinity;
    for (const entry of thresholds) {
      const value = needs[entry.need];
      if (value >= entry.threshold) continue;
      const ratio = value / entry.threshold;
      if (ratio < lowestRatio) {
        lowestRatio = ratio;
        selected = entry.need;
      }
    }
    return selected;
  }

  private getNeedRecoveryRate(need: NeedKind): number {
    switch (need) {
      case 'hunger': return 18;
      case 'faith': return 12;
      case 'fun': return 12;
      case 'sanity': return 10;
      case 'energy': return 22;
      case 'bladder': return 35;
      case 'hygiene': return 18;
    }
  }

  private clearNeedTarget(ai: FollowerAI): void {
    ai.needTarget = null;
    ai.needTargetTile = null;
  }

  private finishNeedAndResumeJob(world: World, entity: number, ai: FollowerAI): void {
    this.clearNeedTarget(ai);
    ai.stateTimer = 0;
    ai.path = [];
    ai.pathIndex = 0;

    const job = world.getComponent(entity, Job);
    if (job && job.type !== 'idle' && job.type !== 'wander' && job.targetTile) {
      ai.state = 'moving';
    } else {
      ai.state = 'idle';
    }
  }

  getConfig(): AISystemConfig {
    return { ...this.config };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}