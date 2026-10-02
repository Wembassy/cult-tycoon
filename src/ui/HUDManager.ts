/**
 * HUDManager — Manages DOM-based HUD elements for the game UI.
 * Resource bar, build panel, inspector, event log, time controls,
 * tech tree, mission, and schedule panels.
 * Uses vanilla DOM + CSS (no framework dependency).
 */

import { TechTreePanel, TechTreePanelData } from './TechTreePanel';
import { MissionPanel, MissionPanelData } from './MissionPanel';
import { SchedulePanel, SchedulePanelData } from './SchedulePanel';

export interface HUDConfig {
  container: HTMLElement;
}

export interface ResourceBarData {
  influence: number;
  wealth: number;
  notoriety: number;
  faith: number;
  morale: number;
  population: number;
  maxPopulation: number;
}

export interface BuildPanelEntry {
  id: string;
  label: string;
  icon: string;
  cost: number;
  category: 'walls' | 'floors' | 'objects' | 'rooms' | 'ritual' | 'demolish' | 'structure' | 'decor';
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
  needs: { hunger: number; faith: number; fun: number; sanity: number; energy: number; bladder: number; hygiene: number };
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
  private techTreePanel: TechTreePanel | null = null;
  private missionPanel: MissionPanel | null = null;
  private schedulePanel: SchedulePanel | null = null;
  private eventLogEntries: EventLogEntry[] = [];
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

  constructor(config: HUDConfig) {
    this.container = config.container;
    this.setupDOM();
  }

  private setupDOM(): void {
    this.container.innerHTML = '';
    this.container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:sans-serif;';

    this.resourceBar = this.createElement('div', 'hud-resource-bar');
    this.buildBar = this.createElement('div', 'hud-build-bar');
    this.buildItems = this.createElement('div', 'hud-build-items');
    this.buildPanel = this.createElement('div', 'hud-build-panel');
    this.inspector = this.createElement('div', 'hud-inspector');
    this.eventLog = this.createElement('div', 'hud-event-log');
    this.timeControls = this.createElement('div', 'hud-time-controls');
    this.topBar = this.createElement('div', 'hud-top-bar');

    this.container.appendChild(this.resourceBar);
    this.container.appendChild(this.topBar);
    this.container.appendChild(this.buildItems);
    this.container.appendChild(this.buildBar);
    this.container.appendChild(this.buildPanel);
    this.container.appendChild(this.inspector);
    this.container.appendChild(this.eventLog);
    this.container.appendChild(this.timeControls);

    // Build items panel hidden by default
    this.buildItems.style.display = 'none';

    // Create and mount panels
    this.techTreePanel = new TechTreePanel({
      onUnlock: (techId: string) => this.onTechTreeUnlock?.(techId),
      onClose: () => this.hideTechTreePanel(),
    });
    this.techTreePanel.mount();

    this.missionPanel = new MissionPanel({
      onSendMission: (templateId: string, cultistIds: number[]) => this.onSendMission?.(templateId, cultistIds),
      onClose: () => this.hideMissionPanel(),
    });
    this.missionPanel.mount();

    this.schedulePanel = new SchedulePanel({
      onAssignShift: (entityId: number, shift: 'morning' | 'afternoon' | 'night') => this.onAssignShift?.(entityId, shift),
      onAutoAssign: () => this.onAutoAssignShifts?.(),
      onClose: () => this.hideSchedulePanel(),
    });
    this.schedulePanel.mount();

    this.setupTopBar();
    this.injectTopBarStyles();
  }

  private setupTopBar(): void {
    if (!this.topBar) return;
    this.topBar.innerHTML = `
      <button class="hud-top-btn" data-panel="techtree" title="Tech Tree (T)">🔬 Tech Tree</button>
      <button class="hud-top-btn" data-panel="missions" title="Missions">🎯 Missions</button>
      <button class="hud-top-btn" data-panel="schedule" title="Schedule">📅 Schedule</button>
    `;
    this.topBar.querySelectorAll('.hud-top-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const panel = (e.currentTarget as HTMLElement).dataset.panel;
        switch (panel) {
          case 'techtree': this.toggleTechTreePanel(); break;
          case 'missions': this.toggleMissionPanel(); break;
          case 'schedule': this.toggleSchedulePanel(); break;
        }
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
        gap: 4px;
        padding: 6px 8px;
        background-image: url('/assets/ui/scifi_panel_slanted.png'), linear-gradient(180deg, rgba(20,28,45,0.95), rgba(15,22,38,0.98));
        background-size: 100% 100%, 100% 100%;
        background-repeat: no-repeat;
        border: 1px solid rgba(80, 120, 180, 0.5);
        border-radius: 6px;
        pointer-events: auto;
        backdrop-filter: blur(10px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(120,160,220,0.15);
        z-index: 10;
        image-rendering: pixelated;
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

  private updateTopBarActive(): void {
    if (!this.topBar) return;
    this.topBar.querySelectorAll('.hud-top-btn').forEach(btn => {
      const panel = (btn as HTMLElement).dataset.panel;
      let isActive = false;
      switch (panel) {
        case 'techtree': isActive = this.techTreePanel?.isVisible ?? false; break;
        case 'missions': isActive = this.missionPanel?.isVisible ?? false; break;
        case 'schedule': isActive = this.schedulePanel?.isVisible ?? false; break;
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
    return `<img src="/assets/ui/${icon}.png" class="${className}" alt="${fallback}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline';" /><span style="display:none;font-size:14px;line-height:20px;">${fallback}</span>`;
  }

  /**
   * Update the resource bar with current cult stats.
   * Uses Synty SciFi sprite icons and bar sprites.
   */
  updateResourceBar(data: ResourceBarData): void {
    if (!this.resourceBar) return;
    const stats = [
      { label: 'Influence', value: Math.floor(data.influence), icon: 'scifi_icon_faith', fallback: '🔮', barColor: '#a855f7', max: null },
      { label: 'Wealth', value: Math.floor(data.wealth), icon: 'icon_wealth', fallback: '💰', barColor: '#fbbf24', max: null },
      { label: 'Notoriety', value: Math.floor(data.notoriety), icon: 'scifi_icon_shield', fallback: '🛡️', barColor: '#ef4444', max: 100 },
      { label: 'Faith', value: Math.floor(data.faith), icon: 'scifi_icon_health', fallback: '❤️', barColor: '#3b82f6', max: 100 },
      { label: 'Morale', value: Math.floor(data.morale), icon: 'scifi_icon_morale', fallback: '😊', barColor: '#10b981', max: 100 },
      { label: 'Pop', value: `${data.population}/${data.maxPopulation}`, icon: 'scifi_icon_hunger', fallback: '👥', barColor: '#f97316', max: null },
    ];
    this.resourceBar.innerHTML = stats.map(s => {
      return `
        <div class="hud-stat" title="${s.label}">
          ${this.iconHtml(s.icon, s.fallback)}
          <span class="hud-stat-value" style="color:${s.barColor};">${s.label}: ${s.value}${s.max !== null ? '/100' : ''}</span>
          ${s.max !== null ? `<div class="hud-stat-bar"><div class="hud-stat-bar-fill" style="width:${Math.min(100, typeof s.value === 'number' ? s.value : 0)}%;background:${s.barColor};"></div></div>` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Set the build category bar (bottom horizontal bar).
   */
  setBuildCategories(categories: BuildCategory[]): void {
    if (!this.buildBar) return;
    this.buildBar.innerHTML = categories.map(c =>
      `<div class="hud-build-cat ${c.id === this._activeCategoryId ? 'active' : ''}" data-cat="${c.id}" title="${c.label}">
        <span class="hud-build-cat-icon">${c.icon}</span>
        <span class="hud-build-cat-label">${c.label}</span>
      </div>`
    ).join('');
  }

  /**
   * Show build items for a selected category (grid panel above the bottom bar).
   */
  setBuildItems(entries: BuildPanelEntry[], categoryId: string): void {
    if (!this.buildItems) return;
    this._activeCategoryId = categoryId;
    this.buildItems.style.display = 'block';
    this.buildItems.innerHTML = entries.map(e =>
      `<div class="hud-build-item" data-id="${e.id}" data-cost="${e.cost}" title="${e.label} (${e.cost}g)">
        <span class="hud-build-item-icon">${e.icon}</span>
        <span class="hud-build-item-label">${e.label}</span>
        <span class="hud-build-item-cost">${e.cost}g</span>
      </div>`
    ).join('');
    // Refresh category bar active state
    if (this.buildBar) {
      this.buildBar.querySelectorAll('.hud-build-cat').forEach(el => {
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
      this.buildBar.querySelectorAll('.hud-build-cat').forEach(el => el.classList.remove('active'));
    }
  }

  /**
   * Highlight a selected build item.
   */
  highlightBuildItem(itemId: string | null): void {
    if (!this.buildItems) return;
    this.buildItems.querySelectorAll('.hud-build-item').forEach(el => {
      el.classList.toggle('selected', el.getAttribute('data-id') === itemId);
    });
  }

  /**
   * Legacy: Populate the build panel with available build options
   */
  setBuildPanel(entries: BuildPanelEntry[]): void {
    if (!this.buildPanel) return;
    this.buildPanel.innerHTML = entries.map(e =>
      `<div class="hud-build-entry" data-id="${e.id}" data-cost="${e.cost}">
        <span class="hud-build-icon">${e.icon}</span>
        <span class="hud-build-label">${e.label}</span>
        <span class="hud-build-cost">${e.cost}g</span>
      </div>`
    ).join('');
  }

  /**
   * Show inspector for a selected entity/follower
   */
  showInspector(data: InspectorData): void {
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
    const needsHtml = Object.entries(data.needs).map(([key, val]) => {
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
    }).join('');
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
    this.eventLog.innerHTML = this.eventLogEntries
      .map(e => `<div class="hud-log-entry hud-log-${e.type}">${e.text}</div>`)
      .join('');
  }

  /**
   * Clear the event log
   */
  clearEventLog(): void {
    this.eventLogEntries = [];
    this.renderEventLog();
  }

  /**
   * Set time control mode
   */
  setTimeMode(mode: TimeControlMode): void {
    this._timeMode = mode;
    if (!this.timeControls) return;
    const modes: TimeControlMode[] = ['pause', 'play', 'fast'];
    this.timeControls.innerHTML = modes.map(m =>
      `<button class="hud-time-btn ${m === mode ? 'active' : ''}" data-mode="${m}">${m}</button>`
    ).join('');
  }

  /**
   * Update the time display
   */
  updateTime(hour: number, day: number): void {
    this._currentTime = hour;
    this._currentDay = day;
    if (!this.timeControls) return;
    const timeStr = `Day ${day}, ${Math.floor(hour).toString().padStart(2, '0')}:00`;
    this.timeControls.innerHTML = `<span class="hud-time">${timeStr}</span>`;
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
    this.container.innerHTML = '';
    this.resourceBar = null;
    this.buildBar = null;
    this.buildItems = null;
    this.buildPanel = null;
    this.inspector = null;
    this.eventLog = null;
    this.timeControls = null;
    this.topBar = null;
    this.eventLogEntries = [];
  }
}