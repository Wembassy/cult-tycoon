import type { Entity } from './Entity';
import type { Component } from './Component';

/**
 * ECS World — central entity registry and component store.
 * Entities are numeric IDs. Components are stored in Maps keyed by entity ID.
 */
export class World {
  private nextEntityId = 0;
  private entitySet = new Set<Entity>();
  private components = new Map<string, Map<Entity, Component>>();

  /**
   * Create a new entity and return its ID
   */
  createEntity(requestedId?: number): Entity {
    const id = requestedId ?? this.nextEntityId;
    if (!Number.isSafeInteger(id) || id < 0 || this.entitySet.has(id))
      throw new Error('Invalid or duplicate entity ID');
    this.nextEntityId = Math.max(this.nextEntityId, id + 1);
    this.entitySet.add(id);
    return id;
  }

  /**
   * Remove an entity and all its components
   */
  destroyEntity(entity: Entity): void {
    if (!this.entitySet.has(entity)) return;
    this.entitySet.delete(entity);
    for (const store of this.components.values()) {
      store.delete(entity);
    }
  }

  /**
   * Check if an entity exists
   */
  hasEntity(entity: Entity): boolean {
    return this.entitySet.has(entity);
  }

  /**
   * Add a component to an entity
   */
  addComponent<T extends Component>(entity: Entity, component: T): void {
    if (!this.entitySet.has(entity)) {
      throw new Error(`Entity ${entity} does not exist`);
    }
    const typeName = component.constructor.name;
    if (!this.components.has(typeName)) {
      this.components.set(typeName, new Map());
    }
    this.components.get(typeName)!.set(entity, component);
  }

  /**
   * Remove a component type from an entity
   */
  removeComponent<T extends Component>(
    entity: Entity,
    componentType: new (entity: Entity) => T,
  ): void {
    const typeName = componentType.name;
    const store = this.components.get(typeName);
    if (store) {
      store.delete(entity);
    }
  }

  /**
   * Get a component for an entity, or undefined
   */
  getComponent<T extends Component>(
    entity: Entity,
    componentType: new (entity: Entity) => T,
  ): T | undefined {
    const typeName = componentType.name;
    const store = this.components.get(typeName);
    if (!store) return undefined;
    return store.get(entity) as T | undefined;
  }

  /**
   * Check if an entity has a component
   */
  hasComponent<T extends Component>(
    entity: Entity,
    componentType: new (entity: Entity) => T,
  ): boolean {
    const typeName = componentType.name;
    const store = this.components.get(typeName);
    return store ? store.has(entity) : false;
  }

  /**
   * Query all entities that have ALL of the specified component types
   */
  query(componentTypes: (new (entity: Entity) => Component)[]): Entity[] {
    if (componentTypes.length === 0) {
      return Array.from(this.entitySet);
    }

    // Find the smallest component store to iterate
    let smallestStore: Map<Entity, Component> | null = null;
    let smallestSize = Infinity;

    for (const ct of componentTypes) {
      const store = this.components.get(ct.name);
      if (!store || store.size === 0) return [];
      if (store.size < smallestSize) {
        smallestSize = store.size;
        smallestStore = store;
      }
    }

    if (!smallestStore) return [];

    const result: Entity[] = [];
    for (const entity of smallestStore.keys()) {
      let hasAll = true;
      for (const ct of componentTypes) {
        const store = this.components.get(ct.name);
        if (!store || !store.has(entity)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) result.push(entity);
    }
    return result;
  }

  /**
   * Get all entities
   */
  allEntities(): Entity[] {
    return Array.from(this.entitySet);
  }

  /**
   * Get count of entities
   */
  get entityCount(): number {
    return this.entitySet.size;
  }

  /**
   * Clear all entities and components
   */
  clear(): void {
    this.entitySet.clear();
    this.components.clear();
    this.nextEntityId = 0;
  }
}
