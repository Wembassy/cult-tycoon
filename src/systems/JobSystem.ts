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

export interface JobPosting {
  id: string;
  type: JobType;
  targetTile: { x: number; y: number };
  priority: number;
  duration: number;       // ticks needed to complete
  requiredSkill?: keyof Skills;
  minSkillLevel?: number; // minimum skill to accept
}

interface AssignedJob {
  posting: JobPosting;
  entity: number;
  assignedAt: number;
}

export class JobSystem {
  private queue: JobPosting[] = [];
  private assigned: Map<string, AssignedJob> = new Map();
  private completed: Set<string> = new Set();
  private tickCount = 0;

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
  cancelJob(jobId: string): boolean {
    const queueIdx = this.queue.findIndex(j => j.id === jobId);
    if (queueIdx >= 0) {
      this.queue.splice(queueIdx, 1);
      return true;
    }
    if (this.assigned.has(jobId)) {
      this.assigned.delete(jobId);
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

    for (let i = 0; i < this.queue.length; i++) {
      const posting = this.queue[i];
      const skillMatch = this.checkSkill(posting, skills);
      if (!skillMatch) continue;

      const dist = Math.abs(posting.targetTile.x - transform.x) +
                   Math.abs(posting.targetTile.y - transform.y);
      const score = posting.priority * 10 - dist;
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
          const workMult = traits
            ? traits.getWorkSpeedMult(job.type)
            : 1.0;

          job.workProgress += dt * workMult;
          if (job.workProgress >= assignment.posting.duration) {
            job.type = 'idle';
            job.jobId = null;
            job.workProgress = 0;
            job.targetTile = null;
            ai.state = 'done';
            ai.stateTimer = 0;
            toRemove.push(jobId);
            this.completed.add(jobId);
          }
        }
      }
    }

    for (const id of toRemove) {
      this.assigned.delete(id);
    }
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