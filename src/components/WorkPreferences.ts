import type { Component } from '../ecs/Component';
import type { JobType } from './Job';

export type WorkRole =
  | 'generalist'
  | 'researcher'
  | 'cook'
  | 'devotee'
  | 'builder'
  | 'caretaker';

export type WorkPriority = 1 | 2 | 3 | 4 | 0;

export const PLAYER_JOB_TYPES: Exclude<JobType, 'idle' | 'wander'>[] = [
  'cook',
  'research',
  'pray',
  'build',
  'clean',
  'haul',
  'harvest',
];

const ROLE_PRESETS: Record<WorkRole, Record<Exclude<JobType, 'idle' | 'wander'>, WorkPriority>> = {
  generalist: { cook: 3, research: 3, pray: 3, build: 3, clean: 3, haul: 3, harvest: 2 },
  researcher: { cook: 4, research: 1, pray: 3, build: 4, clean: 4, haul: 3, harvest: 4 },
  cook: { cook: 1, research: 4, pray: 3, build: 4, clean: 2, haul: 3, harvest: 4 },
  devotee: { cook: 4, research: 3, pray: 1, build: 4, clean: 3, haul: 3, harvest: 2 },
  builder: { cook: 4, research: 4, pray: 4, build: 1, clean: 3, haul: 2, harvest: 1 },
  caretaker: { cook: 2, research: 4, pray: 3, build: 4, clean: 1, haul: 2, harvest: 2 },
};

export class WorkPreferences implements Component {
  constructor(public readonly entity: number) {
    this.applyRole('generalist');
  }

  role: WorkRole = 'generalist';
  priorities: Record<Exclude<JobType, 'idle' | 'wander'>, WorkPriority> = {
    cook: 3,
    research: 3,
    pray: 3,
    build: 3,
    clean: 3,
    haul: 3,
    harvest: 2,
  };

  applyRole(role: WorkRole): void {
    this.role = role;
    this.priorities = { ...ROLE_PRESETS[role] };
  }

  setPriority(job: Exclude<JobType, 'idle' | 'wander'>, priority: WorkPriority): void {
    this.priorities[job] = priority;
  }

  getPriority(job: JobType): WorkPriority {
    if (job === 'idle' || job === 'wander') return 0;
    return this.priorities[job];
  }
}
