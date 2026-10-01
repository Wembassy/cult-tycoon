/**
 * InvestigatorSystem — Spawns investigators when notoriety is high.
 * Investigators walk to the cult base, inspect for 30 seconds, then leave.
 * If they complete inspection, notoriety increases by 10.
 * If caught by a follower performing a ritual, they are converted or flee.
 */

import type { World } from '../ecs/World';
import { Transform } from '../components/Transform';
import { FollowerAI } from '../components/FollowerAI';
import { Needs } from '../components/Needs';
import { Traits } from '../components/Traits';
import { TileMap } from '../world/TileMap';
import { Pathfinder } from '../world/Pathfinder';

export type InvestigatorState = 'spawning' | 'moving_to_base' | 'inspecting' | 'leaving' | 'converted' | 'fled';

export interface Investigator {
  id: string;
  entity: number;
  state: InvestigatorState;
  path: { x: number; y: number }[];
  pathIndex: number;
  inspectTimer: number;   // seconds spent inspecting
  inspectDuration: number; // total seconds needed
  spawnTick: number;
}

export interface InvestigatorSystemCallbacks {
  onInvestigatorSpawn?: (investigator: Investigator) => void;
  onInvestigatorInspectComplete?: (investigator: Investigator) => void;
  onInvestigatorConverted?: (investigator: Investigator) => void;
  onInvestigatorFled?: (investigator: Investigator) => void;
}

export class InvestigatorSystem {
  private investigators: Investigator[] = [];
  private notoriety = 0;
  private tickCount = 0;
  private nextId = 0;
  private map: TileMap;
  private pathfinder: Pathfinder;
  private baseX: number;
  private baseY: number;
  private callbacks: InvestigatorSystemCallbacks;
  private rng: () => number;
  private spawnCooldown = 0; // seconds until next spawn attempt

  constructor(
    map: TileMap,
    pathfinder: Pathfinder,
    baseX: number = 16,
    baseY: number = 16,
    callbacks: InvestigatorSystemCallbacks = {},
    seed: number = Date.now(),
  ) {
    this.map = map;
    this.pathfinder = pathfinder;
    this.baseX = baseX;
    this.baseY = baseY;
    this.callbacks = callbacks;
    let state = seed;
    this.rng = () => {
      state = (state * 1664525 + 1013904223) | 0;
      return ((state >>> 0) % 10000) / 10000;
    };
  }

  /**
   * Set the current notoriety level (called from CultManagementSystem).
   */
  setNotoriety(notoriety: number): void {
    this.notoriety = notoriety;
  }

  /**
   * Get active investigators.
   */
  getActiveInvestigators(): Investigator[] {
    return this.investigators.filter(i => i.state !== 'converted' && i.state !== 'fled');
  }

  /**
   * Get all investigators (including converted/fled).
   */
  getAllInvestigators(): Investigator[] {
    return [...this.investigators];
  }

  /**
   * Calculate how many investigators should exist based on notoriety.
   * At notoriety > 50, 1 investigator per 20 notoriety above 50.
   * Max: (100 - 50) / 20 = 2.5 → 2 investigators at a time.
   */
  getTargetInvestigatorCount(): number {
    if (this.notoriety <= 50) return 0;
    return Math.floor((this.notoriety - 50) / 20);
  }

  /**
   * Pick a spawn location at the map edge.
   */
  private pickSpawnLocation(): { x: number; y: number } {
    const edges: { x: number; y: number }[] = [];
    const w = this.map.width;
    const h = this.map.height;

    // Sample edges
    for (let i = 0; i < w; i += 2) {
      edges.push({ x: i, y: 0 });
      edges.push({ x: i, y: h - 1 });
    }
    for (let i = 0; i < h; i += 2) {
      edges.push({ x: 0, y: i });
      edges.push({ x: w - 1, y: i });
    }

    // Pick a random edge tile that's passable
    const shuffled = edges.sort(() => this.rng() - 0.5);
    for (const edge of shuffled) {
      const tile = this.map.getTile(edge.x, edge.y);
      if (tile && !tile.occupied && tile.terrain !== 'water') {
        return edge;
      }
    }

    // Fallback
    return { x: 0, y: 0 };
  }

  /**
   * Spawn a new investigator entity.
   */
  spawnInvestigator(world: World): Investigator {
    const spawn = this.pickSpawnLocation();
    const entity = world.createEntity();

    // Add transform at spawn location
    const transform = new Transform(entity);
    transform.x = spawn.x;
    transform.y = spawn.y;
    world.addComponent(entity, transform);

    // Add FollowerAI for movement tracking
    const ai = new FollowerAI(entity);
    ai.state = 'moving';
    world.addComponent(entity, ai);

    // Path from spawn to base
    const pathResult = this.pathfinder.findPath(spawn.x, spawn.y, this.baseX, this.baseY);
    const path = pathResult.success ? pathResult.path : [{ x: this.baseX, y: this.baseY }];

    const investigator: Investigator = {
      id: `inv_${this.nextId++}`,
      entity,
      state: 'moving_to_base',
      path,
      pathIndex: 0,
      inspectTimer: 0,
      inspectDuration: 30, // 30 seconds to inspect
      spawnTick: this.tickCount,
    };

    this.investigators.push(investigator);
    this.callbacks.onInvestigatorSpawn?.(investigator);
    return investigator;
  }

  /**
   * Check if any follower is performing a ritual near the investigator.
   * Returns true if caught (investigator should be converted or flee).
   */
  private checkRitualProximity(world: World, investigator: Investigator): boolean {
    const transform = world.getComponent(investigator.entity, Transform);
    if (!transform) return false;

    const ritualPerformers = world.query([Needs, FollowerAI]);
    for (const entityId of ritualPerformers) {
      const performerTransform = world.getComponent(entityId, Transform);
      const performerAI = world.getComponent(entityId, FollowerAI);
      if (!performerTransform || !performerAI) continue;

      // Check if follower is working (performing ritual)
      if (performerAI.state !== 'working') continue;

      const dx = performerTransform.x - transform.x;
      const dy = performerTransform.y - transform.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Within 3 tiles = caught
      if (dist <= 3.0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Move an investigator along its path.
   */
  private moveInvestigator(world: World, investigator: Investigator, dt: number): void {
    const transform = world.getComponent(investigator.entity, Transform);
    if (!transform) return;

    if (investigator.pathIndex >= investigator.path.length) {
      // Reached destination
      return;
    }

    const target = investigator.path[investigator.pathIndex];
    const dx = target.x - transform.x;
    const dy = target.y - transform.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const speed = 2.0; // tiles per second

    if (dist < speed * dt) {
      // Snap to target
      transform.x = target.x;
      transform.y = target.y;
      investigator.pathIndex++;
    } else {
      transform.x += (dx / dist) * speed * dt;
      transform.y += (dy / dist) * speed * dt;
    }
  }

  /**
   * Update investigator system each tick.
   */
  update(world: World, dt: number): void {
    this.tickCount += dt;

    // Handle spawning
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0) {
      const target = this.getTargetInvestigatorCount();
      const active = this.getActiveInvestigators().length;
      if (active < target) {
        this.spawnInvestigator(world);
      }
      // Check again in 30-60 seconds
      this.spawnCooldown = 30 + this.rng() * 30;
    }

    // Update each investigator
    for (const inv of this.investigators) {
      if (inv.state === 'converted' || inv.state === 'fled') continue;

      switch (inv.state) {
        case 'moving_to_base': {
          this.moveInvestigator(world, inv, dt);

          // Check if reached the base
          const transform = world.getComponent(inv.entity, Transform);
          if (!transform) {
            inv.state = 'fled';
            this.callbacks.onInvestigatorFled?.(inv);
            break;
          }

          const dx = this.baseX - transform.x;
          const dy = this.baseY - transform.y;
          if (Math.sqrt(dx * dx + dy * dy) < 1.5 || inv.pathIndex >= inv.path.length) {
            inv.state = 'inspecting';
            inv.inspectTimer = 0;
          }

          // Check if caught by ritual performer while moving
          if (this.checkRitualProximity(world, inv)) {
            // 50% chance to convert, 50% chance to flee
            if (this.rng() < 0.5) {
              inv.state = 'converted';
              this.callbacks.onInvestigatorConverted?.(inv);
            } else {
              inv.state = 'fled';
              this.callbacks.onInvestigatorFled?.(inv);
            }
          }
          break;
        }

        case 'inspecting': {
          inv.inspectTimer += dt;

          // Check if caught by ritual performer during inspection
          if (this.checkRitualProximity(world, inv)) {
            if (this.rng() < 0.5) {
              inv.state = 'converted';
              this.callbacks.onInvestigatorConverted?.(inv);
            } else {
              inv.state = 'fled';
              this.callbacks.onInvestigatorFled?.(inv);
            }
            break;
          }

          // Check if inspection complete
          if (inv.inspectTimer >= inv.inspectDuration) {
            inv.state = 'leaving';
            // Path back to a map edge
            const transform = world.getComponent(inv.entity, Transform);
            if (transform) {
              const edgeResult = this.pathfinder.findPath(
                Math.round(transform.x),
                Math.round(transform.y),
                0,
                0,
              );
              inv.path = edgeResult.success ? edgeResult.path : [{ x: 0, y: 0 }];
              inv.pathIndex = 0;
            }

            // Apply morale loss to followers from investigation
            // Paranoid followers lose 20% more morale (fun + sanity)
            const followers = world.query([Needs, FollowerAI, Traits]);
            for (const fEntity of followers) {
              const fTraits = world.getComponent(fEntity, Traits)!;
              const fNeeds = world.getComponent(fEntity, Needs)!;
              const moraleLossMult = fTraits.getInvestigationMoraleLossMult();
              const baseMoraleLoss = 5; // base morale damage from investigation
              const actualLoss = baseMoraleLoss * moraleLossMult;
              fNeeds.fun = Math.max(0, fNeeds.fun - actualLoss);
              fNeeds.sanity = Math.max(0, fNeeds.sanity - actualLoss);
            }

            this.callbacks.onInvestigatorInspectComplete?.(inv);
          }
          break;
        }

        case 'leaving': {
          this.moveInvestigator(world, inv, dt);

          const transform = world.getComponent(inv.entity, Transform);
          if (!transform) {
            inv.state = 'fled';
            this.callbacks.onInvestigatorFled?.(inv);
            break;
          }

          // Check if reached the edge
          if (
            transform.x <= 1 || transform.y <= 1 ||
            transform.x >= this.map.width - 2 || transform.y >= this.map.height - 2 ||
            inv.pathIndex >= inv.path.length
          ) {
            inv.state = 'fled';
            this.callbacks.onInvestigatorFled?.(inv);
          }
          break;
        }

        case 'spawning':
          // Should transition to moving_to_base immediately
          inv.state = 'moving_to_base';
          break;
      }
    }

    // Clean up old converted/fled investigators (keep for stats but cap at 50)
    if (this.investigators.length > 50) {
      this.investigators = this.investigators.filter(
        i => i.state !== 'converted' && i.state !== 'fled',
      ).concat(this.investigators.filter(
        i => i.state === 'converted' || i.state === 'fled',
      ).slice(-20));
    }
  }

  /**
   * Reset the system (for new game).
   */
  reset(): void {
    this.investigators = [];
    this.notoriety = 0;
    this.tickCount = 0;
    this.spawnCooldown = 0;
    this.nextId = 0;
  }

  /**
   * Get tick count.
   */
  get tick(): number {
    return this.tickCount;
  }
}