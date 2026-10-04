/**
 * FarmingSystem — painted grow zones with finite plant/tend/harvest work.
 *
 * Grow zones live in fine Construction Space; crop jobs target Local World Space.
 * Temperature is a hook for the later global/local climate model.
 */

import type { World } from '../ecs/World';
import type { System } from '../ecs/System';
import type { JobPosting, JobSystem } from './JobSystem';
import type { LogisticsSystem } from './LogisticsSystem';

export type CropType = 'fast_root' | 'hearty_grain';
export type CropStage = 'bare' | 'growing' | 'ready';

export interface GrowZone {
  id: string;
  crop: CropType;
  cells: { x: number; y: number }[];
}

export interface CropPlot {
  zoneId: string;
  x: number;
  y: number;
  crop: CropType;
  stage: CropStage;
  growth: number;
  tended: boolean;
}

export interface FarmingSnapshot {
  zones: GrowZone[];
  plots: CropPlot[];
  nextZoneId: number;
  temperatureC: number;
}

const CROPS: Record<CropType, { growthSeconds: number; yield: number; idealMin: number; idealMax: number }> = {
  fast_root: { growthSeconds: 95, yield: 5, idealMin: 7, idealMax: 30 },
  hearty_grain: { growthSeconds: 150, yield: 9, idealMin: 3, idealMax: 26 },
};

export class FarmingSystem implements System {
  private zones = new Map<string, GrowZone>();
  private plots = new Map<string, CropPlot>();
  private nextZoneId = 1;
  private temperatureC = 18;

  constructor(
    private readonly constructionSubdivisions: number,
    private readonly jobs: JobSystem,
    private readonly logistics: LogisticsSystem,
  ) {}

  setTemperatureC(value: number): void {
    this.temperatureC = value;
  }

  designateZone(cells: { x: number; y: number }[], crop: CropType): GrowZone | null {
    const unique = new Map<string, { x: number; y: number }>();
    for (const cell of cells) unique.set(this.cellKey(cell.x, cell.y), { ...cell });
    if (unique.size === 0) return null;

    const incoming = new Set(unique.keys());
    for (const [zoneId, zone] of this.zones) {
      const retained = zone.cells.filter(cell => !incoming.has(this.cellKey(cell.x, cell.y)));
      if (retained.length === zone.cells.length) continue;
      zone.cells = retained;
      for (const key of incoming) {
        const plot = this.plots.get(key);
        if (plot?.zoneId === zoneId) this.plots.delete(key);
      }
      if (zone.cells.length === 0) this.zones.delete(zoneId);
    }

    const zone: GrowZone = {
      id: `grow:${this.nextZoneId++}`,
      crop,
      cells: Array.from(unique.values()),
    };
    this.zones.set(zone.id, zone);
    for (const cell of zone.cells) {
      this.plots.set(this.cellKey(cell.x, cell.y), {
        zoneId: zone.id,
        x: cell.x,
        y: cell.y,
        crop,
        stage: 'bare',
        growth: 0,
        tended: false,
      });
    }
    this.ensureJobs();
    return this.cloneZone(zone);
  }

  removeZone(id: string): boolean {
    const zone = this.zones.get(id);
    if (!zone) return false;
    this.zones.delete(id);
    for (const cell of zone.cells) this.plots.delete(this.cellKey(cell.x, cell.y));
    return true;
  }

  getZones(): GrowZone[] {
    return Array.from(this.zones.values()).map(zone => this.cloneZone(zone));
  }

  getPlots(): CropPlot[] {
    return Array.from(this.plots.values()).map(plot => ({ ...plot }));
  }

  update(_world: World, dt: number): void {
    for (const plot of this.plots.values()) {
      if (plot.stage !== 'growing') continue;
      const crop = CROPS[plot.crop];
      const temperatureFactor = this.temperatureFactor(plot.crop);
      if (temperatureFactor <= 0) continue;
      const tendFactor = plot.tended ? 1.2 : 1;
      plot.growth = Math.min(1, plot.growth + (dt / crop.growthSeconds) * temperatureFactor * tendFactor);
      if (plot.growth >= 1) plot.stage = 'ready';
    }
    this.ensureJobs();
  }

  handleJobCompleted(posting: JobPosting): boolean {
    if (posting.type !== 'grow' || !posting.id.startsWith('grow-job:')) return false;
    const stage = String(posting.metadata?.stage ?? '');
    const x = Number(posting.metadata?.cellX);
    const y = Number(posting.metadata?.cellY);
    const plot = this.plots.get(this.cellKey(x, y));
    if (!plot) return true;

    if (stage === 'plant' && plot.stage === 'bare') {
      plot.stage = 'growing';
      plot.growth = 0.02;
      plot.tended = false;
    } else if (stage === 'tend' && plot.stage === 'growing') {
      plot.tended = true;
    } else if (stage === 'harvest' && plot.stage === 'ready') {
      const crop = CROPS[plot.crop];
      const local = this.constructionCellToLocal(plot.x, plot.y);
      this.logistics.addStack('crop', crop.yield, local.x, local.y);
      plot.stage = 'bare';
      plot.growth = 0;
      plot.tended = false;
    }

    this.ensureJobs();
    return true;
  }

  getSnapshot(): FarmingSnapshot {
    return {
      zones: this.getZones(),
      plots: this.getPlots(),
      nextZoneId: this.nextZoneId,
      temperatureC: this.temperatureC,
    };
  }

  restoreSnapshot(snapshot: FarmingSnapshot | undefined): void {
    this.zones.clear();
    this.plots.clear();
    if (!snapshot) {
      this.nextZoneId = 1;
      this.temperatureC = 18;
      return;
    }
    for (const zone of snapshot.zones ?? []) this.zones.set(zone.id, this.cloneZone(zone));
    for (const plot of snapshot.plots ?? []) this.plots.set(this.cellKey(plot.x, plot.y), { ...plot });
    this.nextZoneId = snapshot.nextZoneId ?? 1;
    this.temperatureC = snapshot.temperatureC ?? 18;
    this.ensureJobs();
  }

  private ensureJobs(): void {
    const active = new Set([
      ...this.jobs.getPostedJobs().map(job => job.id),
      ...this.jobs.getAssignedJobs().map(job => job.posting.id),
    ]);

    for (const plot of this.plots.values()) {
      let stage: 'plant' | 'tend' | 'harvest' | null = null;
      if (plot.stage === 'bare') stage = 'plant';
      else if (plot.stage === 'growing' && plot.growth >= 0.45 && !plot.tended) stage = 'tend';
      else if (plot.stage === 'ready') stage = 'harvest';
      if (!stage) continue;

      const id = this.jobId(stage, plot.x, plot.y);
      if (active.has(id)) continue;
      const target = this.constructionCellToLocal(plot.x, plot.y);
      this.jobs.postJob({
        id,
        type: 'grow',
        targetTile: target,
        priority: stage === 'harvest' ? 10 : 7,
        duration: stage === 'harvest' ? 2.2 : stage === 'tend' ? 1.2 : 1.8,
        requiredSkill: 'growing',
        minSkillLevel: 1,
        metadata: {
          stage,
          zoneId: plot.zoneId,
          cellX: plot.x,
          cellY: plot.y,
          crop: plot.crop,
        },
      });
    }
  }

  private temperatureFactor(crop: CropType): number {
    const def = CROPS[crop];
    if (this.temperatureC >= def.idealMin && this.temperatureC <= def.idealMax) return 1;
    const distance = this.temperatureC < def.idealMin
      ? def.idealMin - this.temperatureC
      : this.temperatureC - def.idealMax;
    return Math.max(0, 1 - distance / 15);
  }

  private constructionCellToLocal(x: number, y: number): { x: number; y: number } {
    return {
      x: (x + 0.5) / this.constructionSubdivisions - 0.5,
      y: (y + 0.5) / this.constructionSubdivisions - 0.5,
    };
  }

  private jobId(stage: string, x: number, y: number): string {
    return `grow-job:${stage}:${x},${y}`;
  }

  private cellKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  private cloneZone(zone: GrowZone): GrowZone {
    return { ...zone, cells: zone.cells.map(cell => ({ ...cell })) };
  }
}
