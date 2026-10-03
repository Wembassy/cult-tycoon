/**
 * CultManagementSystem — Tracks cult-level stats, leader, recruitment, scheduling.
 * Manages: member roster, cult stats (influence, wealth, notoriety), recruitment,
 * daily schedule (work/pray/eat/free time blocks), and tech tree unlocks.
 */

import type { World } from '../ecs/World';
import { FollowerAI } from '../components/FollowerAI';
import { Needs } from '../components/Needs';
import { Job } from '../components/Job';
import { Skills } from '../components/Skills';
import { Traits } from '../components/Traits';
import { Health, StatusEffect } from '../components/Health';
import { QualityTier, TIER_FAITH_COST, ALL_TIERS } from '../components/CultistTier';
import { HeatSystem, HEAT_CONFIG } from './HeatSystem';

export type GameState = 'playing' | 'won' | 'lost';

export interface CultStats {
  influence: number;    // 0-1000, grows with prayer and rituals
  wealth: number;       // currency for building/recruiting
  notoriety: number;    // 0-100, attracts investigators at high levels
  faith: number;        // 0-100, average follower faith
  morale: number;       // 0-100, average follower fun + sanity
  population: number;   // current follower count
  maxPopulation: number; // capacity based on dormitories
}

export type LoseReason = 'abandoned' | 'bankruptcy' | 'busted';

export interface WinLoseEvent {
  type: 'win' | 'lose';
  reason?: LoseReason;
  stats: CultStats;
  day: number;
}

export type ScheduleBlock = 'work' | 'pray' | 'eat' | 'free' | 'sleep';

export interface DailySchedule {
  blocks: { hour: number; type: ScheduleBlock; duration: number }[];
}

export type LeaderTitle = 'Founder' | 'Prophet' | 'Messiah' | 'Elder';

export interface CultLeader {
  name: string;
  title: LeaderTitle;
  charisma: number;    // 1-10, affects recruitment
  authority: number;   // 1-10, affects obedience
  influence: number;   // accumulated influence
}

export interface RecruitmentCandidate {
  id: string;
  name: string;
  interest: number;    // 0-100, how interested they are
  traits: string[];
  estimatedCost: number;
  tier: QualityTier;
}

export interface TechUnlock {
  id: string;
  name: string;
  cost: number;        // influence cost
  unlocked: boolean;
  description: string;
}

const DEFAULT_TECH: TechUnlock[] = [
  { id: 'basic_rituals', name: 'Basic Rituals', cost: 50, unlocked: false, description: 'Unlock prayer room rituals' },
  { id: 'advanced_rituals', name: 'Advanced Rituals', cost: 200, unlocked: false, description: 'Higher faith generation' },
  { id: 'recruitment_ii', name: 'Recruitment II', cost: 100, unlocked: false, description: 'Increase max population by 10' },
  { id: 'stone_buildings', name: 'Stone Buildings', cost: 150, unlocked: false, description: 'Unlock advanced building types' },
  { id: 'follower_education', name: 'Follower Education', cost: 300, unlocked: false, description: 'Followers gain skills faster' },
  { id: 'divine_intervention', name: 'Divine Intervention', cost: 500, unlocked: false, description: 'Random positive events' },
];

const DEFAULT_SCHEDULE: DailySchedule = {
  blocks: [
    { hour: 0, type: 'sleep', duration: 6 },
    { hour: 6, type: 'eat', duration: 1 },
    { hour: 7, type: 'pray', duration: 2 },
    { hour: 9, type: 'work', duration: 6 },
    { hour: 15, type: 'eat', duration: 1 },
    { hour: 16, type: 'work', duration: 4 },
    { hour: 20, type: 'free', duration: 3 },
    { hour: 23, type: 'sleep', duration: 1 },
  ],
};

export class CultManagementSystem {
  private stats: CultStats;
  private leader: CultLeader;
  private schedule: DailySchedule;
  private roster: Set<number> = new Set();
  private candidates: RecruitmentCandidate[] = [];
  private techTree: TechUnlock[] = [...DEFAULT_TECH];
  private rng: () => number;
  private currentHour = 0;
  private dayCount = 1;

  // Win/Lose tracking
  private gameState: GameState = 'playing';
  private loseReason: LoseReason | null = null;
  private populationZeroTimer = 0; // seconds at 0 population
  private ascensionCompleted = false;
  private onWinLose?: (event: WinLoseEvent) => void;

  // Heat system
  private heatSystem: HeatSystem | null = null;

  // Win condition thresholds
  static readonly WIN_FOLLOWER_COUNT = 20;
  static readonly BANKRUPTCY_THRESHOLD = -50;
  static readonly NOTORIETY_BUST_THRESHOLD = 100;
  static readonly POPULATION_ZERO_GRACE = 30; // seconds before lose

  constructor(leader: CultLeader, seed: number = Date.now(), onWinLose?: (event: WinLoseEvent) => void) {
    this.leader = leader;
    this.onWinLose = onWinLose;
    this.stats = {
      influence: 0,
      wealth: 100,
      notoriety: 0,
      faith: 100,
      morale: 100,
      population: 0,
      maxPopulation: 5,
    };
    this.schedule = { ...DEFAULT_SCHEDULE };
    let state = seed;
    this.rng = () => {
      state = (state * 1664525 + 1013904223) | 0;
      return ((state >>> 0) % 10000) / 10000;
    };
  }

  /**
   * Register a follower entity as a cult member
   */
  recruitMember(entityId: number, cost: number = 0): boolean {
    if (this.roster.size >= this.stats.maxPopulation) return false;
    if (this.stats.wealth < cost) return false;
    this.roster.add(entityId);
    this.stats.wealth -= cost;
    this.stats.population = this.roster.size;
    return true;
  }

  /**
   * Remove a follower from the cult (death, defection, expulsion)
   */
  removeMember(entityId: number): void {
    this.roster.delete(entityId);
    this.stats.population = this.roster.size;
  }

  /**
   * Dismiss a follower — removes them AND generates heat.
   * Use this when the player voluntarily dismisses a cultist.
   * Use removeMember() for death/defection (no heat).
   */
  dismissMember(entityId: number): void {
    this.roster.delete(entityId);
    this.stats.population = this.roster.size;
    // Dismissing a follower generates a heat spike
    if (this.heatSystem) {
      this.heatSystem.addHeat(HEAT_CONFIG.DISMISS_HEAT, 'A follower was dismissed.');
    }
    // Also increase notoriety (passive heat in CultManagementSystem)
    this.stats.notoriety = Math.min(100, this.stats.notoriety + 2);
  }

  /**
   * Generate recruitment candidates based on notoriety and leader charisma
   */
  generateCandidates(count: number = 3): RecruitmentCandidate[] {
    const names = ['Zara', 'Kai', 'Luna', 'Max', 'Nova', 'Sol', 'Vex', 'Wren', 'Echo', 'Flint'];
    const candidates: RecruitmentCandidate[] = [];
    for (let i = 0; i < count; i++) {
      const baseInterest = 20 + this.stats.notoriety * 0.3 + this.leader.charisma * 5;
      const interest = Math.min(100, baseInterest + this.rng() * 20);

      // Determine tier based on notoriety (proxy for PR level)
      const tier = this.generateCandidateTier(this.stats.notoriety);
      const faithCost = TIER_FAITH_COST[tier];

      candidates.push({
        id: `cand_${Date.now()}_${i}`,
        name: names[Math.floor(this.rng() * names.length)],
        interest: Math.floor(interest),
        traits: ['zealous', 'hardy', 'scholar'].slice(0, 1 + Math.floor(this.rng() * 2)),
        estimatedCost: faithCost,
        tier,
      });
    }
    this.candidates = candidates;
    return candidates;
  }

  /**
   * Generate a quality tier for a candidate based on PR level (notoriety proxy).
   * Higher notoriety = chance of better quality recruits.
   */
  private generateCandidateTier(prLevel: number): QualityTier {
    const clampedPr = Math.max(0, Math.min(100, prLevel));
    // Center index shifts from 0 (very_poor) to 5 (incredible) as PR goes 0→100
    const center = (clampedPr / 100) * (ALL_TIERS.length - 1);

    const weights = ALL_TIERS.map((_, i) => {
      const distance = Math.abs(i - center);
      return Math.exp(-(distance * distance) / 2);
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = this.rng() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return ALL_TIERS[i];
    }
    return ALL_TIERS[0];
  }

  /**
   * Recruit from the candidate list
   */
  recruitFromCandidate(candidateId: string, world: World): boolean {
    const candidate = this.candidates.find(c => c.id === candidateId);
    if (!candidate) return false;

    // Create a new follower entity
    const entity = world.createEntity();
    const needs = new Needs(entity);
    needs.faith = 50 + candidate.interest * 0.3;
    world.addComponent(entity, needs);

    const job = new Job(entity);
    world.addComponent(entity, job);

    const skills = new Skills(entity);
    world.addComponent(entity, skills);

    const traits = new Traits(entity);
    traits.traits = candidate.traits as any[];
    world.addComponent(entity, traits);

    const health = new Health(entity);
    world.addComponent(entity, health);

    const ai = new FollowerAI(entity);
    ai.tier = candidate.tier;
    world.addComponent(entity, ai);

    const success = this.recruitMember(entity, candidate.estimatedCost);
    if (!success) {
      world.destroyEntity(entity);
      return false;
    }
    return true;
  }

  /**
   * Update cult stats based on follower states and needs.
   * Also checks win/lose conditions.
   */
  update(world: World, dt: number): void {
    // Don't update if game is over
    if (this.gameState !== 'playing') return;

    this.currentHour = (this.currentHour + dt) % 24;
    if (this.currentHour < dt) this.dayCount++;

    // Calculate average faith and morale
    let totalFaith = 0;
    let totalMorale = 0;
    let workingCount = 0;
    let prayingCount = 0;

    for (const entityId of this.roster) {
      const needs = world.getComponent(entityId, Needs);
      const ai = world.getComponent(entityId, FollowerAI);
      const job = world.getComponent(entityId, Job);

      if (needs) {
        totalFaith += needs.faith;
        totalMorale += (needs.fun + needs.sanity) / 2;
      }

      if (job?.type === 'pray') prayingCount++;
      if (job?.type !== 'idle' && ai?.state === 'working') workingCount++;
    }

    const pop = this.roster.size;
    if (pop > 0) {
      this.stats.faith = totalFaith / pop;
      this.stats.morale = totalMorale / pop;
    }

    // Influence grows from praying followers
    this.stats.influence += prayingCount * 0.5 * dt;

    // Wealth grows from working followers
    this.stats.wealth += workingCount * 0.3 * dt;

    // Notoriety grows slowly with population and influence
    this.stats.notoriety = Math.min(100, this.stats.notoriety + (pop * 0.001 + this.stats.influence * 0.0001) * dt);

    // Sync notoriety to heat system (passive heat)
    if (this.heatSystem) {
      this.heatSystem.syncNotoriety(this.stats.notoriety);
      this.heatSystem.update(dt);
    }

    // Schedule-based job posting
    this.applySchedule(world);

    // Check win/lose conditions
    this.checkLoseConditions(dt);
    this.checkWinConditions();
  }

  /**
   * Set the heat system reference (for dismiss/raid integration).
   */
  setHeatSystem(heatSystem: HeatSystem): void {
    this.heatSystem = heatSystem;
  }

  /**
   * Get the heat system (if set).
   */
  getHeatSystem(): HeatSystem | null {
    return this.heatSystem;
  }

  /**
   * Check lose conditions:
   * - Population 0 for 30+ seconds
   * - Wealth < -50 (bankruptcy)
   * - Notoriety >= 100 (busted)
   */
  private checkLoseConditions(dt: number): void {
    if (this.gameState !== 'playing') return;

    // Check bankruptcy
    if (this.stats.wealth < CultManagementSystem.BANKRUPTCY_THRESHOLD) {
      this.triggerLose('bankruptcy');
      return;
    }

    // Check notoriety busted — now integrated with HeatSystem
    if (this.stats.notoriety >= CultManagementSystem.NOTORIETY_BUST_THRESHOLD) {
      // If we have a heat system, let it handle the raid logic
      if (this.heatSystem) {
        // Sync heat with notoriety
        this.heatSystem.syncNotoriety(this.stats.notoriety);

        // If heat is at game-over threshold, the heat system triggers lose
        if (this.heatSystem.getHeat() >= HEAT_CONFIG.GAME_OVER_THRESHOLD) {
          this.triggerLose('busted');
          return;
        }

        // If a raid is ready, execute it
        if (this.heatSystem.isRaidReady()) {
          const roster = this.getRoster();
          const stats = this.getStats();
          const result = this.heatSystem.executeRaid(roster, stats.wealth);

          // Remove arrested cultists from roster
          for (const arrestedId of result.arrestedEntityIds) {
            this.removeMember(arrestedId);
            // Destroy the entity in the world (if world reference available)
            // The caller/system loop handles entity cleanup
          }

          // Confiscate funds
          this.stats.wealth -= result.fundsConfiscated;
        }
      } else {
        // No heat system — legacy behavior: immediate lose
        this.triggerLose('busted');
      }
      return;
    }

    // Check population zero
    if (this.stats.population <= 0) {
      this.populationZeroTimer += dt;
      if (this.populationZeroTimer >= CultManagementSystem.POPULATION_ZERO_GRACE) {
        this.triggerLose('abandoned');
      }
    } else {
      this.populationZeroTimer = 0;
    }
  }

  /**
   * Check win condition:
   * - 20+ followers AND Ascension ritual completed
   */
  private checkWinConditions(): void {
    if (this.gameState !== 'playing') return;

    if (this.ascensionCompleted && this.stats.population >= CultManagementSystem.WIN_FOLLOWER_COUNT) {
      this.triggerWin();
    }
  }

  private triggerLose(reason: LoseReason): void {
    this.gameState = 'lost';
    this.loseReason = reason;
    this.onWinLose?.({
      type: 'lose',
      reason,
      stats: this.getStats(),
      day: this.dayCount,
    });
  }

  private triggerWin(): void {
    this.gameState = 'won';
    this.onWinLose?.({
      type: 'win',
      stats: this.getStats(),
      day: this.dayCount,
    });
  }

  /**
   * Mark the Ascension ritual as completed (called by RitualSystem or main).
   */
  markAscensionComplete(): void {
    this.ascensionCompleted = true;
    this.checkWinConditions();
  }

  /**
   * Get current game state.
   */
  getGameState(): GameState {
    return this.gameState;
  }

  /**
   * Get lose reason (if lost).
   */
  getLoseReason(): LoseReason | null {
    return this.loseReason;
  }

  /**
   * Get population zero timer (for debugging/UI).
   */
  getPopulationZeroTimer(): number {
    return this.populationZeroTimer;
  }

  /**
   * Check if ascension ritual has been completed.
   */
  hasAscensionCompleted(): boolean {
    return this.ascensionCompleted;
  }

  /**
   * Reset game state for a new game.
   */
  resetGame(leader?: CultLeader): void {
    this.gameState = 'playing';
    this.loseReason = null;
    this.populationZeroTimer = 0;
    this.ascensionCompleted = false;
    this.roster.clear();
    this.candidates = [];
    this.techTree = [...DEFAULT_TECH];
    this.currentHour = 0;
    this.dayCount = 1;
    this.stats = {
      influence: 0,
      wealth: 100,
      notoriety: 0,
      faith: 100,
      morale: 100,
      population: 0,
      maxPopulation: 5,
    };
    if (leader) this.leader = leader;
  }

  /**
   * Apply the current schedule — post jobs based on the current time block
   */
  private applySchedule(world: World): void {
    const block = this.getCurrentScheduleBlock();
    // Only post schedule jobs if there aren't enough already
    // (the JobSystem handles actual assignment)

    for (const entityId of this.roster) {
      const job = world.getComponent(entityId, Job);
      const ai = world.getComponent(entityId, FollowerAI);
      if (!job || !ai) continue;
      if (job.type !== 'idle' || ai.state !== 'idle') continue;

      // Post appropriate job based on schedule
      switch (block) {
        case 'pray':
          // Post a prayer job at the shrine (if exists)
          break;
        case 'work':
          // Work jobs are posted by other systems (building, cooking, etc.)
          break;
        case 'eat':
          // Followers seek food
          break;
        case 'free':
          // Free time — no forced jobs
          break;
        case 'sleep': {
          // Sleep — restore sanity
          const needs = world.getComponent(entityId, Needs);
          if (needs) {
            needs.sanity = Math.min(100, needs.sanity + 0.1);
          }
          break;
        }
      }
    }
  }

  /**
   * Get the current schedule block based on the current hour
   */
  getCurrentScheduleBlock(): ScheduleBlock {
    for (let i = this.schedule.blocks.length - 1; i >= 0; i--) {
      if (this.currentHour >= this.schedule.blocks[i].hour) {
        return this.schedule.blocks[i].type;
      }
    }
    return 'sleep';
  }

  /**
   * Unlock a tech node
   */
  unlockTech(techId: string): boolean {
    const tech = this.techTree.find(t => t.id === techId);
    if (!tech || tech.unlocked) return false;
    if (this.stats.influence < tech.cost) return false;
    this.stats.influence -= tech.cost;
    tech.unlocked = true;

    // Apply effects
    if (techId === 'recruitment_ii') {
      this.stats.maxPopulation += 10;
    }

    return true;
  }

  /**
   * Get all tech nodes
   */
  getTechTree(): TechUnlock[] {
    return [...this.techTree];
  }

  /**
   * Promote the leader to a new title
   */
  promoteLeader(title: LeaderTitle): void {
    this.leader.title = title;
  }

  /**
   * Get cult stats
   */
  getStats(): CultStats {
    return { ...this.stats };
  }

  /**
   * Set max population directly (for testing).
   */
  setMaxPopulation(max: number): void {
    this.stats.maxPopulation = max;
  }

  /**
   * Get leader info
   */
  getLeader(): CultLeader {
    return { ...this.leader };
  }

  /**
   * Get current roster
   */
  getRoster(): number[] {
    return Array.from(this.roster);
  }

  /**
   * Get current schedule
   */
  getSchedule(): DailySchedule {
    return { ...this.schedule, blocks: [...this.schedule.blocks] };
  }

  /**
   * Set a custom schedule
   */
  setSchedule(schedule: DailySchedule): void {
    this.schedule = schedule;
  }

  /**
   * Get current candidates
   */
  getCandidates(): RecruitmentCandidate[] {
    return [...this.candidates];
  }

  /**
   * Get day count
   */
  get day(): number {
    return this.dayCount;
  }

  /**
   * Get current hour
   */
  get hour(): number {
    return this.currentHour;
  }

  /**
   * Add wealth (from events, donations, etc.)
   */
  addWealth(amount: number): void {
    this.stats.wealth += amount;
  }

  /**
   * Spend wealth
   */
  spendWealth(amount: number): boolean {
    if (this.stats.wealth < amount) return false;
    this.stats.wealth -= amount;
    return true;
  }

  /**
   * Add influence (from rituals, events)
   */
  addInfluence(amount: number): void {
    this.stats.influence += amount;
  }

  /**
   * Apply a status effect to all followers (event-driven)
   */
  applyGlobalStatus(world: World, effect: StatusEffect): void {
    for (const entityId of this.roster) {
      const health = world.getComponent(entityId, Health);
      if (health && !health.statusEffects.includes(effect)) {
        health.statusEffects.push(effect);
      }
    }
  }
}