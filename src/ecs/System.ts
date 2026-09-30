/**
 * System — Base class for ECS systems.
 * Systems contain logic and operate on entities with matching components.
 * Each system's update() is called during the fixed simulation tick.
 */

import { World } from './World';

export abstract class System {
  /** Called at each fixed simulation step. Override in subclasses. */
  abstract update(dt: number, world: World): void;
}