/**
 * OutsiderSystem — traffic-driven visitors and baseline recruitment.
 */

import type { World } from '../ecs/World';
import { System } from '../ecs/System';
import { Outsider } from '../components/Outsider';
import { Transform } from '../components/Transform';
import { Renderable } from '../components/Renderable';
import { Skills, SKILL_KEYS } from '../components/Skills';
import { Traits, ALL_TRAITS } from '../components/Traits';
import { Health } from '../components/Health';
import { SocialState } from '../components/SocialState';
import { BeliefState } from '../components/BeliefState';
import { Needs } from '../components/Needs';
import { Job } from '../components/Job';
import { Inventory } from '../components/Inventory';
import { FollowerAI } from '../components/FollowerAI';
import { WorkPreferences } from '../components/WorkPreferences';
import { Schedule } from '../components/Schedule';
import type { TileMap } from '../world/TileMap';
import type { Pathfinder } from '../world/Pathfinder';
import type { CultIdeology, IdeologyCategory, PreceptStance } from '../game/Ideology';

export interface OutsiderSystemCallbacks {
  onArrive?: (entity: number, name: string) => void;
  onLeave?: (entity: number, name: string) => void;
  onRecruit?: (entity: number, name: string) => void;
}

export interface OutsiderSnapshot {
  outsiderTraffic: number;
  nextVisitIn: number;
  visitorSerial: number;
  settlementPoint: { x: number; y: number };
}

export interface RecruitmentResult {
  success: boolean;
  recruited: boolean;
  progress: number;
  gained: number;
  message: string;
}

const OUTSIDER_NAMES = [
  'Mara','Jonas','Eli','Nora','Silas','June','Micah','Rhea',
  'Caleb','Ivy','Ezra','Mae','Theo','Ada','Felix','Wren',
];

export class OutsiderSystem extends System {
  private outsiderTraffic = 50;
  private nextVisitIn = 25;
  private visitorSerial = 0;
  private settlementPoint = { x: 32, y: 32 };
  private rngState = 0x12345678;

  constructor(
    private readonly map: TileMap,
    private readonly pathfinder: Pathfinder,
    private readonly ideologyProvider: () => CultIdeology,
    private readonly callbacks: OutsiderSystemCallbacks = {},
  ) {
    super();
  }

  configure(traffic: number, settlementPoint: { x: number; y: number }, seed: number): void {
    this.outsiderTraffic = clamp(traffic, 0, 100);
    this.settlementPoint = { ...settlementPoint };
    this.rngState = seed >>> 0;
    this.nextVisitIn = this.rollNextVisitDelay();
  }

  update(world: World, dt: number): void {
    this.nextVisitIn -= dt;
    if (this.nextVisitIn <= 0 && world.query([Outsider]).length < 3) {
      this.spawnVisitor(world);
      this.nextVisitIn = this.rollNextVisitDelay();
    }

    for (const entity of world.query([Outsider, Transform])) {
      const outsider = world.getComponent(entity, Outsider)!;
      const transform = world.getComponent(entity, Transform)!;
      outsider.recruitmentCooldown = Math.max(0, outsider.recruitmentCooldown - dt);

      if (outsider.state === 'arriving' || outsider.state === 'leaving') {
        const reached = this.moveAlongPath(outsider, transform, dt);
        if (reached) {
          if (outsider.state === 'arriving') {
            outsider.state = 'visiting';
            outsider.stayRemaining = 38 + this.random() * 32;
            outsider.path = [];
            outsider.pathIndex = 0;
            this.callbacks.onArrive?.(entity, outsider.name);
          } else {
            this.callbacks.onLeave?.(entity, outsider.name);
            world.destroyEntity(entity);
          }
        }
        continue;
      }

      outsider.stayRemaining -= dt;
      if (outsider.stayRemaining <= 0) {
        this.beginLeaving(outsider, transform);
      }
    }
  }

  attemptRecruitment(world: World, outsiderEntity: number, recruiterEntity: number): RecruitmentResult {
    const outsider = world.getComponent(outsiderEntity, Outsider);
    const outsiderBelief = world.getComponent(outsiderEntity, BeliefState);
    const outsiderSocial = world.getComponent(outsiderEntity, SocialState);
    const recruiterSkills = world.getComponent(recruiterEntity, Skills);
    const recruiterSocial = world.getComponent(recruiterEntity, SocialState);

    if (!outsider || outsider.state !== 'visiting' || !outsiderBelief || !outsiderSocial || !recruiterSkills) {
      return { success: false, recruited: false, progress: outsider?.recruitmentProgress ?? 0, gained: 0, message: 'Recruitment is not available.' };
    }
    if (outsider.recruitmentCooldown > 0) {
      return { success: false, recruited: false, progress: outsider.recruitmentProgress, gained: 0, message: 'The outsider needs time before another conversation.' };
    }

    const relationship = outsiderSocial.getRelationship(recruiterEntity);
    const reverse = recruiterSocial?.getRelationship(outsiderEntity);
    relationship.familiarity = clamp(relationship.familiarity + 8, 0, 100);
    relationship.opinion = clamp(relationship.opinion + 3 + recruiterSkills.social * 0.5, -100, 100);
    if (reverse) {
      reverse.familiarity = clamp(reverse.familiarity + 8, 0, 100);
      reverse.opinion = clamp(reverse.opinion + 2, -100, 100);
    }

    const compatibility = this.ideologyCompatibility(outsiderBelief, this.ideologyProvider());
    const cultMood = this.averageCultMood(world);
    const gain = clamp(
      5 +
      recruiterSkills.social * 1.8 +
      Math.max(0, relationship.opinion) * 0.045 +
      compatibility * 8 +
      (cultMood - 50) * 0.035,
      4,
      24,
    );

    outsider.recruitmentProgress = clamp(outsider.recruitmentProgress + gain, 0, 100);
    outsider.recruitmentCooldown = 5;

    outsiderSocial.addMemory({
      id: `recruit-talk:${recruiterEntity}:${Math.round(outsider.recruitmentProgress)}`,
      label: compatibility >= 0.5 ? 'Heard a compelling invitation to join' : 'Heard a strange recruitment pitch',
      mood: compatibility >= 0.5 ? 3 : -1,
      duration: 35,
      stackKey: compatibility >= 0.5 ? 'recruitment_positive' : 'recruitment_uncertain',
      sourceEntity: recruiterEntity,
    });

    if (outsider.recruitmentProgress >= 100) {
      this.convertToFollower(world, outsiderEntity);
      return {
        success: true,
        recruited: true,
        progress: 100,
        gained: gain,
        message: `${outsider.name} joined the cult.`,
      };
    }

    return {
      success: true,
      recruited: false,
      progress: outsider.recruitmentProgress,
      gained: gain,
      message: `Recruitment progress +${Math.round(gain)}.`,
    };
  }

  getSnapshot(): OutsiderSnapshot {
    return {
      outsiderTraffic: this.outsiderTraffic,
      nextVisitIn: this.nextVisitIn,
      visitorSerial: this.visitorSerial,
      settlementPoint: { ...this.settlementPoint },
    };
  }

  restoreSnapshot(snapshot: OutsiderSnapshot | undefined): void {
    if (!snapshot) return;
    this.outsiderTraffic = snapshot.outsiderTraffic;
    this.nextVisitIn = snapshot.nextVisitIn;
    this.visitorSerial = snapshot.visitorSerial;
    this.settlementPoint = { ...snapshot.settlementPoint };
  }

  private spawnVisitor(world: World): void {
    const spawn = this.pickEdgeSpawn();
    const path = this.pathfinder.findPath(spawn.x, spawn.y, this.settlementPoint.x, this.settlementPoint.y);
    if (!path.success || path.path.length < 2) return;

    const entity = world.createEntity();

    const transform = new Transform(entity);
    transform.x = spawn.x;
    transform.y = spawn.y;
    world.addComponent(entity, transform);

    const renderable = new Renderable(entity);
    renderable.meshId = 'follower_outsider';
    world.addComponent(entity, renderable);

    const outsider = new Outsider(entity);
    outsider.name = OUTSIDER_NAMES[this.visitorSerial++ % OUTSIDER_NAMES.length];
    outsider.path = path.path;
    outsider.pathIndex = 1;
    outsider.state = 'arriving';
    world.addComponent(entity, outsider);

    const skills = new Skills(entity);
    for (const skill of SKILL_KEYS) {
      skills[skill] = 1 + Math.floor(this.random() * 6);
      skills.passions[skill] = this.random() < 0.12 ? 'major' : this.random() < 0.28 ? 'minor' : 'none';
    }
    world.addComponent(entity, skills);

    const traits = new Traits(entity);
    const shuffled = [...ALL_TRAITS].sort(() => this.random() - 0.5);
    traits.traits = shuffled.slice(0, 1 + Math.floor(this.random() * 2));
    world.addComponent(entity, traits);

    const belief = new BeliefState(entity);
    belief.strength = 15 + this.random() * 45;
    for (const category of Object.keys(belief.values) as IdeologyCategory[]) {
      belief.values[category] = this.random() * 2 - 1;
    }
    world.addComponent(entity, belief);

    world.addComponent(entity, new SocialState(entity));
    world.addComponent(entity, new Health(entity));
  }

  private convertToFollower(world: World, entity: number): void {
    const outsider = world.getComponent(entity, Outsider);
    const renderable = world.getComponent(entity, Renderable);
    if (!outsider) return;

    if (renderable) renderable.meshId = 'follower_basic';

    const needs = new Needs(entity);
    needs.hunger = 75;
    needs.energy = 75;
    needs.fun = 70;
    needs.sanity = 75;
    needs.comfort = 65;
    needs.social = 70;
    needs.faith = 55;
    world.addComponent(entity, needs);

    world.addComponent(entity, new Job(entity));
    world.addComponent(entity, new Inventory(entity));
    world.addComponent(entity, new FollowerAI(entity));
    world.addComponent(entity, new WorkPreferences(entity));
    world.addComponent(entity, new Schedule(entity));

    const belief = world.getComponent(entity, BeliefState);
    if (belief) {
      belief.strength = Math.max(45, belief.strength);
      belief.conversionProgress = 100;
    }

    const name = outsider.name;
    world.removeComponent(entity, Outsider);
    this.callbacks.onRecruit?.(entity, name);
  }

  private beginLeaving(outsider: Outsider, transform: Transform): void {
    const exit = this.pickNearestExit(transform.x, transform.y);
    const path = this.pathfinder.findPath(transform.x, transform.y, exit.x, exit.y);
    if (!path.success || path.path.length < 2) {
      outsider.stayRemaining = 5;
      return;
    }
    outsider.state = 'leaving';
    outsider.exitTarget = exit;
    outsider.path = path.path;
    outsider.pathIndex = 1;
  }

  private moveAlongPath(outsider: Outsider, transform: Transform, dt: number): boolean {
    if (outsider.pathIndex >= outsider.path.length) return true;
    const target = outsider.path[outsider.pathIndex];
    const dx = target.x - transform.x;
    const dy = target.y - transform.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const step = 1.7 * dt;

    if (distance <= step) {
      transform.x = target.x;
      transform.y = target.y;
      outsider.pathIndex++;
      return outsider.pathIndex >= outsider.path.length;
    }

    transform.x += dx / distance * step;
    transform.y += dy / distance * step;
    return false;
  }

  private pickEdgeSpawn(): { x: number; y: number } {
    const edge = Math.floor(this.random() * 4);
    const inset = 1;
    if (edge === 0) return { x: inset, y: Math.floor(this.random() * (this.map.height - 2)) + 1 };
    if (edge === 1) return { x: this.map.width - 2, y: Math.floor(this.random() * (this.map.height - 2)) + 1 };
    if (edge === 2) return { x: Math.floor(this.random() * (this.map.width - 2)) + 1, y: inset };
    return { x: Math.floor(this.random() * (this.map.width - 2)) + 1, y: this.map.height - 2 };
  }

  private pickNearestExit(x: number, y: number): { x: number; y: number } {
    const candidates = [
      { x: 1, y: clamp(Math.round(y), 1, this.map.height - 2) },
      { x: this.map.width - 2, y: clamp(Math.round(y), 1, this.map.height - 2) },
      { x: clamp(Math.round(x), 1, this.map.width - 2), y: 1 },
      { x: clamp(Math.round(x), 1, this.map.width - 2), y: this.map.height - 2 },
    ];
    return candidates.sort((a, b) =>
      (Math.abs(a.x - x) + Math.abs(a.y - y)) -
      (Math.abs(b.x - x) + Math.abs(b.y - y))
    )[0];
  }

  private rollNextVisitDelay(): number {
    const traffic = this.outsiderTraffic / 100;
    const base = 90 - traffic * 72;
    return base * (0.75 + this.random() * 0.5);
  }

  private ideologyCompatibility(belief: BeliefState, ideology: CultIdeology): number {
    let total = 0;
    let count = 0;
    for (const [category, precept] of Object.entries(ideology.precepts) as [IdeologyCategory, CultIdeology['precepts'][IdeologyCategory]][]) {
      const direction = stanceDirection(precept.stance);
      const value = belief.values[category] ?? 0;
      total += 0.5 + value * direction * 0.5;
      count++;
    }
    return count > 0 ? clamp(total / count, 0, 1) : 0.5;
  }

  private averageCultMood(world: World): number {
    const states = world.query([SocialState, FollowerAI]);
    if (states.length === 0) return 50;
    let total = 0;
    for (const entity of states) total += world.getComponent(entity, SocialState)?.mood ?? 50;
    return total / states.length;
  }

  private random(): number {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }
}

function stanceDirection(stance: PreceptStance): number {
  switch (stance) {
    case 'required': return 1;
    case 'preferred': return 0.7;
    case 'accepted': return 0.1;
    case 'disapproved': return -0.7;
    case 'prohibited': return -1;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
