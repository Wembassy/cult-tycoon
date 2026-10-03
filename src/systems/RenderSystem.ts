/**
 * RenderSystem — ECS system that syncs Renderable + Transform components
 * to the SceneManager's Three.js meshes. Runs on render frames, not sim ticks.
 * Also syncs building visuals (walls, floors, doors, room labels, work stations)
 * when the BuildingSystem state changes.
 */

import { System } from '../ecs/System';
import type { World } from '../ecs/World';
import { SceneManager } from '../engine/SceneManager';
import type { BuildingSystem } from './BuildingSystem';

export class RenderSystem extends System {
  private sceneManager: SceneManager;
  private buildingSystem: BuildingSystem | null = null;

  constructor(sceneManager: SceneManager) {
    super();
    this.sceneManager = sceneManager;
  }

  /** Provide the BuildingSystem so building visuals can be synced. */
  setBuildingSystem(bs: BuildingSystem): void {
    this.buildingSystem = bs;
    this.sceneManager.setBuildingSystem(bs);
  }

  /** Provide follower names map for floating name labels. */
  setFollowerNames(names: Map<number, string>): void {
    this.sceneManager.setFollowerNames(names);
  }

  update(_world: World, dt: number): void {
    // Sync building visuals when dirty
    if (this.buildingSystem && this.buildingSystem.isDirty) {
      this.sceneManager.syncBuildings(this.buildingSystem);
      this.buildingSystem.clearDirty();
    }

    // Sync entity positions and meshes every frame
    this.sceneManager.syncEntities(dt);
  }
}
