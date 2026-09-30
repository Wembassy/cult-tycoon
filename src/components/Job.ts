import type { Component } from '../ecs/Component';

export type JobType =
  | 'clean'
  | 'cook'
  | 'research'
  | 'pray'
  | 'build'
  | 'haul'
  | 'idle';

export class Job implements Component {
  constructor(public readonly entity: number) {}
  jobId: string | null = null;
  type: JobType = 'idle';
  priority = 0;
  targetTile: { x: number; y: number } | null = null;
  workProgress = 0;
}