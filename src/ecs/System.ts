import type { World } from './World';

/**
 * Base System class — systems contain logic, no data.
 * Override update() to process entities each simulation tick.
 * Parameter order: (world, dt) — world first, dt second.
 */
export abstract class System {
  abstract update(world: World, dt: number): void;
}