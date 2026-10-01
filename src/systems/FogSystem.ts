/**
 * FogSystem — Updates fog of war each tick based on follower positions.
 * Runs every N ticks for performance (not every frame).
 */

import type { World } from '../ecs/World';
import type { System } from '../ecs/System';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { FogOfWar } from '../world/FogOfWar';

export class FogSystem implements System {
  private fog: FogOfWar;
  private updateInterval: number;
  private tickAccumulator = 0;

  constructor(fog: FogOfWar, updateInterval: number = 10) {
    this.fog = fog;
    this.updateInterval = updateInterval;
  }

  update(world: World, dt: number): void {
    this.tickAccumulator += dt;

    // Only update fog every N ticks for performance
    if (this.tickAccumulator < this.updateInterval) return;
    this.tickAccumulator = 0;

    // Gather positions of all entities with Transform + Renderable (followers, etc.)
    const entities = world.query([Transform, Renderable]);
    const positions: { x: number; y: number }[] = [];

    for (const entity of entities) {
      const transform = world.getComponent(entity, Transform)!;
      if (transform) {
        positions.push({ x: transform.x, y: transform.y });
      }
    }

    this.fog.update(positions);
  }

  get fogOfWar(): FogOfWar { return this.fog; }
}