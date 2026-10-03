/** Persistent workstations lease jobs to eligible, available followers. */
import type { World } from '../ecs/World';
import { Job, JobType } from '../components/Job';
import { Skills } from '../components/Skills';
import { FollowerAI } from '../components/FollowerAI';
import { Transform } from '../components/Transform';
import { Traits } from '../components/Traits';
import { WorkPreferences } from '../components/WorkPreferences';
import { Schedule } from '../components/Schedule';
import { OnMission } from '../components/OnMission';
export interface JobPosting {
  id: string;
  type: JobType;
  targetTile: { x: number; y: number };
  priority: number;
  /** Simulation seconds of work per cycle. */
  duration: number;
  requiredSkill?: keyof Skills;
  minSkillLevel?: number;
  repeat?: boolean;
}
interface AssignedJob {
  posting: JobPosting;
  entity: number;
  assignedAt: number;
}
export class JobSystem {
  private queue: JobPosting[] = [];
  private assigned = new Map<string, AssignedJob>();
  private completed = new Set<string>();
  private tickCount = 0;
  private world: World | null = null;
  private reachable?: (from: Transform, to: { x: number; y: number }) => boolean;
  setReachabilityCheck(check: (from: Transform, to: { x: number; y: number }) => boolean): void {
    this.reachable = check;
  }
  postJob(job: JobPosting): void {
    if (this.queue.some((p) => p.id === job.id) || this.assigned.has(job.id)) return;
    this.queue.push({ ...job, targetTile: { ...job.targetTile } });
  }
  cancelJob(jobId: string): boolean {
    const i = this.queue.findIndex((j) => j.id === jobId);
    if (i >= 0) {
      this.queue.splice(i, 1);
      return true;
    }
    const assignment = this.assigned.get(jobId);
    if (!assignment) return false;
    if (this.world) this.clearAssignment(this.world, assignment.entity);
    this.assigned.delete(jobId);
    return true;
  }
  private clearAssignment(world: World, entity: number): void {
    const job = world.getComponent(entity, Job);
    if (job) {
      job.jobId = null;
      job.type = 'idle';
      job.targetTile = null;
      job.workProgress = 0;
      job.priority = 0;
    }
    const ai = world.getComponent(entity, FollowerAI);
    if (ai && !ai.needTarget) {
      ai.path = [];
      ai.pathIndex = 0;
      ai.state = 'idle';
      ai.stateTimer = 0;
      ai.activityReason = 'Available';
    }
  }
  update(world: World, dt: number): void {
    this.world = world;
    this.tickCount += dt;
    // Release jobs on death, missions, needs, schedule changes and disabled priorities.
    for (const [id, a] of this.assigned) {
      const ai = world.getComponent(a.entity, FollowerAI),
        job = world.getComponent(a.entity, Job);
      const preferences = world.getComponent(a.entity, WorkPreferences),
        schedule = world.getComponent(a.entity, Schedule);
      if (
        !ai ||
        !job ||
        job.jobId !== id ||
        ai.needTarget ||
        ai.state === 'stuck' ||
        world.hasComponent(a.entity, OnMission) ||
        (schedule && schedule.activity !== 'working') ||
        preferences?.getPriority(a.posting.type) === 0
      ) {
        this.clearAssignment(world, a.entity);
        this.assigned.delete(id);
        this.postJob(a.posting);
      }
    }
    for (const entity of world.query([Job, FollowerAI, Transform, Skills])) {
      const ai = world.getComponent(entity, FollowerAI)!,
        job = world.getComponent(entity, Job)!;
      const schedule = world.getComponent(entity, Schedule);
      if (
        ai.needTarget ||
        world.hasComponent(entity, OnMission) ||
        (schedule && schedule.activity !== 'working')
      )
        continue;
      if (job.type !== 'idle' && job.type !== 'wander') continue;
      if (ai.state !== 'idle' && job.type !== 'wander') continue;
      this.tryAssign(world, entity);
    }
    for (const [id, a] of this.assigned) {
      const ai = world.getComponent(a.entity, FollowerAI),
        job = world.getComponent(a.entity, Job),
        pos = world.getComponent(a.entity, Transform);
      if (
        !ai ||
        !job ||
        !pos ||
        ai.state !== 'working' ||
        Math.hypot(pos.x - a.posting.targetTile.x, pos.y - a.posting.targetTile.y) > 0.15
      )
        continue;
      job.workProgress +=
        dt * (world.getComponent(a.entity, Traits)?.getWorkSpeedMult(job.type) ?? 1);
      if (job.workProgress >= a.posting.duration) {
        this.clearAssignment(world, a.entity);
        this.assigned.delete(id);
        if (a.posting.repeat || id.startsWith('station:')) this.postJob(a.posting);
        else {
          this.completed.add(id);
          ai.state = 'done';
        }
      }
    }
  }
  private tryAssign(world: World, entity: number): void {
    const pos = world.getComponent(entity, Transform)!,
      skills = world.getComponent(entity, Skills)!;
    const prefs = world.getComponent(entity, WorkPreferences);
    const ranked = this.queue
      .map((posting, index) => {
        const priority = prefs?.getPriority(posting.type) ?? 3;
        const level = posting.requiredSkill ? Number(skills[posting.requiredSkill]) : 1;
        const score =
          (5 - priority) * 100000 +
          posting.priority * 100 +
          level * 2 -
          Math.hypot(posting.targetTile.x - pos.x, posting.targetTile.y - pos.y);
        return {
          posting,
          index,
          score,
          eligible: priority > 0 && level >= (posting.minSkillLevel ?? 0),
        };
      })
      .filter((x) => x.eligible)
      .sort((a, b) => b.score - a.score);
    const selected = ranked.find(
      (x) => !this.reachable || this.reachable(pos, x.posting.targetTile),
    );
    if (!selected) return;
    const posting = this.queue.splice(selected.index, 1)[0];
    this.assigned.set(posting.id, { posting, entity, assignedAt: this.tickCount });
    const job = world.getComponent(entity, Job)!,
      ai = world.getComponent(entity, FollowerAI)!;
    job.jobId = posting.id;
    job.type = posting.type;
    job.targetTile = { ...posting.targetTile };
    job.workProgress = 0;
    job.priority = posting.priority;
    ai.path = [];
    ai.pathIndex = 0;
    ai.state = 'moving';
    ai.stateTimer = 0;
    ai.activityReason = `Going to ${posting.type}`;
  }
  getPostedJobs(): JobPosting[] {
    return [...this.queue].sort((a, b) => b.priority - a.priority);
  }
  getAssignedJobs(): AssignedJob[] {
    return [...this.assigned.values()];
  }
  getCompletedCount(): number {
    return this.completed.size;
  }
  get queueLength(): number {
    return this.queue.length;
  }
  clear(): void {
    if (this.world)
      for (const a of this.assigned.values()) this.clearAssignment(this.world, a.entity);
    this.queue = [];
    this.assigned.clear();
    this.completed.clear();
    this.tickCount = 0;
  }
}
