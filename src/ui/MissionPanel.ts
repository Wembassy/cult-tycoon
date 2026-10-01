/**
 * MissionPanel — Side panel showing available missions as cards.
 *
 * Each card shows mission name, type icon, duration, difficulty, and rewards.
 * "Send Cultists" button opens a cultist selector with checkboxes.
 * Active missions section at the bottom shows progress bars.
 *
 * @see src/data/MissionTemplates.ts
 * @see src/systems/MissionSystem.ts
 */

import {
  MISSION_TEMPLATES,
  getAllMissionTemplates,
  type MissionTemplate,
  type MissionType,
} from '../data/MissionTemplates';
import type { ActiveMission } from '../systems/MissionSystem';

export interface MissionPanelCallbacks {
  onSendMission: (templateId: string, cultistIds: number[]) => void;
  onClose: () => void;
}

export interface CultistInfo {
  id: number;
  name: string;
  tier: string;
  skills: {
    cooking: number;
    research: number;
    construction: number;
    faith: number;
    combat: number;
    social: number;
  };
  onMission: boolean;
}

export interface MissionPanelData {
  cultists: CultistInfo[];
  activeMissions: ActiveMission[];
}

const MISSION_TYPE_ICONS: Record<MissionType, string> = {
  heat_reduction: '🧊',
  pr_generation: '📢',
  object_acquisition: '💎',
  resource_gathering: '📦',
};

const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  heat_reduction: 'Heat Reduction',
  pr_generation: 'PR Generation',
  object_acquisition: 'Object Acquisition',
  resource_gathering: 'Resource Gathering',
};

const MISSION_TYPE_COLORS: Record<MissionType, string> = {
  heat_reduction: '#3b82f6',
  pr_generation: '#a855f7',
  object_acquisition: '#fbbf24',
  resource_gathering: '#10b981',
};

const SKILL_RELEVANCE: Record<MissionType, string[]> = {
  heat_reduction: ['social', 'faith'],
  pr_generation: ['social', 'faith'],
  object_acquisition: ['construction', 'research', 'combat'],
  resource_gathering: ['social', 'construction'],
};

export class MissionPanel {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private _isVisible = false;
  private callbacks: MissionPanelCallbacks;
  private currentData: MissionPanelData;
  private selectedCultistIds: Set<number> = new Set();

  constructor(callbacks: MissionPanelCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'mission-panel-overlay';
    this.injectStyles();
    this.panel = document.createElement('div');
    this.panel.className = 'mission-panel';
    this.container.appendChild(this.panel);
    this.currentData = { cultists: [], activeMissions: [] };
  }

  private injectStyles(): void {
    if (document.getElementById('mission-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'mission-panel-styles';
    style.textContent = `
      #mission-panel-overlay {
        position: fixed;
        top: 0;
        right: 0;
        width: 380px;
        height: 100vh;
        z-index: 180;
        display: none;
        pointer-events: auto;
        font-family: 'Segoe UI', -apple-system, sans-serif;
        color: #e0e0e0;
      }
      #mission-panel-overlay.visible { display: block; }

      .mission-panel {
        height: 100%;
        background-image: url('/assets/ui/scifi_panel.png'), linear-gradient(180deg, rgba(15,15,30,0.96), rgba(10,10,25,0.98));
        background-size: 100% 100%, 100% 100%;
        background-repeat: no-repeat;
        border-left: 1px solid rgba(100, 100, 160, 0.5);
        box-shadow: -4px 0 20px rgba(0,0,0,0.7);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        image-rendering: pixelated;
      }

      .mission-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(100, 100, 160, 0.3);
        background: rgba(0, 0, 0, 0.3);
      }
      .mission-panel-title {
        font-size: 18px;
        font-weight: 700;
        color: #a855f7;
        text-shadow: 0 0 8px rgba(168, 85, 247, 0.3);
        letter-spacing: 1px;
      }
      .mission-panel-close {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(100,100,160,0.3);
        color: #ccc;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.15s;
      }
      .mission-panel-close:hover {
        background: rgba(239, 68, 68, 0.3);
        border-color: rgba(239, 68, 68, 0.5);
        color: #fff;
      }

      .mission-panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 10px 12px;
      }

      .mission-panel-body::-webkit-scrollbar { width: 5px; }
      .mission-panel-body::-webkit-scrollbar-thumb {
        background: rgba(100, 100, 160, 0.3);
        border-radius: 3px;
      }

      .mission-section-title {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #888;
        margin: 12px 0 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(100, 100, 160, 0.2);
      }
      .mission-section-title:first-child { margin-top: 0; }

      .mission-card {
        padding: 12px;
        border-radius: 6px;
        border: 1px solid rgba(60, 80, 120, 0.3);
        background: rgba(0, 0, 0, 0.35);
        margin-bottom: 8px;
        transition: all 0.15s;
      }
      .mission-card:hover {
        border-color: rgba(100, 150, 220, 0.4);
        background: rgba(20, 30, 50, 0.4);
      }

      .mission-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .mission-card-icon {
        font-size: 20px;
      }
      .mission-card-name {
        font-size: 14px;
        font-weight: 700;
        flex: 1;
      }
      .mission-card-type {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .mission-card-desc {
        font-size: 11px;
        color: #aaa;
        line-height: 1.4;
        margin-bottom: 8px;
      }

      .mission-card-stats {
        display: flex;
        gap: 12px;
        font-size: 11px;
        margin-bottom: 8px;
      }
      .mission-card-stat {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .mission-card-stat-label {
        color: #666;
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .mission-card-stat-value {
        font-weight: 600;
      }

      .mission-card-rewards {
        font-size: 11px;
        color: #10b981;
        margin-bottom: 8px;
      }

      .mission-card-heat {
        font-size: 11px;
        color: #ef4444;
      }

      .mission-send-btn {
        width: 100%;
        padding: 6px 12px;
        background: rgba(168, 85, 247, 0.2);
        border: 1px solid rgba(168, 85, 247, 0.4);
        color: #c4a0e8;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.15s;
      }
      .mission-send-btn:hover {
        background: rgba(168, 85, 247, 0.35);
        border-color: rgba(168, 85, 247, 0.6);
        color: #fff;
        box-shadow: 0 0 8px rgba(168, 85, 247, 0.3);
      }

      /* Cultist selector overlay */
      .cultist-selector {
        position: fixed;
        inset: 0;
        z-index: 210;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(3px);
      }
      .cultist-selector.visible { display: flex; }

      .cultist-selector-panel {
        width: 460px;
        max-height: 80vh;
        background-image: url('/assets/ui/scifi_panel.png'), linear-gradient(180deg, rgba(15,15,30,0.97), rgba(10,10,25,0.98));
        background-size: 100% 100%, 100% 100%;
        background-repeat: no-repeat;
        border: 1px solid rgba(100, 100, 160, 0.5);
        border-radius: 8px;
        box-shadow: 0 4px 30px rgba(0,0,0,0.8);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        image-rendering: pixelated;
      }

      .cultist-selector-header {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(100, 100, 160, 0.3);
        background: rgba(0, 0, 0, 0.3);
        font-size: 15px;
        font-weight: 700;
        color: #a855f7;
      }

      .cultist-selector-body {
        flex: 1;
        overflow-y: auto;
        padding: 10px 12px;
      }

      .cultist-selector-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 4px;
        margin-bottom: 4px;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid transparent;
        transition: all 0.12s;
      }
      .cultist-selector-row:hover {
        background: rgba(50, 80, 130, 0.3);
        border-color: rgba(100, 150, 220, 0.2);
      }
      .cultist-selector-row.selected {
        background: rgba(168, 85, 247, 0.15);
        border-color: rgba(168, 85, 247, 0.4);
      }
      .cultist-selector-row.disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .cultist-selector-row input[type="checkbox"] {
        accent-color: #a855f7;
      }

      .cultist-selector-name {
        font-size: 13px;
        font-weight: 600;
        flex: 1;
      }
      .cultist-selector-skills {
        font-size: 10px;
        color: #888;
      }
      .cultist-selector-skills .relevant-skill {
        color: #fbbf24;
        font-weight: 600;
      }

      .cultist-selector-footer {
        padding: 10px 16px;
        border-top: 1px solid rgba(100, 100, 160, 0.3);
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .cultist-selector-count {
        font-size: 12px;
        color: #aaa;
      }
      .cultist-selector-actions {
        display: flex;
        gap: 8px;
      }
      .cultist-selector-btn {
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.15s;
        border: 1px solid;
      }
      .cultist-selector-btn.cancel {
        background: rgba(0,0,0,0.3);
        border-color: rgba(100,100,160,0.3);
        color: #ccc;
      }
      .cultist-selector-btn.cancel:hover {
        background: rgba(239, 68, 68, 0.2);
        border-color: rgba(239, 68, 68, 0.4);
      }
      .cultist-selector-btn.confirm {
        background: rgba(168, 85, 247, 0.25);
        border-color: rgba(168, 85, 247, 0.5);
        color: #c4a0e8;
      }
      .cultist-selector-btn.confirm:hover {
        background: rgba(168, 85, 247, 0.4);
        border-color: rgba(168, 85, 247, 0.7);
        color: #fff;
        box-shadow: 0 0 8px rgba(168, 85, 247, 0.3);
      }
      .cultist-selector-btn.confirm:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* Active missions */
      .active-mission-card {
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid rgba(168, 85, 247, 0.3);
        background: rgba(168, 85, 247, 0.08);
        margin-bottom: 6px;
      }
      .active-mission-name {
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .active-mission-progress-bar {
        height: 8px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 4px;
        overflow: hidden;
        border: 1px solid rgba(100, 100, 160, 0.2);
      }
      .active-mission-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #a855f7, #3b82f6);
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      .active-mission-progress-text {
        font-size: 10px;
        color: #888;
        margin-top: 3px;
        text-align: right;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update the panel with current data.
   */
  update(data: MissionPanelData): void {
    this.currentData = data;
    if (!this._isVisible) return;
    this.render();
  }

  private render(): void {
    const missions = getAllMissionTemplates();

    this.panel.innerHTML = `
      <div class="mission-panel-header">
        <div class="mission-panel-title">🎯 Missions</div>
        <button class="mission-panel-close">✕</button>
      </div>
      <div class="mission-panel-body">
        <div class="mission-section-title">Available Missions</div>
        <div class="mission-list"></div>
        <div class="mission-section-title">Active Missions</div>
        <div class="active-mission-list"></div>
      </div>
    `;

    const missionList = this.panel.querySelector('.mission-list') as HTMLElement;
    for (const mission of missions) {
      missionList.appendChild(this.createMissionCard(mission));
    }

    const activeList = this.panel.querySelector('.active-mission-list') as HTMLElement;
    if (this.currentData.activeMissions.length === 0) {
      activeList.innerHTML = '<div style="font-size:11px;color:#666;padding:8px;">No active missions.</div>';
    } else {
      for (const active of this.currentData.activeMissions) {
        activeList.appendChild(this.createActiveMissionCard(active));
      }
    }

    // Wire close
    const closeBtn = this.panel.querySelector('.mission-panel-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      this.callbacks.onClose();
    });
  }

  private createMissionCard(mission: MissionTemplate): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mission-card';

    const typeColor = MISSION_TYPE_COLORS[mission.type];
    const typeIcon = MISSION_TYPE_ICONS[mission.type];
    const typeLabel = MISSION_TYPE_LABELS[mission.type];

    // Rewards text
    const rewardParts: string[] = [];
    if (mission.rewards.heatReduction) rewardParts.push(`-${mission.rewards.heatReduction} heat`);
    if (mission.rewards.prGain) rewardParts.push(`+${mission.rewards.prGain} PR`);
    if (mission.rewards.money) rewardParts.push(`+${mission.rewards.money} money`);
    if (mission.rewards.influence) rewardParts.push(`+${mission.rewards.influence} influence`);
    if (mission.rewards.decorItemId) rewardParts.push(`📦 ${mission.rewards.decorItemId}`);

    // Difficulty stars
    const difficultyStars = '★'.repeat(mission.difficulty) + '☆'.repeat(10 - mission.difficulty);

    el.innerHTML = `
      <div class="mission-card-header">
        <span class="mission-card-icon">${typeIcon}</span>
        <span class="mission-card-name">${mission.name}</span>
        <span class="mission-card-type" style="color:${typeColor};border:1px solid ${typeColor}40;background:${typeColor}15;">${typeLabel}</span>
      </div>
      <div class="mission-card-desc">${mission.description}</div>
      <div class="mission-card-stats">
        <div class="mission-card-stat">
          <span class="mission-card-stat-label">Duration</span>
          <span class="mission-card-stat-value">${mission.duration}h</span>
        </div>
        <div class="mission-card-stat">
          <span class="mission-card-stat-label">Difficulty</span>
          <span class="mission-card-stat-value" style="color:#fbbf24;">${difficultyStars}</span>
        </div>
        <div class="mission-card-stat">
          <span class="mission-card-stat-label">Cultists</span>
          <span class="mission-card-stat-value">${mission.minCultists}-${mission.maxCultists}</span>
        </div>
      </div>
      <div class="mission-card-rewards">Rewards: ${rewardParts.join(', ')}</div>
      <div class="mission-card-heat">Heat cost: +${mission.heatCost}</div>
      <button class="mission-send-btn">Send Cultists →</button>
    `;

    const sendBtn = el.querySelector('.mission-send-btn') as HTMLButtonElement;
    sendBtn.addEventListener('click', () => {
      this.openCultistSelector(mission);
    });

    return el;
  }

  private createActiveMissionCard(active: ActiveMission): HTMLElement {
    const el = document.createElement('div');
    el.className = 'active-mission-card';

    const template = MISSION_TEMPLATES[active.templateId];
    const name = template ? template.name : active.templateId;
    const pct = Math.floor(active.progress * 100);

    el.innerHTML = `
      <div class="active-mission-name">${MISSION_TYPE_ICONS[template?.type ?? 'resource_gathering']} ${name}</div>
      <div class="active-mission-progress-bar">
        <div class="active-mission-progress-fill" style="width:${pct}%;"></div>
      </div>
      <div class="active-mission-progress-text">${pct}% — ${active.cultistIds.length} cultists</div>
    `;

    return el;
  }

  private openCultistSelector(mission: MissionTemplate): void {
    this.selectedCultistIds.clear();

    // Remove any existing selector
    const existing = document.querySelector('.cultist-selector');
    if (existing) existing.remove();

    const selector = document.createElement('div');
    selector.className = 'cultist-selector visible';

    const relevantSkills = SKILL_RELEVANCE[mission.type];

    let cultistsHtml = '';
    for (const c of this.currentData.cultists) {
      const isDisabled = c.onMission;
      const skillDisplay = relevantSkills
        .map(s => `<span class="relevant-skill">${s}: ${(c.skills as Record<string, number>)[s] ?? 1}</span>`)
        .join(' ');

      cultistsHtml += `
        <label class="cultist-selector-row ${isDisabled ? 'disabled' : ''}">
          <input type="checkbox" data-id="${c.id}" ${isDisabled ? 'disabled' : ''} />
          <span class="cultist-selector-name">${c.name}</span>
          <span class="cultist-selector-skills">${skillDisplay}</span>
        </label>
      `;
    }

    selector.innerHTML = `
      <div class="cultist-selector-panel">
        <div class="cultist-selector-header">Select Cultists for "${mission.name}" (${mission.minCultists}-${mission.maxCultists})</div>
        <div class="cultist-selector-body">
          ${cultistsHtml || '<div style="color:#666;padding:12px;">No available cultists.</div>'}
        </div>
        <div class="cultist-selector-footer">
          <span class="cultist-selector-count" id="cultist-count">0 selected</span>
          <div class="cultist-selector-actions">
            <button class="cultist-selector-btn cancel">Cancel</button>
            <button class="cultist-selector-btn confirm" disabled>Confirm</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(selector);

    // Wire checkboxes
    const updateCount = () => {
      const count = this.selectedCultistIds.size;
      const countEl = selector.querySelector('#cultist-count') as HTMLElement;
      countEl.textContent = `${count} selected`;
      const confirmBtn = selector.querySelector('.cultist-selector-btn.confirm') as HTMLButtonElement;
      confirmBtn.disabled = count < mission.minCultists || count > mission.maxCultists;
    };

    selector.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const checkbox = cb as HTMLInputElement;
      checkbox.addEventListener('change', () => {
        const id = parseInt(checkbox.getAttribute('data-id') || '0');
        if (checkbox.checked) {
          this.selectedCultistIds.add(id);
          checkbox.closest('.cultist-selector-row')?.classList.add('selected');
        } else {
          this.selectedCultistIds.delete(id);
          checkbox.closest('.cultist-selector-row')?.classList.remove('selected');
        }
        updateCount();
      });
    });

    // Cancel
    selector.querySelector('.cultist-selector-btn.cancel')?.addEventListener('click', () => {
      selector.remove();
    });

    // Confirm
    selector.querySelector('.cultist-selector-btn.confirm')?.addEventListener('click', () => {
      const ids = Array.from(this.selectedCultistIds);
      if (ids.length >= mission.minCultists && ids.length <= mission.maxCultists) {
        this.callbacks.onSendMission(mission.id, ids);
        selector.remove();
      }
    });

    // Click outside to close
    selector.addEventListener('click', (e) => {
      if (e.target === selector) selector.remove();
    });
  }

  show(data: MissionPanelData): void {
    this.currentData = data;
    this._isVisible = true;
    this.container.classList.add('visible');
    this.render();
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.remove('visible');
    // Clean up any open selector
    document.querySelector('.cultist-selector')?.remove();
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  mount(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  destroy(): void {
    document.querySelector('.cultist-selector')?.remove();
    this.container.remove();
  }
}