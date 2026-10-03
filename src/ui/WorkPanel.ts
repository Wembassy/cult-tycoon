/**
 * WorkPanel — RimWorld-style follower role and work-priority grid.
 */

import type { WorkPriority, WorkRole } from '../components/WorkPreferences';

export type WorkJobKey = 'cook' | 'research' | 'pray' | 'build' | 'clean' | 'haul' | 'harvest';

export interface WorkCultistInfo {
  id: number;
  name: string;
  tier: string;
  role: WorkRole;
  skills: Record<WorkJobKey, number>;
  priorities: Record<WorkJobKey, WorkPriority>;
}

export interface WorkPanelData {
  cultists: WorkCultistInfo[];
}

export interface WorkPanelCallbacks {
  onSetRole: (entityId: number, role: WorkRole) => void;
  onSetPriority: (entityId: number, job: WorkJobKey, priority: WorkPriority) => void;
  onAutoAssign: () => void;
  onClose: () => void;
}

const JOBS: { key: WorkJobKey; label: string; icon: string }[] = [
  { key: 'cook', label: 'Cook', icon: '🍲' },
  { key: 'research', label: 'Research', icon: '🔬' },
  { key: 'pray', label: 'Pray', icon: '🙏' },
  { key: 'build', label: 'Build', icon: '🔨' },
  { key: 'clean', label: 'Clean', icon: '🧹' },
  { key: 'haul', label: 'Haul', icon: '📦' },
  { key: 'harvest', label: 'Harvest', icon: '🪓' },
];

const ROLES: { key: WorkRole; label: string }[] = [
  { key: 'generalist', label: 'Generalist' },
  { key: 'researcher', label: 'Researcher' },
  { key: 'cook', label: 'Cook' },
  { key: 'devotee', label: 'Devotee' },
  { key: 'builder', label: 'Builder' },
  { key: 'caretaker', label: 'Caretaker' },
];

export class WorkPanel {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private _isVisible = false;
  private currentData: WorkPanelData = { cultists: [] };

  constructor(private callbacks: WorkPanelCallbacks) {
    this.container = document.createElement('div');
    this.container.id = 'work-panel-overlay';
    this.panel = document.createElement('div');
    this.panel.className = 'work-panel';
    this.container.appendChild(this.panel);
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('work-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'work-panel-styles';
    style.textContent = `
      #work-panel-overlay {
        position: fixed; inset: 0; z-index: 195; display: none;
        align-items: center; justify-content: center;
        background: rgba(0,0,0,.72); backdrop-filter: blur(4px);
        pointer-events: auto; color: #e5e7eb;
        font-family: 'Segoe UI', -apple-system, sans-serif;
      }
      #work-panel-overlay.visible { display: flex; }
      .work-panel {
        width: min(1050px, 94vw); max-height: 84vh; overflow: hidden;
        display: flex; flex-direction: column;
        background: linear-gradient(180deg, rgba(15,20,34,.98), rgba(8,12,22,.99));
        border: 1px solid rgba(100,140,200,.45); border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,.75);
      }
      .work-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:14px 18px; border-bottom:1px solid rgba(100,140,200,.25);
      }
      .work-title { font-size:18px; font-weight:800; letter-spacing:1px; }
      .work-actions { display:flex; gap:8px; }
      .work-btn, .work-close {
        border:1px solid rgba(100,140,200,.35); background:rgba(30,45,70,.55);
        color:#dbeafe; border-radius:5px; padding:6px 10px; cursor:pointer;
      }
      .work-body { overflow:auto; padding:10px 12px 14px; }
      .work-grid {
        display:grid;
        grid-template-columns: minmax(150px,1.6fr) minmax(125px,1.2fr) repeat(7, minmax(74px,.8fr));
        min-width: 935px; gap:4px; align-items:center;
      }
      .work-head {
        font-size:10px; color:#93a4bd; text-align:center; text-transform:uppercase;
        letter-spacing:.5px; padding:6px 4px;
      }
      .work-row { display:contents; }
      .work-name, .work-role-cell, .work-cell {
        min-height:42px; display:flex; align-items:center;
        background:rgba(0,0,0,.25); border:1px solid rgba(80,105,145,.18);
      }
      .work-name { padding:0 10px; gap:8px; font-size:12px; font-weight:700; }
      .work-tier { color:#94a3b8; font-size:9px; text-transform:uppercase; }
      .work-role-cell { padding:4px; }
      .work-role {
        width:100%; background:rgba(12,18,30,.85); color:#dbeafe;
        border:1px solid rgba(100,140,200,.25); border-radius:4px; padding:6px;
      }
      .work-cell { justify-content:center; gap:5px; }
      .work-priority {
        width:32px; height:30px; border-radius:5px; cursor:pointer; font-weight:800;
        border:1px solid rgba(100,140,200,.25); background:rgba(20,28,45,.9); color:#cbd5e1;
      }
      .work-priority[data-priority="1"] { color:#fff; background:rgba(16,185,129,.34); border-color:rgba(16,185,129,.6); }
      .work-priority[data-priority="2"] { color:#fff; background:rgba(59,130,246,.3); }
      .work-priority[data-priority="3"] { color:#e5e7eb; background:rgba(100,116,139,.25); }
      .work-priority[data-priority="4"] { color:#94a3b8; background:rgba(30,41,59,.5); }
      .work-priority[data-priority="0"] { color:#64748b; background:rgba(10,10,14,.5); }
      .work-skill { font-size:10px; color:#94a3b8; min-width:14px; text-align:center; }
      .work-help {
        font-size:11px; color:#94a3b8; padding:0 18px 12px;
      }
    `;
    document.head.appendChild(style);
  }

  update(data: WorkPanelData): void {
    this.currentData = data;
    if (this._isVisible) this.render();
  }

  show(data: WorkPanelData): void {
    this.currentData = data;
    this._isVisible = true;
    this.container.classList.add('visible');
    this.render();
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
    const headers = JOBS.map(job => `<div class="work-head">${job.icon}<br>${job.label}</div>`).join('');
    const rows = this.currentData.cultists.map(cultist => {
      const roleOptions = ROLES.map(role =>
        `<option value="${role.key}" ${role.key === cultist.role ? 'selected' : ''}>${role.label}</option>`
      ).join('');
      const cells = JOBS.map(job => {
        const priority = cultist.priorities[job.key];
        const skill = cultist.skills[job.key];
        return `<div class="work-cell">
          <button class="work-priority" data-entity="${cultist.id}" data-job="${job.key}" data-priority="${priority}" title="1 = highest, 4 = lowest, X = disabled">${priority === 0 ? '×' : priority}</button>
          <span class="work-skill" title="Skill">${skill}</span>
        </div>`;
      }).join('');
      return `<div class="work-row">
        <div class="work-name"><span>${cultist.name}</span><span class="work-tier">${cultist.tier.replaceAll('_',' ')}</span></div>
        <div class="work-role-cell"><select class="work-role" data-entity="${cultist.id}">${roleOptions}</select></div>
        ${cells}
      </div>`;
    }).join('');

    this.panel.innerHTML = `
      <div class="work-header">
        <div class="work-title">👥 Roles & Work</div>
        <div class="work-actions">
          <button class="work-btn work-auto">⚡ Auto Assign Roles</button>
          <button class="work-close">✕</button>
        </div>
      </div>
      <div class="work-body">
        <div class="work-grid">
          <div class="work-head" style="text-align:left">Cultist</div>
          <div class="work-head" style="text-align:left">Role</div>
          ${headers}
          ${rows || '<div style="grid-column:1/-1;padding:20px;color:#94a3b8">No cultists available.</div>'}
        </div>
      </div>
      <div class="work-help">Priority 1 is highest. Click a number to cycle 1 → 2 → 3 → 4 → disabled. Skill is shown beside each priority.</div>
    `;

    this.panel.querySelector('.work-close')?.addEventListener('click', () => this.callbacks.onClose());
    this.panel.querySelector('.work-auto')?.addEventListener('click', () => this.callbacks.onAutoAssign());

    this.panel.querySelectorAll('.work-role').forEach(el => {
      el.addEventListener('change', () => {
        const select = el as HTMLSelectElement;
        this.callbacks.onSetRole(Number(select.dataset.entity), select.value as WorkRole);
      });
    });

    this.panel.querySelectorAll('.work-priority').forEach(el => {
      el.addEventListener('click', () => {
        const btn = el as HTMLButtonElement;
        const current = Number(btn.dataset.priority) as WorkPriority;
        const next = (current === 1 ? 2 : current === 2 ? 3 : current === 3 ? 4 : current === 4 ? 0 : 1) as WorkPriority;
        this.callbacks.onSetPriority(
          Number(btn.dataset.entity),
          btn.dataset.job as WorkJobKey,
          next,
        );
      });
    });
  }
}
