/**
 * RenderSystem — ECS system that syncs Renderable + Transform components
 * to the SceneManager's Three.js meshes. Runs on render frames, not sim ticks.
 */

import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { SceneManager } from '../engine/SceneManager';

export class RenderSystem extends System {
  private sceneManager: SceneManager;

  constructor(sceneManager: SceneManager) {
    super();
    this.sceneManager = sceneManager;
  }

  update(_world: World, _dt: number): void {
    this.sceneManager.syncEntities();
  }
}