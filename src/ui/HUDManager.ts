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
  category: 'walls' | 'floors' | 'objects' | 'rooms';
}

export interface InspectorData {
  name: string;
  role: string;
  health: number;
  needs: { hunger: number; faith: number; fun: number; sanity: number };
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
  private inspector: HTMLElement | null = null;
  private eventLog: HTMLElement | null = null;
  private timeControls: HTMLElement | null = null;
  private eventLogEntries: EventLogEntry[] = [];
  private nextEventId = 1;
  private maxLogEntries = 20;
  private _timeMode: TimeControlMode = 'play';
  private _currentTime = 0;
  private _currentDay = 1;

  constructor(config: HUDConfig) {
    this.container = config.container;
    this.setupDOM();
  }

  private setupDOM(): void {
    this.container.innerHTML = '';
    this.container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;font-family:sans-serif;';

    this.resourceBar = this.createElement('div', 'hud-resource-bar');
    this.buildPanel = this.createElement('div', 'hud-build-panel');
    this.inspector = this.createElement('div', 'hud-inspector');
    this.eventLog = this.createElement('div', 'hud-event-log');
    this.timeControls = this.createElement('div', 'hud-time-controls');

    this.container.appendChild(this.resourceBar);
    this.container.appendChild(this.buildPanel);
    this.container.appendChild(this.inspector);
    this.container.appendChild(this.eventLog);
    this.container.appendChild(this.timeControls);
  }

  private createElement(tag: string, className: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    el.style.pointerEvents = 'auto';
    return el;
  }

  /**
   * Update the resource bar with current cult stats
   */
  updateResourceBar(data: ResourceBarData): void {
    if (!this.resourceBar) return;
    this.resourceBar.innerHTML = `
      <div class="hud-stat">Influence: ${Math.floor(data.influence)}</div>
      <div class="hud-stat">Wealth: ${Math.floor(data.wealth)}</div>
      <div class="hud-stat">Notoriety: ${Math.floor(data.notoriety)}</div>
      <div class="hud-stat">Faith: ${Math.floor(data.faith)}/100</div>
      <div class="hud-stat">Morale: ${Math.floor(data.morale)}/100</div>
      <div class="hud-stat">Pop: ${data.population}/${data.maxPopulation}</div>
    `;
  }

  /**
   * Populate the build panel with available build options
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
    this.inspector.innerHTML = `
      <div class="hud-inspector-name">${data.name}</div>
      <div class="hud-inspector-role">${data.role}</div>
      <div class="hud-inspector-health">HP: ${data.health}/100</div>
      <div class="hud-inspector-needs">
        <div>Hunger: ${Math.floor(data.needs.hunger)}/100</div>
        <div>Faith: ${Math.floor(data.needs.faith)}/100</div>
        <div>Fun: ${Math.floor(data.needs.fun)}/100</div>
        <div>Sanity: ${Math.floor(data.needs.sanity)}/100</div>
      </div>
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
    this.buildPanel = null;
    this.inspector = null;
    this.eventLog = null;
    this.timeControls = null;
    this.eventLogEntries = [];
  }
}