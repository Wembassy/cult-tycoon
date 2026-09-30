import type { World } from './World';

/**
 * Base System class — systems contain logic, no data.
 * Override update() to process entities each simulation tick.
 */
export abstract class System {
  abstract update(dt: number, world: World): void;
}