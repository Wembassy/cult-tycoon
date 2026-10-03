import { OnRitual } from '../components/OnRitual';
/** Follower navigation and self-care. All durations are simulation seconds. */
import type { World } from '../ecs/World';
import { FollowerAI } from '../components/FollowerAI';
import { Transform } from '../components/Transform';
import { Job } from '../components/Job';
import { Needs } from '../components/Needs';
import { OnMission } from '../components/OnMission';
import { Pathfinder } from '../world/Pathfinder';
import { TileMap } from '../world/TileMap';

export type NeedKind = 'hunger' | 'faith' | 'fun' | 'sanity' | 'energy' | 'bladder' | 'hygiene';
export interface NeedFacilityTarget {
  x: number;
  y: number;
  id?: string;
}
export type NeedFacilityProvider = (
  need: NeedKind,
  from: { x: number; y: number },
  entity?: number,
) => NeedFacilityTarget | null;
export interface AISystemConfig {
  moveSpeed: number;
  idleTimeout: number;
  needsCooldown: number;
  stuckTimeout: number;
  doneCooldown: number;
}
const DEFAULT_CONFIG: AISystemConfig = {
  moveSpeed: 2.4,
  idleTimeout: 1.5,
  needsCooldown: 2,
  stuckTimeout: 3,
  doneCooldown: 0.2,
};
const NEEDS: NeedKind[] = ['hunger', 'energy', 'bladder', 'hygiene', 'faith', 'sanity', 'fun'];
const RATE: Record<NeedKind, number> = {
  hunger: 14,
  energy: 9,
  bladder: 28,
  hygiene: 14,
  faith: 9,
  fun: 9,
  sanity: 8,
};

export class AISystem {
  private config: AISystemConfig;
  private needFacilityProvider: NeedFacilityProvider | null = null;
  private validFacility?: (entity: number, need: NeedKind, target: NeedFacilityTarget) => boolean;
  private useFacility?: (entity: number, need: NeedKind, amount: number) => number;
  private retryAt = new Map<number, number>();
  private elapsed = 0;
  constructor(
    private map: TileMap,
    private pathfinder: Pathfinder,
    config: Partial<AISystemConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  setNeedFacilityProvider(
    provider: NeedFacilityProvider,
    valid?: (entity: number, need: NeedKind, target: NeedFacilityTarget) => boolean,
    use?: (entity: number, need: NeedKind, amount: number) => number,
  ): void {
    this.needFacilityProvider = provider;
    this.validFacility = valid;
    this.useFacility = use;
  }
  reset(): void {
    this.retryAt.clear();
    this.elapsed = 0;
  }
  getConfig(): AISystemConfig {
    return { ...this.config };
  }
  update(world: World, dt: number): number {
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    this.elapsed += dt;
    let changes = 0;
    for (const entity of world.query([FollowerAI, Transform])) {
      if (world.hasComponent(entity, OnMission)) continue;
      const ai = world.getComponent(entity, FollowerAI)!;
      const pos = world.getComponent(entity, Transform)!;
      const ceremony = world.getComponent(entity, OnRitual);
      if (ceremony) {
        ai.needTarget = null;
        ai.needTargetTile = null;
        ai.needFacilityId = null;
        if (Math.hypot(ceremony.target.x - pos.x, ceremony.target.y - pos.y) > 0.08) {
          ai.state = 'moving';
          ai.activityReason = 'Gathering for a ritual';
          this.move(world, entity, ai, pos, dt);
        } else {
          pos.x = ceremony.target.x;
          pos.y = ceremony.target.y;
          ai.state = 'working';
          ai.activityReason = 'Performing a ritual';
        }
        continue;
      }
      const before = ai.state;
      ai.stateTimer += dt;
      const needs = world.getComponent(entity, Needs);
      // A missing shower must not prevent life-saving food/rest forever.
      if (needs && ai.needTarget && !['hunger', 'energy'].includes(ai.needTarget)) {
        const emergency = needs.hunger < 12 ? 'hunger' : needs.energy < 8 ? 'energy' : null;
        if (emergency) {
          ai.needTarget = emergency;
          ai.needTargetTile = null;
          ai.needFacilityId = null;
          ai.path = [];
          ai.pathIndex = 0;
          ai.state = 'needs';
        }
      }
      // Never interrupt an existing self-care journey with the same critical need.
      if (!ai.needTarget && needs) {
        const urgent = NEEDS.filter((n) => needs[n] < (n === 'hunger' ? 30 : 25)).sort(
          (a, b) => needs[a] - needs[b],
        )[0];
        if (urgent) {
          ai.needTarget = urgent;
          ai.needTargetTile = null;
          ai.path = [];
          ai.pathIndex = 0;
          ai.state = 'needs';
        }
      }
      if (
        ai.needTarget &&
        ai.needTargetTile &&
        this.validFacility &&
        !this.validFacility(entity, ai.needTarget, ai.needTargetTile)
      ) {
        ai.needTargetTile = null;
        ai.needFacilityId = null;
        ai.path = [];
        ai.pathIndex = 0;
        ai.state = 'needs';
      }
      if (ai.state === 'needs') this.handleNeeds(world, entity, ai, pos, dt);
      else if (ai.state === 'moving') this.move(world, entity, ai, pos, dt);
      else if (ai.state === 'stuck' && ai.stateTimer >= this.config.stuckTimeout) {
        ai.path = [];
        ai.pathIndex = 0;
        ai.stateTimer = 0;
        ai.state = ai.needTarget ? 'needs' : 'idle';
        const job = world.getComponent(entity, Job);
        if (job) {
          job.type = 'idle';
          job.jobId = null;
          job.targetTile = null;
        }
      } else if (ai.state === 'done' && ai.stateTimer >= this.config.doneCooldown) {
        ai.state = 'idle';
        ai.stateTimer = 0;
      } else if (ai.state === 'idle' && ai.stateTimer >= this.config.idleTimeout) {
        this.wander(world, entity, ai, pos);
      }
      if (before !== ai.state) changes++;
    }
    return changes;
  }
  private handleNeeds(
    world: World,
    entity: number,
    ai: FollowerAI,
    pos: Transform,
    dt: number,
  ): void {
    const needs = world.getComponent(entity, Needs);
    if (!needs || !ai.needTarget) {
      this.finish(world, entity, ai);
      return;
    }
    if (needs[ai.needTarget] >= 85) {
      this.finish(world, entity, ai);
      return;
    }
    if (!ai.needTargetTile) {
      if ((this.retryAt.get(entity) ?? 0) > this.elapsed) return;
      const target = this.needFacilityProvider?.(ai.needTarget, pos, entity);
      if (!target) {
        ai.activityReason = `Waiting for ${ai.needTarget === 'hunger' ? 'food and a dining facility' : ai.needTarget + ' facility'}`;
        this.retryAt.set(entity, this.elapsed + this.config.needsCooldown);
        return;
      }
      ai.needTargetTile = target;
      ai.needFacilityId = target.id ?? null;
      ai.path = [];
      ai.pathIndex = 0;
    }
    const target = ai.needTargetTile;
    if (Math.hypot(target.x - pos.x, target.y - pos.y) > 0.08) {
      ai.state = 'moving';
      ai.stateTimer = 0;
      ai.activityReason = `Going to satisfy ${ai.needTarget}`;
      return;
    }
    const wanted = Math.min(85 - needs[ai.needTarget], RATE[ai.needTarget] * dt);
    const actual = this.useFacility ? this.useFacility(entity, ai.needTarget, wanted) : wanted;
    needs[ai.needTarget] = Math.min(100, needs[ai.needTarget] + Math.max(0, actual));
    ai.activityReason = actual > 0 ? `Restoring ${ai.needTarget}` : 'Waiting for food';
    if (needs[ai.needTarget] >= 85) this.finish(world, entity, ai);
  }
  private move(world: World, entity: number, ai: FollowerAI, pos: Transform, dt: number): void {
    const job = world.getComponent(entity, Job);
    const goal =
      world.getComponent(entity, OnRitual)?.target ?? ai.needTargetTile ?? job?.targetTile;
    if (!goal) {
      ai.state = 'idle';
      ai.path = [];
      return;
    }
    if (Math.hypot(goal.x - pos.x, goal.y - pos.y) <= 0.08) {
      this.arrive(ai, job);
      return;
    }
    const next = ai.path[ai.pathIndex];
    if (!next || !this.segmentOpen(pos, next)) {
      const route = this.pathfinder.findPath(Math.round(pos.x), Math.round(pos.y), goal.x, goal.y);
      if (!route.success) {
        ai.state = 'stuck';
        ai.stateTimer = 0;
        ai.path = [];
        ai.activityReason = 'Route blocked';
        return;
      }
      ai.path = route.path;
      ai.pathIndex = route.path.length > 1 ? 1 : 0;
    }
    let distanceLeft = this.config.moveSpeed * dt;
    while (distanceLeft > 0 && ai.pathIndex < ai.path.length) {
      const point = ai.path[ai.pathIndex];
      if (!this.segmentOpen(pos, point)) {
        ai.path = [];
        break;
      }
      const dx = point.x - pos.x,
        dy = point.y - pos.y,
        distance = Math.hypot(dx, dy);
      if (distance > 0.00001) pos.rotation = Math.atan2(dx, dy);
      if (distance <= distanceLeft) {
        pos.x = point.x;
        pos.y = point.y;
        ai.pathIndex++;
        distanceLeft -= distance;
      } else {
        pos.x += (dx / distance) * distanceLeft;
        pos.y += (dy / distance) * distanceLeft;
        distanceLeft = 0;
      }
      ai.stateTimer = 0;
    }
    if (Math.hypot(goal.x - pos.x, goal.y - pos.y) <= 0.08) this.arrive(ai, job);
  }
  private segmentOpen(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 3));
    for (let i = 1; i <= steps; i++) {
      if (
        !this.map.isBuildable(
          Math.round(from.x + ((to.x - from.x) * i) / steps),
          Math.round(from.y + ((to.y - from.y) * i) / steps),
        )
      )
        return false;
    }
    return true;
  }
  private arrive(ai: FollowerAI, job?: Job): void {
    ai.path = [];
    ai.pathIndex = 0;
    ai.stateTimer = 0;
    if (ai.needTarget) ai.state = 'needs';
    else if (job && job.type !== 'idle' && job.type !== 'wander') {
      ai.state = 'working';
      ai.activityReason = `Working: ${job.type}`;
    } else {
      ai.state = 'done';
      ai.activityReason = 'Free time';
      if (job) {
        job.type = 'idle';
        job.targetTile = null;
      }
    }
  }
  private finish(world: World, entity: number, ai: FollowerAI): void {
    ai.needTarget = null;
    ai.needTargetTile = null;
    ai.needFacilityId = null;
    ai.path = [];
    ai.pathIndex = 0;
    ai.stateTimer = 0;
    ai.activityReason = 'Available';
    const job = world.getComponent(entity, Job);
    ai.state = job?.targetTile && job.type !== 'wander' && job.type !== 'idle' ? 'moving' : 'idle';
    this.retryAt.delete(entity);
  }
  private wander(world: World, entity: number, ai: FollowerAI, pos: Transform): void {
    ai.stateTimer = 0;
    const job = world.getComponent(entity, Job);
    if (!job || (job.type !== 'idle' && job.type !== 'wander')) return;
    for (let i = 0; i < 4; i++) {
      const x = Math.round(pos.x) + (Math.floor(Math.random() * 7) - 3),
        y = Math.round(pos.y) + (Math.floor(Math.random() * 7) - 3);
      if (!this.map.isBuildable(x, y)) continue;
      const route = this.pathfinder.findPath(Math.round(pos.x), Math.round(pos.y), x, y);
      if (!route.success || route.path.length < 2) continue;
      job.type = 'wander';
      job.targetTile = { x, y };
      ai.path = route.path;
      ai.pathIndex = 1;
      ai.state = 'moving';
      ai.activityReason = 'Free time';
      return;
    }
  }
}
