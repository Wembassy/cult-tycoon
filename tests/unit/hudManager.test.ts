// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { HUDManager, ResourceBarData, BuildPanelEntry, InspectorData } from '@ui/HUDManager';

function mockContainer(): HTMLElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

describe('HUDManager — Resource Bar', () => {
  let hud: HUDManager;
  let container: HTMLElement;

  beforeEach(() => {
    container = mockContainer();
    hud = new HUDManager({ container });
  });

  it('should create HUD elements on init', () => {
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('should create the Alpha HUD chrome', () => {
    expect(container.querySelector('.hud-menu-toggle')).not.toBeNull();
    expect(container.querySelector('.hud-management-menu')).not.toBeNull();
    expect(container.querySelector('.hud-minimap')).not.toBeNull();
    expect(container.querySelector('.hud-build-version')?.textContent).toContain('ALPHA 7');
  });

  it('should update resource bar with stats', () => {
    const data: ResourceBarData = {
      influence: 100, wealth: 250, notoriety: 15,
      faith: 80, morale: 75, materials: 30, food: 50, population: 8, maxPopulation: 15,
    };
    hud.updateResourceBar(data);
    const bar = container.querySelector('.hud-resource-bar');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('100');
    expect(bar!.textContent).toContain('250');
    expect(bar!.textContent).toContain('8/15');
  });
});

describe('HUDManager — Build Panel', () => {
  let hud: HUDManager;
  let container: HTMLElement;

  beforeEach(() => {
    container = mockContainer();
    hud = new HUDManager({ container });
  });

  it('should populate build panel', () => {
    const entries: BuildPanelEntry[] = [
      { id: 'wall', label: 'Wall', icon: '🧱', cost: 5, category: 'walls' },
      { id: 'floor', label: 'Floor', icon: '⬜', cost: 2, category: 'floors' },
    ];
    hud.setBuildPanel(entries);
    const panel = container.querySelector('.hud-build-panel');
    expect(panel).not.toBeNull();
    expect(panel!.querySelectorAll('.hud-build-entry').length).toBe(2);
  });
});

describe('HUDManager — Inspector', () => {
  let hud: HUDManager;
  let container: HTMLElement;

  beforeEach(() => {
    container = mockContainer();
    hud = new HUDManager({ container });
  });

  it('should show inspector with follower data', () => {
    const data: InspectorData = {
      name: 'Alice', role: 'Follower', health: 90,
      needs: { hunger: 60, faith: 80, fun: 70, sanity: 85, energy: 75, bladder: 80, hygiene: 70 },
      job: 'cleaning', traits: ['zealous', 'hardy'],
    };
    hud.showInspector(data);
    const inspector = container.querySelector('.hud-inspector');
    expect(inspector).not.toBeNull();
    expect(inspector!.textContent).toContain('Alice');
    expect(inspector!.textContent).toContain('zealous');
  });

  it('should hide inspector', () => {
    const data: InspectorData = {
      name: 'Bob', role: 'Follower', health: 100,
      needs: { hunger: 100, faith: 100, fun: 100, sanity: 100, energy: 100, bladder: 100, hygiene: 100 },
      job: 'idle', traits: [],
    };
    hud.showInspector(data);
    hud.hideInspector();
    const inspector = container.querySelector('.hud-inspector') as HTMLElement;
    expect(inspector.style.display).toBe('none');
  });
});

describe('HUDManager — Event Log', () => {
  let hud: HUDManager;
  let container: HTMLElement;

  beforeEach(() => {
    container = mockContainer();
    hud = new HUDManager({ container });
  });

  it('should log events', () => {
    hud.logEvent('Test event', 'info');
    hud.logEvent('Warning event', 'warning');
    expect(hud.getEventLog()).toHaveLength(2);
  });

  it('should render events in DOM', () => {
    hud.logEvent('Test event', 'info');
    const log = container.querySelector('.hud-event-log');
    expect(log).not.toBeNull();
    expect(log!.querySelectorAll('.hud-log-entry').length).toBe(1);
  });

  it('should limit log entries to max', () => {
    for (let i = 0; i < 25; i++) {
      hud.logEvent(`Event ${i}`, 'info');
    }
    expect(hud.getEventLog().length).toBeLessThanOrEqual(20);
  });

  it('should clear event log', () => {
    hud.logEvent('Test', 'info');
    hud.clearEventLog();
    expect(hud.getEventLog()).toHaveLength(0);
  });
});

describe('HUDManager — Time Controls', () => {
  let hud: HUDManager;
  let container: HTMLElement;

  beforeEach(() => {
    container = mockContainer();
    hud = new HUDManager({ container });
  });

  it('should default to 1x speed', () => {
    expect(hud.timeMode).toBe('speed1');
  });


  it('should render pause, 1x, 2x and 3x speed controls with a clock', () => {
    hud.updateTime(6.5, 2);
    const controls = container.querySelector('.hud-time-controls')!;
    expect(controls.textContent).toContain('Day 2');
    expect(controls.textContent).toContain('06:30');
    expect(controls.querySelector('[data-mode="pause"]')).not.toBeNull();
    expect(controls.querySelector('[data-mode="speed1"]')).not.toBeNull();
    expect(controls.querySelector('[data-mode="speed2"]')).not.toBeNull();
    expect(controls.querySelector('[data-mode="speed3"]')).not.toBeNull();
  });

  it('should set time mode', () => {
    hud.setTimeMode('pause');
    expect(hud.timeMode).toBe('pause');
  });


  it('should keep the same speed button nodes while the clock updates', () => {
    const before = container.querySelector('[data-mode="speed2"]');
    hud.updateTime(6.25, 1);
    hud.updateTime(6.5, 1);
    const after = container.querySelector('[data-mode="speed2"]');
    expect(after).toBe(before);
  });

  it('should dispatch clicks from persistent speed buttons', () => {
    const modes: string[] = [];
    hud.onTimeModeChange = (mode) => modes.push(mode);
    const button = container.querySelector('[data-mode="speed3"]') as HTMLButtonElement;
    button.click();
    expect(modes).toEqual(['speed3']);
  });

  it('should update time display', () => {
    hud.updateTime(14, 3);
    expect(hud.currentHour).toBe(14);
    expect(hud.currentDay).toBe(3);
    const tc = container.querySelector('.hud-time-controls');
    expect(tc!.textContent).toContain('Day 3');
  });
});

describe('HUDManager — Destroy', () => {
  it('should clean up DOM on destroy', () => {
    const container = mockContainer();
    const hud = new HUDManager({ container });
    hud.logEvent('test', 'info');
    hud.destroy();
    expect(container.innerHTML).toBe('');
  });
});