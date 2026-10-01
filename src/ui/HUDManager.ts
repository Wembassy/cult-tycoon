/**
 * HUDManager — Manages DOM-based HUD elements for the game UI.
 * Resource bar, build panel, inspector, event log, time controls.
 * Uses vanilla DOM + CSS (no framework dependency).
 */

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
  category: 'walls' | 'floors' | 'objects' | 'rooms' | 'ritual' | 'demolish' | 'structure';
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
  private eventLogEntries: EventLogEntry[] = [];
  private nextEventId = 1;
  private maxLogEntries = 20;
  private _timeMode: TimeControlMode = 'play';
  private _currentTime = 0;
  private _currentDay = 1;
  private _activeCategoryId: string | null = null;

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

    this.container.appendChild(this.resourceBar);
    this.container.appendChild(this.buildItems);
    this.container.appendChild(this.buildBar);
    this.container.appendChild(this.buildPanel);
    this.container.appendChild(this.inspector);
    this.container.appendChild(this.eventLog);
    this.container.appendChild(this.timeControls);

    // Build items panel hidden by default
    this.buildItems.style.display = 'none';
  }

  private createElement(tag: string, className: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    el.style.pointerEvents = 'auto';
    return el;
  }

  /**
   * Update the resource bar with current cult stats.
   * Uses Synty SciFi sprite icons and bar sprites.
   */
  updateResourceBar(data: ResourceBarData): void {
    if (!this.resourceBar) return;
    const stats = [
      { label: 'Influence', value: Math.floor(data.influence), icon: 'scifi_icon_faith', barColor: '#a855f7', max: null },
      { label: 'Wealth', value: Math.floor(data.wealth), icon: 'icon_wealth', barColor: '#fbbf24', max: null },
      { label: 'Notoriety', value: Math.floor(data.notoriety), icon: 'scifi_icon_shield', barColor: '#ef4444', max: 100 },
      { label: 'Faith', value: Math.floor(data.faith), icon: 'scifi_icon_health', barColor: '#3b82f6', max: 100 },
      { label: 'Morale', value: Math.floor(data.morale), icon: 'scifi_icon_morale', barColor: '#10b981', max: 100 },
      { label: 'Pop', value: `${data.population}/${data.maxPopulation}`, icon: 'scifi_icon_hunger', barColor: '#f97316', max: null },
    ];
    this.resourceBar.innerHTML = stats.map(s => {
      return `
        <div class="hud-stat" title="${s.label}">
          <img src="/assets/ui/${s.icon}.png" class="hud-stat-icon" alt="${s.label}" />
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
    const needIcons: Record<string, string> = {
      hunger: 'scifi_icon_hunger',
      faith: 'scifi_icon_faith',
      fun: 'scifi_icon_morale',
      sanity: 'scifi_icon_health',
      energy: 'scifi_icon_energy',
      bladder: 'scifi_icon_thirst',
      hygiene: 'scifi_icon_clean',
    };
    const needsHtml = Object.entries(data.needs).map(([key, val]) => {
      const icon = needIcons[key] || 'scifi_icon_health';
      const pct = Math.min(100, Math.floor(val));
      return `
        <div class="hud-inspector-need-row">
          <img src="/assets/ui/${icon}.png" class="hud-need-icon" alt="${key}" />
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
        <img src="/assets/ui/scifi_icon_health.png" class="hud-need-icon" alt="HP" />
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
    this.container.innerHTML = '';
    this.resourceBar = null;
    this.buildBar = null;
    this.buildItems = null;
    this.buildPanel = null;
    this.inspector = null;
    this.eventLog = null;
    this.timeControls = null;
    this.eventLogEntries = [];
  }
}