/**
 * LogisticsSystem — Physical resource stacks, stockpile zones, reservations,
 * and two-stage hauling.
 *
 * Compatibility bridge for Alpha:
 * - harvested resources exist physically in Local World Space first
 * - resources become "usable" global counters only after delivery to stockpile
 * - #64 can later consume/deliver these physical stacks directly to blueprints
 */

import type { World } from '../ecs/World';
import { Inventory } from '../components/Inventory';
import type { JobPosting, JobSystem } from './JobSystem';
import type { GameState } from '../game/GameState';

export type ItemKind = 'wood' | 'stone' | 'food' | 'crop' | 'meal';

export interface ItemStack {
  id: string;
  kind: ItemKind;
  quantity: number;
  /** Local World Space, same convention as follower Transform.x/y. */
  x: number;
  y: number;
  state: 'ground' | 'reserved' | 'carried' | 'stockpiled';
  stockpileId?: string;
  reservedJobId?: string;
  carriedBy?: number;
}

export interface StockpileZone {
  id: string;
  /** Fine Construction Space cells. */
  cells: { x: number; y: number }[];
  filters: ItemKind[];
  priority: number;
}

export interface LogisticsSnapshot {
  stacks: ItemStack[];
  stockpiles: StockpileZone[];
  nextStackId: number;
  nextStockpileId: number;
}

export interface LogisticsJobResult {
  handled: boolean;
  changed: boolean;
  message?: string;
}

export class LogisticsSystem {
  private stacks = new Map<string, ItemStack>();
  private stockpiles = new Map<string, StockpileZone>();
  private reservedDestinationCells = new Map<string, string>();
  private nextStackId = 1;
  private nextStockpileId = 1;

  constructor(
    private readonly constructionSubdivisions: number,
    private readonly jobSystem: JobSystem,
  ) {}

  addStack(kind: ItemKind, quantity: number, x: number, y: number): ItemStack {
    const stack: ItemStack = {
      id: `stack:${this.nextStackId++}`,
      kind,
      quantity: Math.max(1, Math.floor(quantity)),
      x,
      y,
      state: 'ground',
    };
    this.stacks.set(stack.id, stack);
    this.ensureHaulJobs();
    return { ...stack };
  }

  getStacks(): ItemStack[] {
    return Array.from(this.stacks.values()).map(stack => ({ ...stack }));
  }

  getStockpiles(): StockpileZone[] {
    return Array.from(this.stockpiles.values()).map(zone => ({
      ...zone,
      cells: zone.cells.map(cell => ({ ...cell })),
      filters: [...zone.filters],
    }));
  }

  designateStockpile(
    cells: { x: number; y: number }[],
    filters: ItemKind[] = ['wood', 'stone', 'food', 'crop', 'meal'],
    priority = 1,
  ): StockpileZone | null {
    const unique = new Map<string, { x: number; y: number }>();
    for (const cell of cells) unique.set(this.cellKey(cell.x, cell.y), { ...cell });
    if (unique.size === 0) return null;

    const zone: StockpileZone = {
      id: `stockpile:${this.nextStockpileId++}`,
      cells: Array.from(unique.values()),
      filters: [...new Set(filters)],
      priority,
    };
    this.stockpiles.set(zone.id, zone);
    this.ensureHaulJobs();
    return this.cloneZone(zone);
  }

  removeStockpile(id: string): boolean {
    if (!this.stockpiles.delete(id)) return false;

    for (const stack of this.stacks.values()) {
      if (stack.stockpileId === id) {
        stack.stockpileId = undefined;
        if (stack.state === 'stockpiled') stack.state = 'ground';
      }
    }
    for (const [key, zoneId] of this.reservedDestinationCells) {
      if (zoneId === id) this.reservedDestinationCells.delete(key);
    }
    this.ensureHaulJobs();
    return true;
  }

  setStockpileFilters(id: string, filters: ItemKind[]): boolean {
    const zone = this.stockpiles.get(id);
    if (!zone) return false;
    zone.filters = [...new Set(filters)];

    for (const stack of this.stacks.values()) {
      if (stack.stockpileId === id && !zone.filters.includes(stack.kind)) {
        stack.stockpileId = undefined;
        if (stack.state === 'stockpiled') stack.state = 'ground';
      }
    }
    this.ensureHaulJobs();
    return true;
  }

  /**
   * Post pickup jobs for all unreserved ground stacks that have a valid
   * stockpile destination. Job IDs are also the item reservation IDs.
   */
  ensureHaulJobs(): void {
    for (const stack of this.stacks.values()) {
      if (stack.state !== 'ground' || stack.reservedJobId) continue;
      const destination = this.findDestination(stack);
      if (!destination) continue;

      const jobId = `haul:pickup:${stack.id}`;
      stack.state = 'reserved';
      stack.reservedJobId = jobId;
      stack.stockpileId = destination.zone.id;
      this.reservedDestinationCells.set(
        this.destinationKey(destination.zone.id, destination.cell.x, destination.cell.y),
        stack.id,
      );

      this.jobSystem.postJob({
        id: jobId,
        type: 'haul',
        targetTile: { x: stack.x, y: stack.y },
        priority: 8 + destination.zone.priority,
        duration: 0.35,
        metadata: {
          stage: 'pickup',
          stackId: stack.id,
          stockpileId: destination.zone.id,
          destinationX: destination.cell.x,
          destinationY: destination.cell.y,
        },
      });
    }
  }

  handleJobCompleted(
    posting: JobPosting,
    entity: number,
    world: World,
    resources: GameState['resources'],
  ): LogisticsJobResult {
    if (!posting.id.startsWith('haul:')) return { handled: false, changed: false };

    const stackId = String(posting.metadata?.stackId ?? '');
    const stack = this.stacks.get(stackId);
    if (!stack) return { handled: true, changed: false };

    const inventory = world.getComponent(entity, Inventory);
    if (!inventory) {
      this.releaseStackReservation(stack);
      return { handled: true, changed: true, message: 'Follower has no inventory for hauling.' };
    }

    const stage = String(posting.metadata?.stage ?? '');
    if (stage === 'pickup') {
      const destinationX = Number(posting.metadata?.destinationX);
      const destinationY = Number(posting.metadata?.destinationY);
      const stockpileId = String(posting.metadata?.stockpileId ?? '');
      const zone = this.stockpiles.get(stockpileId);
      if (!zone || !zone.filters.includes(stack.kind)) {
        this.releaseStackReservation(stack);
        return { handled: true, changed: true };
      }

      this.addInventory(inventory, stack.kind, stack.quantity);
      stack.state = 'carried';
      stack.carriedBy = entity;
      stack.reservedJobId = `haul:deliver:${stack.id}`;

      const destinationLocal = this.constructionCellToLocal(destinationX, destinationY);
      this.jobSystem.postJob({
        id: stack.reservedJobId,
        type: 'haul',
        targetTile: destinationLocal,
        priority: 12,
        duration: 0.35,
        requiredEntity: entity,
        metadata: {
          stage: 'deliver',
          stackId: stack.id,
          stockpileId,
          destinationX,
          destinationY,
        },
      });
      return { handled: true, changed: true };
    }

    if (stage === 'deliver') {
      const destinationX = Number(posting.metadata?.destinationX);
      const destinationY = Number(posting.metadata?.destinationY);
      const stockpileId = String(posting.metadata?.stockpileId ?? '');
      const zone = this.stockpiles.get(stockpileId);
      if (!zone) {
        this.removeInventory(inventory, stack.kind, stack.quantity);
        stack.state = 'ground';
        stack.carriedBy = undefined;
        stack.reservedJobId = undefined;
        stack.stockpileId = undefined;
        return { handled: true, changed: true };
      }

      this.removeInventory(inventory, stack.kind, stack.quantity);
      const local = this.constructionCellToLocal(destinationX, destinationY);
      stack.x = local.x;
      stack.y = local.y;
      stack.state = 'stockpiled';
      stack.stockpileId = stockpileId;
      stack.carriedBy = undefined;
      stack.reservedJobId = undefined;
      this.reservedDestinationCells.delete(
        this.destinationKey(stockpileId, destinationX, destinationY),
      );

      if (stack.kind === 'wood' || stack.kind === 'stone') {
        resources.materials += stack.quantity;
      } else {
        resources.food += stack.quantity;
      }

      return {
        handled: true,
        changed: true,
        message: `Stockpiled ${stack.quantity} ${stack.kind}.`,
      };
    }

    return { handled: true, changed: false };
  }

  getSnapshot(): LogisticsSnapshot {
    return {
      stacks: this.getStacks(),
      stockpiles: this.getStockpiles(),
      nextStackId: this.nextStackId,
      nextStockpileId: this.nextStockpileId,
    };
  }

  restoreSnapshot(snapshot: LogisticsSnapshot | undefined, world?: World): void {
    this.stacks.clear();
    this.stockpiles.clear();
    this.reservedDestinationCells.clear();

    if (!snapshot) {
      this.nextStackId = 1;
      this.nextStockpileId = 1;
      return;
    }

    for (const zone of snapshot.stockpiles ?? []) {
      this.stockpiles.set(zone.id, this.cloneZone(zone));
    }

    // Assigned jobs are not restored directly. Any in-flight resource returns
    // to the ground and receives a fresh reservation after load.
    for (const saved of snapshot.stacks ?? []) {
      if (saved.state === 'carried' && saved.carriedBy !== undefined && world) {
        const inventory = world.getComponent(saved.carriedBy, Inventory);
        if (inventory) this.removeInventory(inventory, saved.kind, saved.quantity);
      }

      const stack: ItemStack = {
        ...saved,
        state: saved.state === 'stockpiled' ? 'stockpiled' : 'ground',
        reservedJobId: undefined,
        carriedBy: undefined,
      };
      this.stacks.set(stack.id, stack);
    }

    this.nextStackId = snapshot.nextStackId ?? 1;
    this.nextStockpileId = snapshot.nextStockpileId ?? 1;
    this.ensureHaulJobs();
  }

  private findDestination(
    stack: ItemStack,
  ): { zone: StockpileZone; cell: { x: number; y: number } } | null {
    const zones = Array.from(this.stockpiles.values())
      .filter(zone => zone.filters.includes(stack.kind))
      .sort((a, b) => b.priority - a.priority);

    let best: { zone: StockpileZone; cell: { x: number; y: number }; distance: number } | null = null;
    for (const zone of zones) {
      for (const cell of zone.cells) {
        if (this.isDestinationOccupied(zone.id, cell.x, cell.y, stack.id)) continue;
        const local = this.constructionCellToLocal(cell.x, cell.y);
        const distance = Math.abs(local.x - stack.x) + Math.abs(local.y - stack.y);
        if (!best || distance < best.distance) best = { zone, cell, distance };
      }
    }
    return best ? { zone: best.zone, cell: best.cell } : null;
  }

  private isDestinationOccupied(
    zoneId: string,
    x: number,
    y: number,
    ignoreStackId?: string,
  ): boolean {
    const reservation = this.reservedDestinationCells.get(this.destinationKey(zoneId, x, y));
    if (reservation && reservation !== ignoreStackId) return true;

    const local = this.constructionCellToLocal(x, y);
    return Array.from(this.stacks.values()).some(stack =>
      stack.id !== ignoreStackId &&
      stack.state === 'stockpiled' &&
      stack.stockpileId === zoneId &&
      Math.abs(stack.x - local.x) < 0.001 &&
      Math.abs(stack.y - local.y) < 0.001,
    );
  }

  private releaseStackReservation(stack: ItemStack): void {
    if (stack.stockpileId) {
      for (const [key, stackId] of this.reservedDestinationCells) {
        if (stackId === stack.id) this.reservedDestinationCells.delete(key);
      }
    }
    stack.state = 'ground';
    stack.reservedJobId = undefined;
    stack.stockpileId = undefined;
    stack.carriedBy = undefined;
  }

  private addInventory(inventory: Inventory, kind: ItemKind, quantity: number): void {
    const existing = inventory.items.find(item => item.id === kind);
    if (existing) existing.quantity += quantity;
    else inventory.items.push({ id: kind, quantity });
  }

  private removeInventory(inventory: Inventory, kind: ItemKind, quantity: number): void {
    const existing = inventory.items.find(item => item.id === kind);
    if (!existing) return;
    existing.quantity = Math.max(0, existing.quantity - quantity);
    if (existing.quantity === 0) {
      inventory.items = inventory.items.filter(item => item !== existing);
    }
  }

  private constructionCellToLocal(x: number, y: number): { x: number; y: number } {
    return {
      x: (x + 0.5) / this.constructionSubdivisions - 0.5,
      y: (y + 0.5) / this.constructionSubdivisions - 0.5,
    };
  }

  private cellKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  private destinationKey(zoneId: string, x: number, y: number): string {
    return `${zoneId}:${x},${y}`;
  }

  private cloneZone(zone: StockpileZone): StockpileZone {
    return {
      ...zone,
      cells: zone.cells.map(cell => ({ ...cell })),
      filters: [...zone.filters],
    };
  }
}
