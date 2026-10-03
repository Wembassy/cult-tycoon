/**
 * TechTreePanel — Full-screen overlay panel showing the tech tree.
 *
 * Groups nodes by branch (5 columns: Living, Exploitation, Management, Divine, Security).
 * Each node is a card showing name, cost, description, and prerequisites.
 * Available nodes (prerequisites met) are highlighted; unlocked nodes show a checkmark.
 * Click an available node to unlock it (if enough resources).
 *
 * @see src/data/TechTreeData.ts
 * @see src/systems/TechTreeSystem.ts
 */

import {
  TechNode,
  TechBranch,
  TECH_TREE_NODES,
  getTechBranches,
  getAvailableTechs,
} from '../data/TechTreeData';

export interface TechTreePanelCallbacks {
  onUnlock: (techId: string) => void;
  onClose: () => void;
}

export interface TechTreePanelData {
  /** IDs of unlocked tech nodes. */
  unlockedIds: string[];
  /** Current influence available. */
  influence: number;
  /** Current faith available. */
  faith: number;
}

const BRANCH_LABELS: Record<TechBranch, string> = {
  living: 'Living',
  exploitation: 'Exploitation',
  management: 'Management',
  divine: 'Divine',
  security: 'Security',
};

const BRANCH_ICONS: Record<TechBranch, string> = {
  living: '🏠',
  exploitation: '💰',
  management: '📋',
  divine: '✨',
  security: '🛡️',
};

const BRANCH_COLORS: Record<TechBranch, string> = {
  living: '#10b981',
  exploitation: '#fbbf24',
  management: '#3b82f6',
  divine: '#a855f7',
  security: '#ef4444',
};

export class TechTreePanel {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private _isVisible = false;
  private callbacks: TechTreePanelCallbacks;
  private currentData: TechTreePanelData;

  constructor(callbacks: TechTreePanelCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'tech-tree-overlay';
    this.injectStyles();
    this.panel = document.createElement('div');
    this.panel.className = 'tech-tree-panel';
    this.container.appendChild(this.panel);
    this.currentData = { unlockedIds: [], influence: 0, faith: 0 };
    this.buildDOM();
  }

  private injectStyles(): void {
    if (document.getElementById('tech-tree-styles')) return;
    const style = document.createElement('style');
    style.id = 'tech-tree-styles';
    style.textContent = `
      #tech-tree-overlay {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        font-family: 'Segoe UI', -apple-system, sans-serif;
        color: #e0e0e0;
        pointer-events: auto;
      }
      #tech-tree-overlay.visible { display: flex; }

      .tech-tree-panel {
        width: 90vw;
        max-width: 1200px;
        height: 85vh;
        max-height: 800px;
        background: rgba(12,18,30,0.94);
                        border: 1px solid rgba(100, 100, 160, 0.5);
        border-radius: 8px;
        box-shadow: 0 4px 30px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(168,85,247,0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
              }

      .tech-tree-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid rgba(100, 100, 160, 0.3);
        background: rgba(0, 0, 0, 0.3);
      }
      .tech-tree-title {
        font-size: 20px;
        font-weight: 700;
        color: #a855f7;
        text-shadow: 0 0 10px rgba(168, 85, 247, 0.4);
        letter-spacing: 2px;
      }
      .tech-tree-resources {
        display: flex;
        gap: 16px;
        font-size: 13px;
        font-weight: 600;
      }
      .tech-tree-resources .res { display: flex; align-items: center; gap: 4px; }
      .tech-tree-resources .res-influence { color: #a855f7; }
      .tech-tree-resources .res-faith { color: #3b82f6; }
      .tech-tree-close {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(100,100,160,0.3);
        color: #ccc;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.15s;
      }
      .tech-tree-close:hover {
        background: rgba(239, 68, 68, 0.3);
        border-color: rgba(239, 68, 68, 0.5);
        color: #fff;
      }

      .tech-tree-body {
        flex: 1;
        display: flex;
        gap: 2px;
        padding: 12px;
        overflow-y: auto;
      }

      .tech-tree-branch {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 4px;
      }

      .tech-tree-branch-header {
        text-align: center;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        padding: 6px 0;
        border-radius: 4px;
        border: 1px solid;
        margin-bottom: 4px;
      }

      .tech-tree-node {
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid rgba(60, 80, 120, 0.3);
        background: rgba(0, 0, 0, 0.35);
        cursor: default;
        transition: all 0.15s;
        position: relative;
      }

      .tech-tree-node.unlocked {
        border-color: rgba(16, 185, 129, 0.5);
        background: rgba(16, 185, 129, 0.12);
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.15);
      }

      .tech-tree-node.available {
        border-color: rgba(168, 85, 247, 0.5);
        background: rgba(168, 85, 247, 0.1);
        box-shadow: 0 0 10px rgba(168, 85, 247, 0.2);
        cursor: pointer;
      }
      .tech-tree-node.available:hover {
        background: rgba(168, 85, 247, 0.2);
        box-shadow: 0 0 14px rgba(168, 85, 247, 0.35);
        transform: translateY(-1px);
      }

      .tech-tree-node.locked {
        opacity: 0.5;
        filter: grayscale(0.6);
      }

      .tech-tree-node-name {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tech-tree-node-check {
        color: #10b981;
        font-size: 14px;
      }
      .tech-tree-node-cost {
        font-size: 11px;
        font-weight: 600;
        color: #fbbf24;
        margin-bottom: 4px;
      }
      .tech-tree-node-cost .cost-faith { color: #3b82f6; }
      .tech-tree-node-cost .cost-insufficient { color: #ef4444; }
      .tech-tree-node-desc {
        font-size: 11px;
        color: #aaa;
        line-height: 1.4;
        margin-bottom: 4px;
      }
      .tech-tree-node-prereqs {
        font-size: 10px;
        color: #666;
        border-top: 1px solid rgba(100, 100, 160, 0.15);
        padding-top: 4px;
        margin-top: 4px;
      }
      .tech-tree-node-prereqs .prereq-met { color: #10b981; }
      .tech-tree-node-prereqs .prereq-unmet { color: #ef4444; }

      .tech-tree-body::-webkit-scrollbar { width: 6px; }
      .tech-tree-body::-webkit-scrollbar-thumb {
        background: rgba(100, 100, 160, 0.3);
        border-radius: 3px;
      }
    `;
    document.head.appendChild(style);
  }

  private buildDOM(): void {
    // Header will be rebuilt on each update to reflect current resources
  }

  /**
   * Update the panel with current tech tree state.
   */
  update(data: TechTreePanelData): void {
    this.currentData = data;
    if (!this._isVisible) return;
    this.render();
  }

  private render(): void {
    const branches = getTechBranches();
    const unlockedSet = new Set(this.currentData.unlockedIds);
    const availableNodes = getAvailableTechs(this.currentData.unlockedIds);
    const availableIds = new Set(availableNodes.map(n => n.id));

    // Header
    this.panel.innerHTML = `
      <div class="tech-tree-header">
        <div class="tech-tree-title">🔬 Tech Tree</div>
        <div class="tech-tree-resources">
          <span class="res res-influence">Influence: ${Math.floor(this.currentData.influence)}</span>
          <span class="res res-faith">Faith: ${Math.floor(this.currentData.faith)}</span>
        </div>
        <button class="tech-tree-close">✕ Close</button>
      </div>
      <div class="tech-tree-body"></div>
    `;

    const body = this.panel.querySelector('.tech-tree-body') as HTMLElement;

    // Build each branch column
    for (const branch of Object.keys(branches) as TechBranch[]) {
      const branchColor = BRANCH_COLORS[branch];
      const branchCol = document.createElement('div');
      branchCol.className = 'tech-tree-branch';

      // Branch header
      const header = document.createElement('div');
      header.className = 'tech-tree-branch-header';
      header.style.borderColor = `${branchColor}40`;
      header.style.color = branchColor;
      header.textContent = `${BRANCH_ICONS[branch]} ${BRANCH_LABELS[branch]}`;
      branchCol.appendChild(header);

      // Nodes in this branch
      for (const node of branches[branch]) {
        const nodeEl = this.createNodeElement(node, unlockedSet, availableIds);
        branchCol.appendChild(nodeEl);
      }

      body.appendChild(branchCol);
    }

    // Wire close button
    const closeBtn = this.panel.querySelector('.tech-tree-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      this.callbacks.onClose();
    });
  }

  private createNodeElement(
    node: TechNode,
    unlockedSet: Set<string>,
    availableIds: Set<string>,
  ): HTMLElement {
    const el = document.createElement('div');
    const isUnlocked = unlockedSet.has(node.id);
    const isAvailable = availableIds.has(node.id);
    const canAffordInfluence = this.currentData.influence >= node.cost.influence;
    const canAffordFaith = node.cost.faith === undefined || this.currentData.faith >= node.cost.faith;

    if (isUnlocked) {
      el.className = 'tech-tree-node unlocked';
    } else if (isAvailable) {
      el.className = 'tech-tree-node available';
    } else {
      el.className = 'tech-tree-node locked';
    }

    // Name with checkmark if unlocked
    const checkHtml = isUnlocked ? '<span class="tech-tree-node-check">✓</span>' : '';
    const nameHtml = `<div class="tech-tree-node-name">${checkHtml}${node.name}</div>`;

    // Cost
    const influenceClass = canAffordInfluence ? '' : 'cost-insufficient';
    const faithClass = canAffordFaith ? 'cost-faith' : 'cost-faith cost-insufficient';
    let costHtml = `<div class="tech-tree-node-cost">`;
    costHtml += `<span class="${influenceClass}">${node.cost.influence} influence</span>`;
    if (node.cost.faith !== undefined) {
      costHtml += ` <span class="${faithClass}}">${node.cost.faith} faith</span>`;
    }
    costHtml += `</div>`;

    // Prerequisites
    let prereqsHtml = '';
    if (node.prerequisites.length > 0) {
      const prereqLabels = node.prerequisites.map(prereqId => {
        const prereqNode = TECH_TREE_NODES.find(n => n.id === prereqId);
        const prereqName = prereqNode ? prereqNode.name : prereqId;
        const met = unlockedSet.has(prereqId);
        return `<span class="${met ? 'prereq-met' : 'prereq-unmet'}">${met ? '✓' : '🔒'} ${prereqName}</span>`;
      });
      prereqsHtml = `<div class="tech-tree-node-prereqs">Requires: ${prereqLabels.join(', ')}</div>`;
    }

    // Special case for divine_inspiration
    if (node.id === 'divine_inspiration' && node.prerequisites.length === 0) {
      const otherUnlocked = this.currentData.unlockedIds.filter(id => id !== 'divine_inspiration').length;
      const met = otherUnlocked >= 3;
      prereqsHtml = `<div class="tech-tree-node-prereqs">Requires: <span class="${met ? 'prereq-met' : 'prereq-unmet'}">${met ? '✓' : '🔒'} Any 3 other techs (${otherUnlocked}/3)</span></div>`;
    }

    el.innerHTML = `${nameHtml}${costHtml}<div class="tech-tree-node-desc">${node.description}</div>${prereqsHtml}`;

    // Click handler for available nodes
    if (isAvailable) {
      el.addEventListener('click', () => {
        this.callbacks.onUnlock(node.id);
      });
    }

    return el;
  }

  show(data: TechTreePanelData): void {
    this.currentData = data;
    this._isVisible = true;
    this.container.classList.add('visible');
    this.render();
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.remove('visible');
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  mount(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  destroy(): void {
    this.container.remove();
  }
}