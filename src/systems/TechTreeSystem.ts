/**
 * TechTreeSystem — 15-node branching tech tree with 5 branches.
 * Replaces the old DataManager-based system with the new TechTreeData definitions.
 *
 * @see docs/gameplay-design-reference.md §8 Tech Tree
 * @see src/data/TechTreeData.ts
 */

import {
  TechNode,
  TechBranch,
  IdeologyPath,
  TECH_TREE_NODES,
  getTechNode,
  getAvailableTechs,
  getTechBranches,
} from '../data/TechTreeData';

export interface UnlockResult {
  success: boolean;
  reason?: string;
}

export interface TechTreeEffects {
  maxPopulationBonus: number;
  recruitmentBonus: number;
  heatReductionRate: number;
  unlockedRooms: string[];
  unlockedObjects: string[];
  ideology: IdeologyPath | null;
}

export class TechTreeSystem {
  private nodes: TechNode[];
  private onUnlock?: (node: TechNode) => void;
  private effects: TechTreeEffects;

  constructor(onUnlock?: (node: TechNode) => void) {
    this.onUnlock = onUnlock;
    // Deep clone so each instance has its own unlock state
    this.nodes = TECH_TREE_NODES.map(n => ({ ...n, effects: { ...n.effects } }));
    this.effects = {
      maxPopulationBonus: 0,
      recruitmentBonus: 0,
      heatReductionRate: 0,
      unlockedRooms: [],
      unlockedObjects: [],
      ideology: null,
    };
  }

  /**
   * Try to unlock a tech node by spending influence (and faith if required).
   */
  unlock(techId: string, influence: number, faith: number): UnlockResult {
    const node = this.nodes.find(n => n.id === techId);
    if (!node) return { success: false, reason: 'Unknown tech node' };
    if (node.unlocked) return { success: false, reason: 'Already unlocked' };

    // Check prerequisites
    const unlockedIds = this.getUnlocked().map(n => n.id);
    const available = getAvailableTechs(unlockedIds);
    const isAvailable = available.some(n => n.id === techId);
    if (!isAvailable) return { success: false, reason: 'Prerequisites not met' };

    // Check cost
    if (influence < node.cost.influence) {
      return { success: false, reason: 'Not enough influence' };
    }
    if (node.cost.faith !== undefined && faith < node.cost.faith) {
      return { success: false, reason: 'Not enough faith' };
    }

    // Unlock
    node.unlocked = true;
    this.applyEffects(node);
    this.onUnlock?.(node);
    return { success: true };
  }

  /**
   * Apply a node's effects to the cumulative effects tracker.
   */
  private applyEffects(node: TechNode): void {
    const e = node.effects;
    if (e.maxPopulationPlus) {
      this.effects.maxPopulationBonus += e.maxPopulationPlus;
    }
    if (e.recruitmentBonus) {
      this.effects.recruitmentBonus += e.recruitmentBonus;
    }
    if (e.heatReductionRate) {
      this.effects.heatReductionRate += e.heatReductionRate;
    }
    if (e.unlocksRoom) {
      this.effects.unlockedRooms.push(e.unlocksRoom);
    }
    if (e.unlocksObject) {
      this.effects.unlockedObjects.push(e.unlocksObject);
    }
    if (e.unlockIdeology) {
      this.effects.ideology = e.unlockIdeology;
    }
  }

  /**
   * Get all tech nodes (with current unlock state).
   */
  getTree(): TechNode[] {
    return this.nodes.map(n => ({ ...n, effects: { ...n.effects } }));
  }

  /**
   * Get nodes that are available to unlock (prerequisites met, not yet unlocked).
   */
  getAvailable(): TechNode[] {
    const unlockedIds = this.getUnlocked().map(n => n.id);
    return getAvailableTechs(unlockedIds).map(n => {
      const live = this.nodes.find(node => node.id === n.id)!;
      return { ...live, effects: { ...live.effects } };
    });
  }

  /**
   * Get all unlocked nodes.
   */
  getUnlocked(): TechNode[] {
    return this.nodes.filter(n => n.unlocked);
  }

  /**
   * Check if a tech is unlocked.
   */
  isUnlocked(id: string): boolean {
    return this.nodes.find(n => n.id === id)?.unlocked ?? false;
  }

  /**
   * Get cumulative effects summary.
   */
  getEffects(): TechTreeEffects {
    return { ...this.effects };
  }

  /**
   * Get cumulative flat bonus for a given effect key.
   */
  getEffectBonus(key: 'maxPopulationPlus' | 'recruitmentBonus' | 'heatReductionRate'): number {
    let bonus = 0;
    for (const node of this.getUnlocked()) {
      const val = node.effects[key];
      if (val) bonus += val;
    }
    return bonus;
  }

  /**
   * Get all unlocked room ids.
   */
  getUnlockedRooms(): string[] {
    return [...this.effects.unlockedRooms];
  }

  /**
   * Get all unlocked object ids.
   */
  getUnlockedObjects(): string[] {
    return [...this.effects.unlockedObjects];
  }

  /**
   * Get all unlocked content ids (rooms + objects).
   */
  getUnlockedContent(): string[] {
    return [...this.effects.unlockedRooms, ...this.effects.unlockedObjects];
  }

  /**
   * Get the chosen ideology path, if any.
   */
  getIdeology(): IdeologyPath | null {
    return this.effects.ideology;
  }

  /**
   * Get nodes grouped by branch.
   */
  getBranches(): Record<TechBranch, TechNode[]> {
    return getTechBranches();
  }
}