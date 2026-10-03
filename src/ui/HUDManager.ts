import buildInfo from '../../package.json';
/**
 * HUDManager — Manages DOM-based HUD elements for the game UI.
 * Resource bar, build panel, inspector, event log, time controls,
 * tech tree, mission, and schedule panels.
 * Uses vanilla DOM + CSS (no framework dependency).
 */

import { TechTreePanel, TechTreePanelData } from './TechTreePanel';
import { MissionPanel, MissionPanelData } from './MissionPanel';
import { SchedulePanel, SchedulePanelData } from './SchedulePanel';
import { WorkPanel, WorkPanelData, type WorkJobKey } from './WorkPanel';
import type { WorkPriority, WorkRole } from '../components/WorkPreferences';

export interface HUDConfig {
  container: HTMLElement;
}

export interface ResourceBarData {
  food?: number;
  influence: number;
  wealth: number;
  notoriety: number;
  faith: number;
  morale: number;
  population: number;
  maxPopulation: number;
}

export interface MinimapData {
  width: number;
  height: number;
  tiles: {
    x: number;
    y: number;
    terrain: 'grass' | 'dirt' | 'stone' | 'water';
    explored: boolean;
  }[];
  followers: { x: number; y: number }[];
  objects: { x: number; y: number }[];
  rooms: { tiles: { x: number; y: number }[] }[];
}

export interface BuildPanelEntry {
  id: string;
  label: string;
  icon: string;
  cost: number;
  category:
    'walls' | 'floors' | 'objects' | 'rooms' | 'ritual' | 'demolish' | 'structure' | 'decor';
}

export interface BuildCategory {
  id: string;
  label: string;
  icon: string;
}

export interface InspectorData {
  name: string;
  role: string;
  health: number;
  needs: {
    hunger: number;
    faith: number;
    fun: number;
    sanity: number;
    energy: number;
    bladder: number;
    hygiene: number;
  };
  job: string;
  traits: string[];
}

export interface EventLogEntry {
  id: number;
  text: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  timestamp: number;
}

export type TimeControlMode = 'pause' | 'play' | 'fast';

export class HUDManager {
  private container: HTMLElement;
  private resourceBar: HTMLElement | null = null;
  private buildPanel: HTMLElement | null = null;
  private buildBar: HTMLElement | null = null;
  private buildItems: HTMLElement | null = null;
  private inspector: HTMLElement | null = null;
  private eventLog: HTMLElement | null = null;
  private timeControls: HTMLElement | null = null;
  private topBar: HTMLElement | null = null;
  private objectiveStrip: HTMLElement | null = null;
  private minimap: HTMLCanvasElement | null = null;
  private managementMenuOpen = false;
  private mapSize = { width: 64, height: 64 };
  private buildHint: HTMLElement | null = null;
  private loading: HTMLElement | null = null;
  private lastRoomSignature = '';
  onMinimapNavigate?: (x: number, y: number) => void;
  onSelectBuildObject?: (id: string) => void;
  onOpenSettings?: () => void;
  private techTreePanel: TechTreePanel | null = null;
  private missionPanel: MissionPanel | null = null;
  private schedulePanel: SchedulePanel | null = null;
  private workPanel: WorkPanel | null = null;
  private eventLogEntries: EventLogEntry[] = [];
  private eventLogCollapsed = true;
  private nextEventId = 1;
  private maxLogEntries = 20;
  private _timeMode: TimeControlMode = 'play';
  private _currentTime = 0;
  private _currentDay = 1;
  private _activeCategoryId: string | null = null;

  /** Callbacks for panel actions. */
  onTechTreeUnlock?: (techId: string) => void;
  onSendMission?: (templateId: string, cultistIds: number[]) => void;
  onAssignShift?: (entityId: number, shift: 'morning' | 'afternoon' | 'night') => void;
  onAutoAssignShifts?: () => void;
  onOpenTechTree?: () => void;
  onOpenMissions?: () => void;
  onOpenSchedule?: () => void;
  onOpenRituals?: () => void;
  onOpenWork?: () => void;
  onSetWorkRole?: (entityId: number, role: WorkRole) => void;
  onSetWorkPriority?: (entityId: number, job: WorkJobKey, priority: WorkPriority) => void;
  onAutoAssignWorkRoles?: () => void;

  constructor(config: HUDConfig) {
    this.container = config.container;
    this.setupDOM();
  }

  private setupDOM(): void {
    this.container.innerHTML = '';
    this.container.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:sans-serif;';

    this.resourceBar = this.createElement('div', 'hud-resource-bar');
    this.buildBar = this.createElement('div', 'hud-build-bar');
    this.buildItems = this.createElement('div', 'hud-build-items');
    this.buildPanel = this.createElement('div', 'hud-build-panel');
    this.inspector = this.createElement('div', 'hud-inspector');
    this.eventLog = this.createElement('div', 'hud-event-log');
    this.timeControls = this.createElement('div', 'hud-time-controls');
    this.topBar = this.createElement('div', 'hud-top-bar');
    this.objectiveStrip = this.createElement('div', 'hud-objective-strip');
    const buildBadge = this.createElement('div', 'hud-build-version');
    buildBadge.textContent = `v${buildInfo.version}`;

    this.minimap = document.createElement('canvas');
    this.minimap.className = 'hud-minimap';
    this.minimap.width = 180;
    this.minimap.height = 180;
    this.minimap.title = 'Compound map - click to move the camera';
    this.minimap.addEventListener('click', (event) => {
      const r = this.minimap!.getBoundingClientRect();
      this.onMinimapNavigate?.(
        ((event.clientX - r.left) / r.width) * this.mapSize.width,
        ((event.clientY - r.top) / r.height) * this.mapSize.height,
      );
    });
    this.buildHint = this.createElement('div', 'hud-build-hint');
    this.container.appendChild(this.buildHint);
    this.inspector.addEventListener('click', (event) => {
      const id = (event.target as HTMLElement).closest<HTMLElement>('[data-build-object]')?.dataset
        .buildObject;
      if (id) this.onSelectBuildObject?.(id);
      if ((event.target as HTMLElement).closest('.hud-inspector-close')) this.hideInspector();
    });

    this.container.appendChild(this.resourceBar);
    this.container.appendChild(this.topBar);
    this.container.appendChild(this.objectiveStrip);
    this.container.appendChild(this.minimap);
    this.container.appendChild(buildBadge);
    this.container.appendChild(this.buildItems);
    this.container.appendChild(this.buildBar);
    this.container.appendChild(this.buildPanel);
    this.container.appendChild(this.inspector);
    this.container.appendChild(this.eventLog);
    this.container.appendChild(this.timeControls);

    this.eventLog.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.hud-log-toggle')) {
        this.eventLogCollapsed = !this.eventLogCollapsed;
        this.renderEventLog();
      }
    });
    this.renderEventLog();

    // Build items panel hidden by default
    this.buildItems.style.display = 'none';

    // Create and mount panels
    this.techTreePanel = new TechTreePanel({
      onUnlock: (techId: string) => this.onTechTreeUnlock?.(techId),
      onClose: () => this.hideTechTreePanel(),
    });
    this.techTreePanel.mount();

    this.missionPanel = new MissionPanel({
      onSendMission: (templateId: string, cultistIds: number[]) =>
        this.onSendMission?.(templateId, cultistIds),
      onClose: () => this.hideMissionPanel(),
    });
    this.missionPanel.mount();

    this.schedulePanel = new SchedulePanel({
      onAssignShift: (entityId: number, shift: 'morning' | 'afternoon' | 'night') =>
        this.onAssignShift?.(entityId, shift),
      onAutoAssign: () => this.onAutoAssignShifts?.(),
      onClose: () => this.hideSchedulePanel(),
    });
    this.schedulePanel.mount();

    this.workPanel = new WorkPanel({
      onSetRole: (entityId, role) => this.onSetWorkRole?.(entityId, role),
      onSetPriority: (entityId, job, priority) => this.onSetWorkPriority?.(entityId, job, priority),
      onAutoAssign: () => this.onAutoAssignWorkRoles?.(),
      onClose: () => this.hideWorkPanel(),
    });
    this.workPanel.mount();

    this.setupTopBar();
    this.injectTopBarStyles();
    this.setObjective(
      'Establish the compound',
      'Build basic shelter, inspect your followers, then choose your first research or mission.',
    );
    this.renderTimeControls();
  }

  private setupTopBar(): void {
    if (!this.topBar) return;
    this.topBar.innerHTML = `
      <button class="hud-menu-toggle" type="button" title="Management menu" aria-label="Open management menu" aria-expanded="false">☰</button>
      <div class="hud-management-menu">
        <button class="hud-top-btn" data-panel="techtree" title="Tech Tree (T)">🔬 Tech Tree</button>
        <button class="hud-top-btn" data-panel="missions" title="Missions (M)">🎯 Missions</button>
        <button class="hud-top-btn" data-panel="work" title="Roles & Work (J)">👥 Work</button>
        <button class="hud-top-btn" data-panel="schedule" title="Schedule">📅 Schedule</button>
        <button class="hud-top-btn" data-panel="settings">Settings / Save</button>
        <button class="hud-top-btn" data-panel="rituals" title="Rituals (R)">🔮 Rituals</button>
      </div>
    `;

    const toggle = this.topBar.querySelector('.hud-menu-toggle');
    toggle?.addEventListener('click', () => {
      this.managementMenuOpen = !this.managementMenuOpen;
      this.topBar?.classList.toggle('menu-open', this.managementMenuOpen);
      toggle?.setAttribute('aria-expanded', String(this.managementMenuOpen));
    });

    this.topBar.querySelectorAll('.hud-top-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const panel = (e.currentTarget as HTMLElement).dataset.panel;
        switch (panel) {
          case 'settings':
            this.onOpenSettings?.();
            break;
          case 'techtree':
            if (this.onOpenTechTree) this.onOpenTechTree();
            else this.toggleTechTreePanel();
            break;
          case 'missions':
            if (this.onOpenMissions) this.onOpenMissions();
            else this.toggleMissionPanel();
            break;
          case 'work':
            if (this.onOpenWork) this.onOpenWork();
            break;
          case 'schedule':
            if (this.onOpenSchedule) this.onOpenSchedule();
            else this.toggleSchedulePanel();
            break;
          case 'rituals':
            if (this.onOpenRituals) this.onOpenRituals();
            break;
        }
        this.managementMenuOpen = false;
        this.topBar?.classList.remove('menu-open');
      });
    });
  }

  private injectTopBarStyles(): void {
    if (document.getElementById('hud-top-bar-styles')) return;
    const style = document.createElement('style');
    style.id = 'hud-top-bar-styles';
    style.textContent = `
      .hud-top-bar {
        position: absolute;
        top: 8px;
        left: 8px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        padding: 6px;
        background: rgba(12, 18, 30, 0.88);
        border: 1px solid rgba(80, 120, 180, 0.5);
        border-radius: 6px;
        pointer-events: auto;
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(120,160,220,0.15);
        z-index: 10;
      }
      .hud-menu-toggle {
        width: 38px;
        height: 34px;
        border: 1px solid rgba(100,150,220,0.35);
        border-radius: 5px;
        background: rgba(0,0,0,0.25);
        color: #dbeafe;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
      }
      .hud-menu-toggle:hover {
        background: rgba(50,80,130,0.5);
      }
      .hud-management-menu {
        display: none;
        flex-direction: column;
        gap: 4px;
        min-width: 150px;
      }
      .hud-top-bar.menu-open .hud-management-menu {
        display: flex;
      }
      .hud-top-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #a0b8d8;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid transparent;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .hud-top-btn:hover {
        background: rgba(50, 80, 130, 0.5);
        border-color: rgba(100, 150, 220, 0.3);
        color: #e0f0ff;
      }
      .hud-top-btn.active {
        background: rgba(168, 85, 247, 0.3);
        border-color: rgba(168, 85, 247, 0.5);
        color: #fff;
        box-shadow: 0 0 10px rgba(168, 85, 247, 0.25);
      }

      .hud-build-version {
        position: absolute;
        top: 194px;
        right: 10px;
        padding: 3px 7px;
        border-radius: 4px;
        background: rgba(8,12,20,0.84);
        border: 1px solid rgba(100,150,220,0.3);
        color: #94a3b8;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.8px;
        pointer-events: none;
        z-index: 9;
      }

      .hud-minimap {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 180px;
        height: 180px;
        background: rgba(8,12,20,0.92);
        border: 1px solid rgba(100,150,220,0.42);
        border-radius: 6px;
        box-shadow: 0 2px 14px rgba(0,0,0,0.55);
        pointer-events: none;
        image-rendering: pixelated;
        z-index: 9;
      }

      .hud-objective-strip {
        position: absolute;
        top: 62px;
        left: 50%;
        transform: translateX(-50%);
        min-width: 340px;
        max-width: min(680px, 70vw);
        padding: 8px 14px;
        background: linear-gradient(180deg, rgba(18,24,38,0.94), rgba(10,14,24,0.96));
        border: 1px solid rgba(100,150,220,0.35);
        border-radius: 7px;
        box-shadow: 0 2px 14px rgba(0,0,0,0.45);
        text-align: center;
        pointer-events: none;
        z-index: 8;
      }
      .hud-objective-title {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: #dbeafe;
      }
      .hud-objective-detail {
        margin-top: 2px;
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.35;
      }

      @media (max-width: 1100px) {
        .hud-top-bar {
          max-width: calc(100vw - 16px);
        }
        .hud-top-btn {
          flex: 0 0 auto;
          padding: 6px 9px;
          font-size: 10px;
        }
        .hud-objective-strip {
          top: 56px;
          min-width: 0;
          width: min(620px, calc(100vw - 32px));
          max-width: none;
        }
      }

      @media (max-width: 760px) {
        .hud-top-btn {
          padding: 6px 9px;
          font-size: 10px;
        }
        .hud-minimap {
          width: 132px;
          height: 132px;
        }
        .hud-build-version {
          top: 146px;
        }
        .hud-objective-strip {
          top: 52px;
          padding: 6px 10px;
        }
        .hud-objective-detail {
          font-size: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Tech Tree Panel ──────────────────────────────────────

  toggleTechTreePanel(): void {
    if (!this.techTreePanel) return;
    if (this.techTreePanel.isVisible) {
      this.hideTechTreePanel();
    } else {
      this.techTreePanel.show({ unlockedIds: [], influence: 0, faith: 0 });
    }
    this.updateTopBarActive();
  }

  showTechTreePanel(data: TechTreePanelData): void {
    this.closeManagementPanels();
    if (!this.techTreePanel) return;
    this.techTreePanel.show(data);
    this.updateTopBarActive();
  }

  hideTechTreePanel(): void {
    this.techTreePanel?.hide();
    this.updateTopBarActive();
  }

  updateTechTreePanel(data: TechTreePanelData): void {
    this.techTreePanel?.update(data);
  }

  // ─── Mission Panel ────────────────────────────────────────

  toggleMissionPanel(): void {
    if (!this.missionPanel) return;
    if (this.missionPanel.isVisible) {
      this.hideMissionPanel();
    } else {
      this.missionPanel.show({ cultists: [], activeMissions: [] });
    }
    this.updateTopBarActive();
  }

  showMissionPanel(data: MissionPanelData): void {
    this.closeManagementPanels();
    if (!this.missionPanel) return;
    this.missionPanel.show(data);
    this.updateTopBarActive();
  }

  hideMissionPanel(): void {
    this.missionPanel?.hide();
    this.updateTopBarActive();
  }

  updateMissionPanel(data: MissionPanelData): void {
    this.missionPanel?.update(data);
  }

  // ─── Schedule Panel ───────────────────────────────────────

  toggleSchedulePanel(): void {
    if (!this.schedulePanel) return;
    if (this.schedulePanel.isVisible) {
      this.hideSchedulePanel();
    } else {
      this.schedulePanel.show({ cultists: [], currentHour: this._currentTime });
    }
    this.updateTopBarActive();
  }

  showSchedulePanel(data: SchedulePanelData): void {
    this.closeManagementPanels();
    if (!this.schedulePanel) return;
    this.schedulePanel.show(data);
    this.updateTopBarActive();
  }

  hideSchedulePanel(): void {
    this.schedulePanel?.hide();
    this.updateTopBarActive();
  }

  updateSchedulePanel(data: SchedulePanelData): void {
    this.schedulePanel?.update(data);
  }

  showWorkPanel(data: WorkPanelData): void {
    this.closeManagementPanels();
    this.workPanel?.show(data);
    this.updateTopBarActive();
  }

  updateWorkPanel(data: WorkPanelData): void {
    this.workPanel?.update(data);
  }

  hideWorkPanel(): void {
    this.workPanel?.hide();
    this.updateTopBarActive();
  }

  hasManagementPanel(): boolean {
    return !!(
      this.techTreePanel?.isVisible ||
      this.missionPanel?.isVisible ||
      this.schedulePanel?.isVisible ||
      this.workPanel?.isVisible
    );
  }
  closeManagementPanels(): boolean {
    const open = this.hasManagementPanel() || this.managementMenuOpen;
    this.techTreePanel?.hide();
    this.missionPanel?.hide();
    this.schedulePanel?.hide();
    this.workPanel?.hide();
    this.managementMenuOpen = false;
    this.topBar?.classList.remove('menu-open');
    this.topBar?.querySelector('.hud-menu-toggle')?.setAttribute('aria-expanded', 'false');
    this.updateTopBarActive();
    return open;
  }
  setBuildHint(text: string): void {
    if (this.buildHint) {
      this.buildHint.textContent = text;
      this.buildHint.hidden = !text;
    }
  }
  setLoading(visible: boolean): void {
    if (!visible) {
      this.loading?.remove();
      this.loading = null;
      return;
    }
    if (this.loading) return;
    this.loading = document.createElement('div');
    this.loading.className = 'quality-loading';
    this.loading.innerHTML =
      '<div><h1>Preparing your compound</h1><p>Loading characters, animations and the world...</p></div>';
    document.body.appendChild(this.loading);
  }
  showRoomInspector(
    name: string,
    area: number,
    status: { complete: boolean; checks: { label: string; met: boolean; objectId?: string }[] },
  ): void {
    if (!this.inspector) return;
    const signature = JSON.stringify([name, area, status]);
    if (signature === this.lastRoomSignature && this.inspector.style.display !== 'none') return;
    this.lastRoomSignature = signature;
    this.inspector.style.display = 'block';
    this.inspector.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = name;
    const close = document.createElement('button');
    close.className = 'hud-inspector-close';
    close.textContent = 'Close';
    this.inspector.append(title, close);
    const label = document.createElement('p');
    label.textContent = `${area} tiles / ${status.complete ? 'Operational' : 'Needs attention'}`;
    this.inspector.append(label);
    for (const check of status.checks) {
      const row = document.createElement('div');
      row.className = 'room-check';
      const text = document.createElement('span');
      text.textContent = `${check.met ? 'OK' : 'Missing'} - ${check.label}`;
      row.dataset.met = String(check.met);
      row.append(text);
      if (!check.met && check.objectId) {
        const b = document.createElement('button');
        b.dataset.buildObject = check.objectId;
        b.textContent = 'Place';
        row.append(b);
      }
      this.inspector.append(row);
    }
  }

  private updateTopBarActive(): void {
    if (!this.topBar) return;
    this.topBar.querySelectorAll('.hud-top-btn').forEach((btn) => {
      const panel = (btn as HTMLElement).dataset.panel;
      let isActive = false;
      switch (panel) {
        case 'techtree':
          isActive = this.techTreePanel?.isVisible ?? false;
          break;
        case 'missions':
          isActive = this.missionPanel?.isVisible ?? false;
          break;
        case 'work':
          isActive = this.workPanel?.isVisible ?? false;
          break;
        case 'schedule':
          isActive = this.schedulePanel?.isVisible ?? false;
          break;
      }
      btn.classList.toggle('active', isActive);
    });
  }

  private createElement(tag: string, className: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    el.style.pointerEvents = 'auto';
    return el;
  }

  /**
   * Generate HTML for an icon with fallback emoji if the image fails to load.
   */
  private iconHtml(icon: string, fallback: string, className: string = 'hud-stat-icon'): string {
    return `<img src="./assets/ui/${icon}.png" class="${className}" alt="${fallback}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline';" /><span style="display:none;font-size:14px;line-height:20px;">${fallback}</span>`;
  }

  /**
   * Update the resource bar with current cult stats.
   * Uses Synty SciFi sprite icons and bar sprites.
   */
  updateResourceBar(data: ResourceBarData): void {
    if (!this.resourceBar) return;
    const stats = [
      ['Coins', Math.floor(data.wealth), 'funds'],
      ['Food', Math.floor(data.food ?? 0), 'food'],
      ['Influence', Math.floor(data.influence), 'influence'],
      ['Faith', Math.floor(data.faith) + '%', 'faith'],
      ['Morale', Math.floor(data.morale) + '%', 'morale'],
      ['Heat', Math.floor(data.notoriety), 'heat'],
      ['People', `${data.population}/${data.maxPopulation}`, 'population'],
    ];
    if (!this.resourceBar.children.length)
      for (const [label, , key] of stats) {
        const stat = document.createElement('div');
        stat.className = 'quality-stat';
        stat.dataset.stat = String(key);
        const caption = document.createElement('span');
        caption.textContent = String(label);
        const value = document.createElement('strong');
        stat.append(caption, value);
        this.resourceBar.append(stat);
      }
    for (const [, value, key] of stats) {
      const el = this.resourceBar.querySelector<HTMLElement>(`[data-stat="${key}"]`);
      if (el) {
        el.querySelector('strong')!.textContent = String(value);
        el.classList.toggle(
          'warning',
          (key === 'food' && (data.food ?? 0) < 8) ||
            (key === 'heat' && data.notoriety >= 75) ||
            (key === 'funds' && data.wealth < 30),
        );
      }
    }
  }

  /**
   * Set the build category bar (bottom horizontal bar).
   */
  setBuildCategories(categories: BuildCategory[]): void {
    if (!this.buildBar) return;
    this.buildBar.innerHTML = categories
      .map(
        (c) =>
          `<button type="button" class="hud-build-cat ${c.id === this._activeCategoryId ? 'active' : ''}" data-cat="${c.id}" title="${c.label}">
        <span class="hud-build-cat-icon">${c.icon}</span>
        <span class="hud-build-cat-label">${c.label}</span>
      </button>`,
      )
      .join('');
  }

  /**
   * Show build items for a selected category (grid panel above the bottom bar).
   */
  setBuildItems(entries: BuildPanelEntry[], categoryId: string): void {
    if (!this.buildItems) return;
    this._activeCategoryId = categoryId;
    this.buildItems.style.display = 'flex';
    this.buildItems.innerHTML = entries
      .map(
        (e) =>
          `<button type="button" class="hud-build-item" data-id="${e.id}" data-cost="${e.cost}" title="${e.label} (${e.cost}g)">
        <span class="hud-build-item-icon">${e.icon}</span>
        <span class="hud-build-item-label">${e.label}</span>
        <span class="hud-build-item-cost">${e.cost === 0 ? 'Designate' : e.cost + ' coins'}</span>
      </button>`,
      )
      .join('');
    // Refresh category bar active state
    if (this.buildBar) {
      this.buildBar.querySelectorAll('.hud-build-cat').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-cat') === categoryId);
      });
    }
  }

  /**
   * Hide the build items panel.
   */
  hideBuildItems(): void {
    if (this.buildItems) this.buildItems.style.display = 'none';
    this._activeCategoryId = null;
    if (this.buildBar) {
      this.buildBar
        .querySelectorAll('.hud-build-cat')
        .forEach((el) => el.classList.remove('active'));
    }
  }

  /**
   * Highlight a selected build item.
   */
  highlightBuildItem(itemId: string | null): void {
    if (!this.buildItems) return;
    this.buildItems.querySelectorAll('.hud-build-item').forEach((el) => {
      el.classList.toggle('selected', el.getAttribute('data-id') === itemId);
    });
  }

  /**
   * Legacy: Populate the build panel with available build options
   */
  setBuildPanel(entries: BuildPanelEntry[]): void {
    if (!this.buildPanel) return;
    this.buildPanel.innerHTML = entries
      .map(
        (e) =>
          `<div class="hud-build-entry" data-id="${e.id}" data-cost="${e.cost}">
        <span class="hud-build-icon">${e.icon}</span>
        <span class="hud-build-label">${e.label}</span>
        <span class="hud-build-cost">${e.cost}g</span>
      </div>`,
      )
      .join('');
  }

  /**
   * Show inspector for a selected entity/follower
   */
  showInspector(data: InspectorData): void {
    this.lastRoomSignature = '';
    if (!this.inspector) return;
    this.inspector.style.display = 'block';
    const needIcons: Record<string, { icon: string; fallback: string }> = {
      hunger: { icon: 'scifi_icon_hunger', fallback: '🍖' },
      faith: { icon: 'scifi_icon_faith', fallback: '🔮' },
      fun: { icon: 'scifi_icon_morale', fallback: '🎮' },
      sanity: { icon: 'scifi_icon_health', fallback: '🧠' },
      energy: { icon: 'scifi_icon_energy', fallback: '⚡' },
      bladder: { icon: 'scifi_icon_thirst', fallback: '🚽' },
      hygiene: { icon: 'scifi_icon_clean', fallback: '🧼' },
    };
    const needsHtml = Object.entries(data.needs)
      .map(([key, val]) => {
        const { icon, fallback } = needIcons[key] || { icon: 'scifi_icon_health', fallback: '❓' };
        const pct = Math.min(100, Math.floor(val));
        return `
        <div class="hud-inspector-need-row">
          ${this.iconHtml(icon, fallback, 'hud-need-icon')}
          <span class="hud-need-label">${key.charAt(0).toUpperCase() + key.slice(1)}</span>
          <div class="hud-need-bar"><div class="hud-need-bar-fill" style="width:${pct}%;"></div></div>
          <span class="hud-need-value">${Math.floor(val)}/100</span>
        </div>
      `;
      })
      .join('');
    this.inspector.innerHTML = `
      <div class="hud-inspector-name">${data.name}</div>
      <div class="hud-inspector-role">${data.role}</div>
      <div class="hud-inspector-health">
        ${this.iconHtml('scifi_icon_health', '❤️', 'hud-need-icon')}
        <span>HP: ${data.health}/100</span>
        <div class="hud-need-bar"><div class="hud-need-bar-fill" style="width:${data.health}%;background:#ef4444;"></div></div>
      </div>
      <div class="hud-inspector-needs">${needsHtml}</div>
      <div class="hud-inspector-job">Job: ${data.job}</div>
      <div class="hud-inspector-traits">${data.traits.join(', ')}</div>
    `;
  }

  /**
   * Hide the inspector
   */
  hideInspector(): void {
    if (this.inspector) this.inspector.style.display = 'none';
  }

  /**
   * Add an event to the log
   */
  logEvent(text: string, type: EventLogEntry['type'] = 'info'): void {
    const entry: EventLogEntry = {
      id: this.nextEventId++,
      text,
      type,
      timestamp: Date.now(),
    };
    this.eventLogEntries.push(entry);
    if (this.eventLogEntries.length > this.maxLogEntries) {
      this.eventLogEntries.shift();
    }
    this.renderEventLog();
  }

  private renderEventLog(): void {
    if (!this.eventLog) return;
    this.eventLog.classList.toggle('collapsed', this.eventLogCollapsed);
    const entries = this.eventLogCollapsed
      ? ''
      : this.eventLogEntries
          .map((e) => `<div class="hud-log-entry hud-log-${e.type}">${e.text}</div>`)
          .join('');

    this.eventLog.innerHTML = `
      <div class="hud-log-header">
        <span class="hud-log-title">Activity</span>
        <button class="hud-log-toggle" type="button" title="${this.eventLogCollapsed ? 'Expand activity log' : 'Collapse activity log'}">
          ${this.eventLogCollapsed ? '▲' : '▼'}
        </button>
      </div>
      <div class="hud-log-body">${entries}</div>
    `;
  }

  /**
   * Clear the event log
   */
  clearEventLog(): void {
    this.eventLogEntries = [];
    this.renderEventLog();
  }

  /**
   * Set time control mode without replacing the clock.
   */
  setTimeMode(mode: TimeControlMode): void {
    this._timeMode = mode;
    this.renderTimeControls();
  }

  /**
   * Update the clock without replacing the controls.
   */
  updateTime(hour: number, day: number): void {
    this._currentTime = hour;
    this._currentDay = day;
    this.renderTimeControls();
  }

  private renderTimeControls(): void {
    if (!this.timeControls) return;
    if (!this.timeControls.querySelector('.hud-time')) {
      this.timeControls.innerHTML =
        '<span class="hud-time"></span><button class="hud-time-btn" data-mode="pause" title="Pause (Space)">Pause</button><button class="hud-time-btn" data-mode="play" title="Normal speed (1)">1x</button><button class="hud-time-btn" data-mode="fast" title="Fast speed (2)">3x</button>';
    }
    const hour = Math.floor(this._currentTime),
      minute = Math.floor((this._currentTime - hour) * 60);
    this.timeControls.querySelector('.hud-time')!.textContent =
      `Day ${this._currentDay} / ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    for (const b of this.timeControls.querySelectorAll<HTMLElement>('[data-mode]')) {
      b.classList.toggle('active', b.dataset.mode === this._timeMode);
      b.setAttribute('aria-pressed', String(b.dataset.mode === this._timeMode));
    }
  }

  updateMinimap(data: MinimapData): void {
    if (!this.minimap) return;
    this.mapSize = { width: data.width, height: data.height };
    const ctx = this.minimap.getContext('2d');
    if (!ctx || data.width <= 0 || data.height <= 0) return;

    const w = this.minimap.width;
    const h = this.minimap.height;
    const sx = w / data.width;
    const sy = h / data.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, w, h);

    const terrainColors: Record<string, string> = {
      grass: '#385c35',
      dirt: '#6d573a',
      stone: '#62666c',
      water: '#284d69',
    };

    for (const tile of data.tiles) {
      ctx.fillStyle = tile.explored ? (terrainColors[tile.terrain] ?? '#385c35') : '#111722';
      ctx.fillRect(tile.x * sx, tile.y * sy, Math.ceil(sx), Math.ceil(sy));
    }

    ctx.fillStyle = 'rgba(92, 146, 220, 0.32)';
    for (const room of data.rooms) {
      for (const tile of room.tiles) {
        ctx.fillRect(tile.x * sx, tile.y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }

    ctx.fillStyle = '#d6a84a';
    for (const obj of data.objects) {
      ctx.fillRect(obj.x * sx, obj.y * sy, Math.max(2, sx), Math.max(2, sy));
    }

    ctx.fillStyle = '#f8fafc';
    for (const follower of data.followers) {
      ctx.beginPath();
      ctx.arc(
        (follower.x + 0.5) * sx,
        (follower.y + 0.5) * sy,
        Math.max(1.5, sx * 0.8),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  setObjective(title: string, detail: string): void {
    if (!this.objectiveStrip) return;
    this.objectiveStrip.style.display = 'block';
    this.objectiveStrip.innerHTML = `<div class="hud-objective-title">Objective · ${title}</div><div class="hud-objective-detail">${detail}</div>`;
  }

  clearObjective(): void {
    if (this.objectiveStrip) this.objectiveStrip.style.display = 'none';
  }

  /**
   * Get current time mode
   */
  get timeMode(): TimeControlMode {
    return this._timeMode;
  }

  get currentHour(): number {
    return this._currentTime;
  }

  get currentDay(): number {
    return this._currentDay;
  }

  /**
   * Get all event log entries
   */
  getEventLog(): EventLogEntry[] {
    return [...this.eventLogEntries];
  }

  /**
   * Destroy the HUD and clean up DOM
   */
  destroy(): void {
    this.techTreePanel?.destroy();
    this.missionPanel?.destroy();
    this.schedulePanel?.destroy();
    this.workPanel?.destroy();
    this.container.innerHTML = '';
    this.resourceBar = null;
    this.buildBar = null;
    this.buildItems = null;
    this.buildPanel = null;
    this.inspector = null;
    this.eventLog = null;
    this.timeControls = null;
    this.topBar = null;
    this.objectiveStrip = null;
    this.minimap = null;
    this.eventLogEntries = [];
  }
}
