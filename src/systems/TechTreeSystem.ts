/**
 * TechTreeSystem — Research and unlock tech nodes from data/tech.json.
 * Integrates with CultManagementSystem for influence spending.
 */

import { DataManager, TechDef } from '../data/DataManager';

export interface TechTreeNode extends TechDef {
  unlocked: boolean;
  available: boolean; // requirements met
}

export class TechTreeSystem {
  private nodes: TechTreeNode[];
  private onUnlock?: (node: TechTreeNode) => void;

  constructor(onUnlock?: (node: TechTreeNode) => void) {
    this.onUnlock = onUnlock;
    this.nodes = DataManager.getTech().map(t => ({
      ...t,
      unlocked: false,
      available: !t.requires || t.requires.length === 0,
    }));
  }

  /**
   * Update node availability based on what's unlocked.
   */
  private updateAvailability(): void {
    for (const node of this.nodes) {
      if (node.unlocked) continue;
      if (!node.requires || node.requires.length === 0) {
        node.available = true;
      } else {
        node.available = node.requires.every(req =>
          this.nodes.find(n => n.id === req)?.unlocked,
        );
      }
    }
  }

  /**
   * Try to unlock a tech node. Returns true on success.
   */
  unlock(nodeId: string, availableInfluence: number): { success: boolean; reason?: string } {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return { success: false, reason: 'Unknown tech node' };
    if (node.unlocked) return { success: false, reason: 'Already unlocked' };
    if (!node.available) return { success: false, reason: 'Requirements not met' };
    if (availableInfluence < node.cost) return { success: false, reason: 'Not enough influence' };

    node.unlocked = true;
    this.updateAvailability();
    this.onUnlock?.(node);
    return { success: true };
  }

  /**
   * Get all tech nodes.
   */
  getNodes(): TechTreeNode[] {
    return [...this.nodes];
  }

  /**
   * Get unlocked nodes.
   */
  getUnlocked(): TechTreeNode[] {
    return this.nodes.filter(n => n.unlocked);
  }

  /**
   * Get available (ready to unlock) nodes.
   */
  getAvailable(): TechTreeNode[] {
    return this.nodes.filter(n => n.available && !n.unlocked);
  }

  /**
   * Check if a tech is unlocked.
   */
  isUnlocked(nodeId: string): boolean {
    return this.nodes.find(n => n.id === nodeId)?.unlocked ?? false;
  }

  /**
   * Get all unlocked unlock-ids (building ids, ritual ids, etc.)
   */
  getUnlockedContent(): string[] {
    return this.getUnlocked().flatMap(n => n.unlocks);
  }

  /**
   * Get cumulative effect multiplier for a given effect key.
   */
  getEffectMultiplier(key: string): number {
    let mult = 1;
    for (const node of this.getUnlocked()) {
      if (node.effects && node.effects[key]) {
        mult *= node.effects[key];
      }
    }
    return mult;
  }

  /**
   * Get cumulative flat bonus for a given effect key.
   */
  getEffectBonus(key: string): number {
    let bonus = 0;
    for (const node of this.getUnlocked()) {
      if (node.effects && node.effects[key]) {
        bonus += node.effects[key];
      }
    }
    return bonus;
  }
}