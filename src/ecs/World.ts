/**
 * World — ECS entity registry and component storage.
 *
 * This is a minimal implementation sufficient for the game loop to compile.
 * Full entity/component management will be implemented in the ECS issue.
 */

type EntityId = number;

interface ComponentMap {
  [componentName: string]: Map<EntityId, unknown>;
}

export class World {
  private nextEntityId: EntityId = 0;
  private entities: Set<EntityId> = new Set();
  private components: ComponentMap = {};

  /** Create a new entity and return its ID. */
  createEntity(): EntityId {
    const id = this.nextEntityId++;
    this.entities.add(id);
    return id;
  }

  /** Remove an entity and all its components. */
  destroyEntity(id: EntityId): void {
    this.entities.delete(id);
    for (const componentName of Object.keys(this.components)) {
      this.components[componentName].delete(id);
    }
  }

  /** Add a component to an entity. */
  addComponent<T>(id: EntityId, componentName: string, data: T): void {
    if (!this.components[componentName]) {
      this.components[componentName] = new Map();
    }
    this.components[componentName].set(id, data);
  }

  /** Get a component for an entity, or undefined. */
  getComponent<T>(id: EntityId, componentName: string): T | undefined {
    return this.components[componentName]?.get(id) as T | undefined;
  }

  /** Remove a component from an entity. */
  removeComponent(id: EntityId, componentName: string): void {
    this.components[componentName]?.delete(id);
  }

  /** Check if an entity has a component. */
  hasComponent(id: EntityId, componentName: string): boolean {
    return this.components[componentName]?.has(id) ?? false;
  }

  /** Get all entity IDs that have the given component. */
  query(componentName: string): EntityId[] {
    return [...(this.components[componentName]?.keys() ?? [])];
  }

  /** Get all entity IDs. */
  allEntities(): EntityId[] {
    return [...this.entities];
  }

  /** Total entity count. */
  get entityCount(): number {
    return this.entities.size;
  }
}