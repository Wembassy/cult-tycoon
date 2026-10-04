/**
 * SchedulePanel — RimWorld-style 24-hour activity grid.
 */

import type { ScheduleActivity } from '../components/Schedule';

export interface SchedulePanelCallbacks {
  onSetHour: (entityId: number, hour: number, activity: ScheduleActivity) => void;
  onResetAll: () => void;
  onClose: () => void;
}

export interface ScheduleCultistInfo {
  id: number;
  name: string;
  tier: string;
  activity: 'working' | 'eating' | 'free' | 'sleeping';
  health: number;
  hours: ScheduleActivity[];
}

export interface SchedulePanelData {
  cultists: ScheduleCultistInfo[];
  currentHour: number;
}

const ORDER: ScheduleActivity[] = ['anything', 'work', 'recreation', 'sleep'];
const LABEL: Record<ScheduleActivity, string> = {
  anything: 'A',
  work: 'W',
  recreation: 'R',
  sleep: 'S',
};
const TITLE: Record<ScheduleActivity, string> = {
  anything: 'Anything',
  work: 'Work',
  recreation: 'Recreation',
  sleep: 'Sleep',
};

export class SchedulePanel {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private _isVisible = false;
  private currentData: SchedulePanelData = { cultists: [], currentHour: 6 };

  constructor(private callbacks: SchedulePanelCallbacks) {
    this.container = document.createElement('div');
    this.container.id = 'schedule-panel-overlay';
    this.panel = document.createElement('div');
    this.panel.className = 'schedule-panel';
    this.container.appendChild(this.panel);
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('schedule-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'schedule-panel-styles';
    style.textContent = `
      #schedule-panel-overlay{position:fixed;inset:0;z-index:190;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.75);pointer-events:auto;color:#e5e7eb;font-family:'Segoe UI',sans-serif}
      #schedule-panel-overlay.visible{display:flex}
      .schedule-panel{width:min(1180px,96vw);max-height:86vh;display:flex;flex-direction:column;background:rgba(12,18,30,.98);border:1px solid rgba(100,140,200,.45);border-radius:8px;overflow:hidden}
      .schedule-header{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid rgba(100,140,200,.25)}
      .schedule-title{font-size:18px;font-weight:800}.schedule-actions{display:flex;gap:8px}
      .schedule-btn{border:1px solid rgba(100,140,200,.35);background:rgba(30,45,70,.55);color:#dbeafe;border-radius:5px;padding:6px 10px;cursor:pointer}
      .schedule-body{overflow:auto;padding:10px}
      .schedule-grid{display:grid;grid-template-columns:150px repeat(24,34px);gap:2px;min-width:990px;align-items:center}
      .schedule-hour{font-size:9px;color:#94a3b8;text-align:center;padding:4px 0}.schedule-hour.now{color:#fbbf24;font-weight:800}
      .schedule-name{font-size:11px;font-weight:700;padding:0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .schedule-cell{width:32px;height:30px;border:1px solid rgba(100,140,200,.22);border-radius:3px;cursor:pointer;font-size:10px;font-weight:800;color:#dbeafe}
      .schedule-cell[data-activity="anything"]{background:rgba(100,116,139,.25)}
      .schedule-cell[data-activity="work"]{background:rgba(16,185,129,.35)}
      .schedule-cell[data-activity="recreation"]{background:rgba(168,85,247,.35)}
      .schedule-cell[data-activity="sleep"]{background:rgba(59,130,246,.4)}
      .schedule-cell.now{outline:2px solid #fbbf24}
      .schedule-legend{padding:8px 14px 12px;color:#94a3b8;font-size:11px}
    `;
    document.head.appendChild(style);
  }

  show(data: SchedulePanelData): void {
    this.currentData = data;
    this._isVisible = true;
    this.container.classList.add('visible');
    this.render();
  }

  update(data: SchedulePanelData): void {
    this.currentData = data;
    if (this._isVisible) this.render();
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.remove('visible');
  }

  get isVisible(): boolean { return this._isVisible; }

  mount(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  destroy(): void { this.container.remove(); }

  private render(): void {
    const now = ((Math.floor(this.currentData.currentHour) % 24) + 24) % 24;
    const hours = Array.from({ length: 24 }, (_, hour) =>
      `<div class="schedule-hour ${hour === now ? 'now' : ''}">${String(hour).padStart(2,'0')}</div>`
    ).join('');

    const rows = this.currentData.cultists.map(cultist => {
      const cells = Array.from({ length: 24 }, (_, hour) => {
        const activity = cultist.hours[hour] ?? 'anything';
        return `<button class="schedule-cell ${hour === now ? 'now' : ''}" data-entity="${cultist.id}" data-hour="${hour}" data-activity="${activity}" title="${hour}:00 — ${TITLE[activity]}">${LABEL[activity]}</button>`;
      }).join('');
      return `<div class="schedule-name">${cultist.name}</div>${cells}`;
    }).join('');

    this.panel.innerHTML = `
      <div class="schedule-header">
        <div class="schedule-title">📅 Hourly Schedule</div>
        <div class="schedule-actions">
          <button class="schedule-btn schedule-reset">Reset Defaults</button>
          <button class="schedule-btn schedule-close">✕</button>
        </div>
      </div>
      <div class="schedule-body">
        <div class="schedule-grid">
          <div class="schedule-hour">Follower</div>${hours}
          ${rows || '<div class="schedule-name">No followers</div>'}
        </div>
      </div>
      <div class="schedule-legend">A = Anything · W = Work · R = Recreation · S = Sleep. Click a cell to cycle.</div>
    `;

    this.panel.querySelector('.schedule-close')?.addEventListener('click', () => this.callbacks.onClose());
    this.panel.querySelector('.schedule-reset')?.addEventListener('click', () => this.callbacks.onResetAll());
    this.panel.querySelectorAll<HTMLButtonElement>('.schedule-cell').forEach(button => {
      button.addEventListener('click', () => {
        const current = button.dataset.activity as ScheduleActivity;
        const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
        this.callbacks.onSetHour(Number(button.dataset.entity), Number(button.dataset.hour), next);
      });
    });
  }
}
