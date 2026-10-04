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
import { Transform } from '../components/Transform';
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
  reservedFrom?: 'ground' | 'stockpiled';
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
  materialDelivery?: { requestId: string; kind: 'wood' | 'stone'; quantity: number };
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

  /**
   * Reserve exact quantities from physical wood/stone stacks for a blueprint.
   * Returns the quantity newly scheduled. One source stack is reserved at a
   * time so normal stockpile hauling cannot race the same physical resource.
   */
  ensureMaterialDelivery(
    requestId: string,
    kind: 'wood' | 'stone',
    quantityNeeded: number,
    target: { x: number; y: number },
    priority = 14,
  ): number {
    const existingScheduled = [
      ...this.jobSystem.getPostedJobs(),
      ...this.jobSystem.getAssignedJobs().map(assigned => assigned.posting),
    ].reduce((total, job) => {
      if (job.metadata?.requestId !== requestId) return total;
      if (job.metadata?.stage !== 'material-pickup' && job.metadata?.stage !== 'material-deliver') return total;
      return total + Number(job.metadata?.quantity ?? 0);
    }, 0);

    let remaining = Math.max(0, Math.floor(quantityNeeded) - existingScheduled);
    let scheduled = 0;
    if (remaining <= 0) return 0;

    const candidates = Array.from(this.stacks.values())
      .filter(stack =>
        stack.kind === kind &&
        (stack.state === 'ground' || stack.state === 'stockpiled') &&
        !stack.reservedJobId &&
        stack.quantity > 0,
      )
      .sort((a, b) => {
        const da = Math.abs(a.x - target.x) + Math.abs(a.y - target.y);
        const db = Math.abs(b.x - target.x) + Math.abs(b.y - target.y);
        return da - db;
      });

    let sequence = 0;
    for (const stack of candidates) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, stack.quantity);
      const jobId = `material:pickup:${requestId}:${sequence++}:${stack.id}`;
      const sourceState = stack.state as 'ground' | 'stockpiled';
      stack.reservedFrom = sourceState;
      stack.state = 'reserved';
      stack.reservedJobId = jobId;

      this.jobSystem.postJob({
        id: jobId,
        type: 'haul',
        targetTile: { x: stack.x, y: stack.y },
        priority,
        duration: 0.35,
        metadata: {
          stage: 'material-pickup',
          requestId,
          stackId: stack.id,
          kind,
          quantity,
          targetX: target.x,
          targetY: target.y,
          sourceState,
        },
      });

      remaining -= quantity;
      scheduled += quantity;
    }

    return scheduled;
  }

  cancelMaterialRequest(requestId: string, world: World): void {
    const jobs = [
      ...this.jobSystem.getPostedJobs(),
      ...this.jobSystem.getAssignedJobs().map(assigned => assigned.posting),
    ].filter(job =>
      job.metadata?.requestId === requestId &&
      (job.metadata?.stage === 'material-pickup' || job.metadata?.stage === 'material-deliver'),
    );

    const cancelled = new Set<string>();
    for (const job of jobs) {
      if (cancelled.has(job.id)) continue;
      cancelled.add(job.id);

      const stage = String(job.metadata?.stage ?? '');
      const stackId = String(job.metadata?.stackId ?? '');
      const quantity = Math.max(0, Number(job.metadata?.quantity ?? 0));
      const kind = String(job.metadata?.kind ?? '') as 'wood' | 'stone';

      if (stage === 'material-pickup') {
        const stack = this.stacks.get(stackId);
        if (stack?.reservedJobId === job.id) {
          const source = stack.reservedFrom ?? 'ground';
          stack.state = source;
          stack.reservedFrom = undefined;
          stack.reservedJobId = undefined;
        }
      } else if (stage === 'material-deliver' && job.requiredEntity !== undefined && quantity > 0) {
        const inventory = world.getComponent(job.requiredEntity, Inventory);
        const transform = world.getComponent(job.requiredEntity, Transform);
        if (inventory) this.removeInventory(inventory, kind, quantity);
        this.stacks.delete(stackId);
        if (transform) this.addStack(kind, quantity, transform.x, transform.y);
      }

      this.jobSystem.cancelJob(job.id, world);
    }

    this.ensureHaulJobs();
  }

  handleJobCompleted(
    posting: JobPosting,
    entity: number,
    world: World,
    resources: GameState['resources'],
  ): LogisticsJobResult {
    if (!posting.id.startsWith('haul:') && !posting.id.startsWith('material:')) {
      return { handled: false, changed: false };
    }

    const stackId = String(posting.metadata?.stackId ?? '');
    const stack = this.stacks.get(stackId);
    if (!stack) return { handled: true, changed: false };

    const inventory = world.getComponent(entity, Inventory);
    if (!inventory) {
      this.releaseStackReservation(stack);
      return { handled: true, changed: true, message: 'Follower has no inventory for hauling.' };
    }

    const stage = String(posting.metadata?.stage ?? '');

    if (stage === 'material-pickup') {
      const requestId = String(posting.metadata?.requestId ?? '');
      const quantity = Math.max(0, Number(posting.metadata?.quantity ?? 0));
      const targetX = Number(posting.metadata?.targetX);
      const targetY = Number(posting.metadata?.targetY);
      const kind = String(posting.metadata?.kind ?? '') as 'wood' | 'stone';
      if (!requestId || quantity <= 0 || (kind !== 'wood' && kind !== 'stone')) {
        this.releaseStackReservation(stack);
        return { handled: true, changed: true };
      }

      const taken = Math.min(quantity, stack.quantity);
      const sourceState = stack.reservedFrom ?? 'ground';
      const originalQuantity = stack.quantity;
      const originalStockpileId = stack.stockpileId;

      // Split excess back into its original location/state so only the exact
      // requested amount enters the follower's inventory.
      if (originalQuantity > taken) {
        const remainder: ItemStack = {
          id: `stack:${this.nextStackId++}`,
          kind,
          quantity: originalQuantity - taken,
          x: stack.x,
          y: stack.y,
          state: sourceState,
          stockpileId: sourceState === 'stockpiled' ? originalStockpileId : undefined,
        };
        this.stacks.set(remainder.id, remainder);
      }

      this.addInventory(inventory, kind, taken);
      stack.quantity = taken;
      stack.state = 'carried';
      stack.carriedBy = entity;
      stack.stockpileId = undefined;
      stack.reservedFrom = undefined;

      const deliveryJobId = `material:deliver:${requestId}:${stack.id}`;
      stack.reservedJobId = deliveryJobId;
      this.jobSystem.postJob({
        id: deliveryJobId,
        type: 'haul',
        targetTile: { x: targetX, y: targetY },
        priority: 16,
        duration: 0.35,
        requiredEntity: entity,
        metadata: {
          stage: 'material-deliver',
          requestId,
          stackId: stack.id,
          kind,
          quantity: taken,
          targetX,
          targetY,
        },
      });
      this.ensureHaulJobs();
      return { handled: true, changed: true };
    }

    if (stage === 'material-deliver') {
      const requestId = String(posting.metadata?.requestId ?? '');
      const quantity = Math.max(0, Number(posting.metadata?.quantity ?? 0));
      const kind = String(posting.metadata?.kind ?? '') as 'wood' | 'stone';
      if (!requestId || quantity <= 0 || (kind !== 'wood' && kind !== 'stone')) {
        return { handled: true, changed: false };
      }
      this.removeInventory(inventory, kind, quantity);
      this.stacks.delete(stack.id);
      return {
        handled: true,
        changed: true,
        materialDelivery: { requestId, kind, quantity },
        message: `Delivered ${quantity} ${kind} to construction.`,
      };
    }

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

      if (stack.kind !== 'wood' && stack.kind !== 'stone') {
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
        reservedFrom: undefined,
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
    stack.reservedFrom = undefined;
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
