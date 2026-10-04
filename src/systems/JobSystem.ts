/**
 * JobSystem — Manages job queue, assignment, and work progress.
 * Followers request jobs when idle; system assigns based on priority and skills.
 */

import type { World } from '../ecs/World';
import { Job, JobType } from '../components/Job';
import { Skills } from '../components/Skills';
import { FollowerAI } from '../components/FollowerAI';
import { Transform } from '../components/Transform';
import { Traits } from '../components/Traits';
import { WorkPreferences } from '../components/WorkPreferences';

export interface JobPosting {
  id: string;
  type: JobType;
  targetTile: { x: number; y: number };
  priority: number;
  duration: number;       // ticks needed to complete
  requiredSkill?: keyof Skills;
  minSkillLevel?: number; // minimum skill to accept
  /** Optional reservation: only this follower may claim the posting. */
  requiredEntity?: number;
  /** Optional opaque metadata for higher-level finite jobs such as hauling. */
  metadata?: Record<string, string | number | boolean>;
}

interface AssignedJob {
  posting: JobPosting;
  entity: number;
  assignedAt: number;
}

export class JobSystem {
  private queue: JobPosting[] = [];
  private onCompleted: ((posting: JobPosting, entity: number) => void) | null = null;
  private assigned: Map<string, AssignedJob> = new Map();
  private completed: Set<string> = new Set();
  private tickCount = 0;

  setCompletionHandler(handler: ((posting: JobPosting, entity: number) => void) | null): void {
    this.onCompleted = handler;
  }

  /**
   * Add a job to the queue
   */
  postJob(job: JobPosting): void {
    this.queue.push(job);
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Cancel a posted job
   */
  cancelJob(jobId: string, world?: World): boolean {
    const queueIdx = this.queue.findIndex(j => j.id === jobId);
    if (queueIdx >= 0) {
      this.queue.splice(queueIdx, 1);
      return true;
    }

    const assigned = this.assigned.get(jobId);
    if (assigned) {
      this.assigned.delete(jobId);
      if (world) {
        const job = world.getComponent(assigned.entity, Job);
        if (job?.jobId === jobId) {
          job.jobId = null;
          job.type = 'idle';
          job.priority = 0;
          job.targetTile = null;
          job.workProgress = 0;
        }
        const ai = world.getComponent(assigned.entity, FollowerAI);
        if (ai) {
          ai.state = 'idle';
          ai.path = [];
          ai.pathIndex = 0;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Run job assignment for idle followers, then progress active jobs.
   */
  update(world: World, dt: number): void {
    this.tickCount += dt;

    // Assign jobs to idle followers
    const idleFollowers = world.query([Job, FollowerAI, Transform, Skills])
      .filter(entity => {
        const job = world.getComponent(entity, Job)!;
        const ai = world.getComponent(entity, FollowerAI)!;
        return job.type === 'idle' && ai.state === 'idle';
      });

    for (const entity of idleFollowers) {
      const assigned = this.tryAssignJob(world, entity);
      if (!assigned && this.queue.length === 0) break;
    }

    // Progress active jobs
    this.progressJobs(world, dt);
  }

  private tryAssignJob(world: World, entity: number): boolean {
    if (this.queue.length === 0) return false;

    const transform = world.getComponent(entity, Transform)!;
    const skills = world.getComponent(entity, Skills)!;
    const job = world.getComponent(entity, Job)!;

    let bestIdx = -1;
    let bestScore = -Infinity;

    const preferences = world.getComponent(entity, WorkPreferences);

    for (let i = 0; i < this.queue.length; i++) {
      const posting = this.queue[i];
      if (posting.requiredEntity !== undefined && posting.requiredEntity !== entity) continue;
      const skillMatch = this.checkSkill(posting, skills);
      if (!skillMatch) continue;

      const playerPriority = preferences?.getPriority(posting.type) ?? 3;
      if (playerPriority === 0) continue;

      const dist = Math.abs(posting.targetTile.x - transform.x) +
                   Math.abs(posting.targetTile.y - transform.y);
      const skillLevel = posting.requiredSkill ? Number(skills[posting.requiredSkill]) : 1;
      // Player priority dominates, then station priority/skill, then distance.
      const priorityScore = (5 - playerPriority) * 100;
      const score = priorityScore + posting.priority * 10 + skillLevel * 2 - dist;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) return false;

    const posting = this.queue.splice(bestIdx, 1)[0];
    this.assigned.set(posting.id, { posting, entity, assignedAt: this.tickCount });

    job.jobId = posting.id;
    job.type = posting.type;
    job.targetTile = posting.targetTile;
    job.workProgress = 0;
    job.priority = posting.priority;

    const ai = world.getComponent(entity, FollowerAI)!;
    ai.state = 'moving';
    ai.stateTimer = 0;

    return true;
  }

  private checkSkill(posting: JobPosting, skills: Skills): boolean {
    if (!posting.requiredSkill) return true;
    const level = skills[posting.requiredSkill];
    if (posting.minSkillLevel && level < posting.minSkillLevel) return false;
    return true;
  }

  private progressJobs(world: World, dt: number): void {
    const toRemove: string[] = [];

    for (const [jobId, assignment] of this.assigned) {
      const entity = assignment.entity;
      const ai = world.getComponent(entity, FollowerAI);

      if (!ai) {
        toRemove.push(jobId);
        continue;
      }

      if (ai.state === 'working') {
        const job = world.getComponent(entity, Job);
        if (job) {
          // Apply trait-based work speed multiplier
          const traits = world.getComponent(entity, Traits);
          const traitMult = traits
            ? traits.getWorkSpeedMult(job.type)
            : 1.0;
          const skills = world.getComponent(entity, Skills);
          const skillMult = job.type === 'build'
            ? 1 + Math.max(0, (skills?.construction ?? 1) - 1) * 0.06
            : 1;

          job.workProgress += dt * traitMult * skillMult;
          if (job.workProgress >= assignment.posting.duration) {
            job.type = 'idle';
            job.jobId = null;
            job.workProgress = 0;
            job.targetTile = null;
            ai.state = 'done';
            ai.stateTimer = 0;
            toRemove.push(jobId);
            this.completed.add(jobId);
            this.onCompleted?.(assignment.posting, entity);
          }
        }
      }
    }

    for (const id of toRemove) {
      this.assigned.delete(id);
    }
  }

  /**
   * Direct player order for a queued job. To protect higher-level reservation
   * systems (especially hauling/material delivery), Alpha only interrupts idle,
   * wander, or unassigned followers. Active finite jobs must finish/cancel
   * through their owning system.
   */
  forceAssignQueuedJob(jobId: string, entity: number, world: World): boolean {
    const idx = this.queue.findIndex(posting => posting.id === jobId);
    if (idx < 0) return false;

    const current = world.getComponent(entity, Job);
    const ai = world.getComponent(entity, FollowerAI);
    const skills = world.getComponent(entity, Skills);
    if (!current || !ai || !skills) return false;
    if (current.jobId || (current.type !== 'idle' && current.type !== 'wander')) return false;

    const posting = this.queue[idx];
    if (!this.checkSkill(posting, skills)) return false;

    this.queue.splice(idx, 1);
    this.assigned.set(posting.id, { posting, entity, assignedAt: this.tickCount });

    current.jobId = posting.id;
    current.type = posting.type;
    current.targetTile = posting.targetTile;
    current.workProgress = 0;
    current.priority = posting.priority;

    ai.path = [];
    ai.pathIndex = 0;
    ai.state = 'moving';
    ai.stateTimer = 0;
    return true;
  }

  getPostedJobs(): JobPosting[] {
    return [...this.queue];
  }

  getAssignedJobs(): AssignedJob[] {
    return Array.from(this.assigned.values());
  }

  getCompletedCount(): number {
    return this.completed.size;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
    this.assigned.clear();
    this.completed.clear();
    this.tickCount = 0;
  }
}