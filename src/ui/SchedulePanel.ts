/**
 * SchedulePanel — Panel showing all cultists grouped by current shift.
 *
 * Three groups: Morning, Afternoon, Night.
 * Click a cultist to change their shift (3-button toggle).
 * "Auto-Assign" button evenly distributes cultists across shifts.
 * Shows current activity for each cultist based on time of day.
 *
 * @see src/components/Schedule.ts
 * @see src/systems/SchedulingSystem.ts
 */

import type { Shift } from '../components/Schedule';

export interface SchedulePanelCallbacks {
  onAssignShift: (entityId: number, shift: Shift) => void;
  onAutoAssign: () => void;
  onClose: () => void;
}

export interface ScheduleCultistInfo {
  id: number;
  name: string;
  tier: string;
  shift: Shift;
  activity: 'working' | 'eating' | 'free' | 'sleeping';
  health: number;
}

export interface SchedulePanelData {
  cultists: ScheduleCultistInfo[];
  currentHour: number;
}

const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  night: 'Night',
};

const SHIFT_ICONS: Record<Shift, string> = {
  morning: '🌅',
  afternoon: '☀️',
  night: '🌙',
};

const SHIFT_COLORS: Record<Shift, string> = {
  morning: '#fbbf24',
  afternoon: '#f97316',
  night: '#3b82f6',
};

const SHIFT_HOURS: Record<Shift, string> = {
  morning: '6:00 - 14:00',
  afternoon: '14:00 - 22:00',
  night: '22:00 - 6:00',
};

const ACTIVITY_ICONS: Record<string, string> = {
  working: '🔨',
  eating: '🍽️',
  free: '🎮',
  sleeping: '😴',
};

const ACTIVITY_COLORS: Record<string, string> = {
  working: '#10b981',
  eating: '#fbbf24',
  free: '#888',
  sleeping: '#3b82f6',
};

export class SchedulePanel {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private _isVisible = false;
  private callbacks: SchedulePanelCallbacks;
  private currentData: SchedulePanelData;

  constructor(callbacks: SchedulePanelCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'schedule-panel-overlay';
    this.injectStyles();
    this.panel = document.createElement('div');
    this.panel.className = 'schedule-panel';
    this.container.appendChild(this.panel);
    this.currentData = { cultists: [], currentHour: 6 };
  }

  private injectStyles(): void {
    if (document.getElementById('schedule-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'schedule-panel-styles';
    style.textContent = `
      #schedule-panel-overlay {
        position: fixed;
        inset: 0;
        z-index: 190;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        font-family: 'Segoe UI', -apple-system, sans-serif;
        color: #e0e0e0;
        pointer-events: auto;
      }
      #schedule-panel-overlay.visible { display: flex; }

      .schedule-panel {
        width: 700px;
        max-width: 90vw;
        max-height: 85vh;
        background: rgba(12,18,30,0.94);
                        border: 1px solid rgba(100, 100, 160, 0.5);
        border-radius: 8px;
        box-shadow: 0 4px 30px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(168,85,247,0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
              }

      .schedule-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid rgba(100, 100, 160, 0.3);
        background: rgba(0, 0, 0, 0.3);
      }
      .schedule-panel-title {
        font-size: 18px;
        font-weight: 700;
        color: #a855f7;
        text-shadow: 0 0 8px rgba(168, 85, 247, 0.3);
        letter-spacing: 1px;
      }
      .schedule-panel-actions {
        display: flex;
        gap: 8px;
      }
      .schedule-auto-btn {
        padding: 6px 14px;
        background: rgba(16, 185, 129, 0.2);
        border: 1px solid rgba(16, 185, 129, 0.4);
        color: #10b981;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.15s;
      }
      .schedule-auto-btn:hover {
        background: rgba(16, 185, 129, 0.35);
        border-color: rgba(16, 185, 129, 0.6);
        color: #fff;
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
      }
      .schedule-panel-close {
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(100,100,160,0.3);
        color: #ccc;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.15s;
      }
      .schedule-panel-close:hover {
        background: rgba(239, 68, 68, 0.3);
        border-color: rgba(239, 68, 68, 0.5);
        color: #fff;
      }

      .schedule-panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 12px 16px;
      }

      .schedule-panel-body::-webkit-scrollbar { width: 5px; }
      .schedule-panel-body::-webkit-scrollbar-thumb {
        background: rgba(100, 100, 160, 0.3);
        border-radius: 3px;
      }

      .schedule-shift-group {
        margin-bottom: 16px;
      }

      .schedule-shift-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        margin-bottom: 6px;
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        border: 1px solid;
      }

      .schedule-shift-count {
        margin-left: auto;
        font-size: 12px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.3);
      }

      .schedule-shift-hours {
        font-size: 11px;
        font-weight: 400;
        color: #888;
        text-transform: none;
        letter-spacing: 0;
      }

      .schedule-cultist-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 6px;
        margin-bottom: 4px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(60, 80, 120, 0.2);
        transition: all 0.12s;
      }
      .schedule-cultist-row:hover {
        background: rgba(30, 40, 60, 0.4);
        border-color: rgba(100, 150, 220, 0.3);
      }

      .schedule-cultist-name {
        font-size: 13px;
        font-weight: 600;
        min-width: 100px;
      }

      .schedule-cultist-tier {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 600;
      }

      .schedule-cultist-activity {
        font-size: 11px;
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
      }

      .schedule-cultist-health {
        font-size: 10px;
        color: #ef4444;
      }

      .schedule-shift-toggle {
        display: flex;
        gap: 2px;
      }
      .schedule-shift-btn {
        padding: 3px 8px;
        font-size: 10px;
        font-weight: 600;
        border-radius: 3px;
        cursor: pointer;
        border: 1px solid rgba(100, 100, 160, 0.2);
        background: rgba(0, 0, 0, 0.3);
        color: #888;
        transition: all 0.12s;
      }
      .schedule-shift-btn:hover {
        background: rgba(50, 80, 130, 0.4);
        color: #ccc;
      }
      .schedule-shift-btn.active {
        color: #fff;
        font-weight: 700;
      }
      .schedule-shift-btn.active[data-shift="morning"] {
        background: rgba(251, 191, 36, 0.3);
        border-color: rgba(251, 191, 36, 0.5);
      }
      .schedule-shift-btn.active[data-shift="afternoon"] {
        background: rgba(249, 115, 22, 0.3);
        border-color: rgba(249, 115, 22, 0.5);
      }
      .schedule-shift-btn.active[data-shift="night"] {
        background: rgba(59, 130, 246, 0.3);
        border-color: rgba(59, 130, 246, 0.5);
      }

      .schedule-empty {
        font-size: 11px;
        color: #555;
        padding: 8px 12px;
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update the panel with current data.
   */
  update(data: SchedulePanelData): void {
    if (this.panel.contains(document.activeElement)) return;
    if (JSON.stringify(this.currentData) === JSON.stringify(data)) return;
    this.currentData = data;
    if (!this._isVisible) return;
    this.render();
  }

  private render(): void {
    const shifts: Shift[] = ['morning', 'afternoon', 'night'];
    const timeStr = `${String(this.currentData.currentHour).padStart(2, '0')}:00`;

    this.panel.innerHTML = `
      <div class="schedule-panel-header">
        <div class="schedule-panel-title">📅 Schedule — ${timeStr}</div>
        <div class="schedule-panel-actions">
          <button class="schedule-auto-btn">⚡ Auto-Assign</button>
          <button class="schedule-panel-close">✕</button>
        </div>
      </div>
      <div class="schedule-panel-body"></div>
    `;

    const body = this.panel.querySelector('.schedule-panel-body') as HTMLElement;

    for (const shift of shifts) {
      const shiftCultists = this.currentData.cultists.filter((c) => c.shift === shift);
      const shiftColor = SHIFT_COLORS[shift];

      const group = document.createElement('div');
      group.className = 'schedule-shift-group';

      const header = document.createElement('div');
      header.className = 'schedule-shift-header';
      header.style.borderColor = `${shiftColor}40`;
      header.style.color = shiftColor;
      header.innerHTML = `
        ${SHIFT_ICONS[shift]} ${SHIFT_LABELS[shift]}
        <span class="schedule-shift-hours">${SHIFT_HOURS[shift]}</span>
        <span class="schedule-shift-count" style="color:${shiftColor};">${shiftCultists.length} cultists</span>
      `;
      group.appendChild(header);

      if (shiftCultists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'schedule-empty';
        empty.textContent = 'No cultists assigned to this shift.';
        group.appendChild(empty);
      } else {
        for (const cultist of shiftCultists) {
          group.appendChild(this.createCultistRow(cultist));
        }
      }

      body.appendChild(group);
    }

    // Wire buttons
    const autoBtn = this.panel.querySelector('.schedule-auto-btn') as HTMLButtonElement;
    autoBtn.addEventListener('click', () => {
      this.callbacks.onAutoAssign();
    });

    const closeBtn = this.panel.querySelector('.schedule-panel-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      this.callbacks.onClose();
    });
  }

  private createCultistRow(cultist: ScheduleCultistInfo): HTMLElement {
    const el = document.createElement('div');
    el.className = 'schedule-cultist-row';

    const activityIcon = ACTIVITY_ICONS[cultist.activity] || '❓';
    const activityColor = ACTIVITY_COLORS[cultist.activity] || '#888';
    const activityLabel = cultist.activity.charAt(0).toUpperCase() + cultist.activity.slice(1);

    // Tier badge color
    const tierColors: Record<string, string> = {
      very_poor: '#666',
      poor: '#888',
      average: '#aaa',
      good: '#3b82f6',
      very_good: '#a855f7',
      incredible: '#fbbf24',
    };
    const tierColor = tierColors[cultist.tier] || '#aaa';
    const tierLabel = cultist.tier.replace('_', ' ');

    // Shift toggle buttons
    const shifts: Shift[] = ['morning', 'afternoon', 'night'];
    const toggleHtml = shifts
      .map((s) => {
        const isActive = cultist.shift === s;
        const icon = SHIFT_ICONS[s];
        return `<button class="schedule-shift-btn ${isActive ? 'active' : ''}" data-shift="${s}" data-entity="${cultist.id}" title="${SHIFT_LABELS[s]}">${icon}</button>`;
      })
      .join('');

    el.innerHTML = `
      <span class="schedule-cultist-name">${cultist.name}</span>
      <span class="schedule-cultist-tier" style="color:${tierColor};border:1px solid ${tierColor}40;background:${tierColor}15;">${tierLabel}</span>
      <span class="schedule-cultist-activity" style="color:${activityColor};">${activityIcon} ${activityLabel}</span>
      <span class="schedule-cultist-health">${cultist.health < 50 ? '❤️' + cultist.health + '%' : ''}</span>
      <div class="schedule-shift-toggle">${toggleHtml}</div>
    `;

    // Wire shift toggle buttons
    el.querySelectorAll('.schedule-shift-btn').forEach((btn) => {
      const button = btn as HTMLButtonElement;
      button.addEventListener('click', () => {
        const newShift = button.getAttribute('data-shift') as Shift;
        const entityId = parseInt(button.getAttribute('data-entity') || '0');
        if (newShift && newShift !== cultist.shift) {
          this.callbacks.onAssignShift(entityId, newShift);
        }
      });
    });

    return el;
  }

  show(data: SchedulePanelData): void {
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
