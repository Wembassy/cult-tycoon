/**
 * Cult Tycoon — Main entry point.
 * Wires together all engine systems into a playable game.
 */

import { Renderer } from './engine/Renderer';
import { SceneManager } from './engine/SceneManager';
import { InputManager } from './engine/InputManager';
import { AssetLoader } from './engine/AssetLoader';
import { TileMap } from './world/TileMap';
import { WorldGen } from './world/WorldGen';
import { Pathfinder } from './world/Pathfinder';
import { World } from './ecs/World';
import { System } from './ecs/System';
import { Needs } from './components/Needs';
import { FollowerAI } from './components/FollowerAI';
import { Transform } from './components/Transform';
import { Renderable } from './components/Renderable';
import { Health } from './components/Health';
import { Traits } from './components/Traits';
import { Job } from './components/Job';
import { NeedsSystem } from './systems/NeedsSystem';
import { JobSystem } from './systems/JobSystem';
import { AISystem } from './systems/AISystem';
import { BuildingSystem } from './systems/BuildingSystem';
import { RenderSystem } from './systems/RenderSystem';
import { FollowerFactory } from './systems/FollowerFactory';
import { EventSystem } from './systems/EventSystem';
import { RitualSystem } from './systems/RitualSystem';
import { TechTreeSystem } from './systems/TechTreeSystem';
import { DataManager } from './data/DataManager';
import { HUDManager, ResourceBarData, BuildPanelEntry } from './ui/HUDManager';

class CultTycoonGame {
  private renderer: Renderer;
  private sceneMgr: SceneManager;
  private input: InputManager;
  private hud: HUDManager;
  private assets: AssetLoader;
  private world: World;
  private map: TileMap;
  private pathfinder: Pathfinder;
  private buildingSystem: BuildingSystem;
  private needsSystem: NeedsSystem;
  private jobSystem: JobSystem;
  private aiSystem: AISystem;
  private renderSystem: RenderSystem;
  private eventSystem: EventSystem;
  private ritualSystem: RitualSystem;
  private techTree: TechTreeSystem;
  private factory: FollowerFactory;
  private systems: System[] = [];
  private lastTime = 0;
  private accumulator = 0;
  private readonly tickDuration = 1 / 30;
  private timeScale = 1;
  private running = true;

  // Game state
  private cultWealth = 100;
  private cultInfluence = 50;
  private cultNotoriety = 5;
  private currentHour = 6;
  private currentDay = 1;
  private tickCount = 0;
  private selectedBuildItem: string | null = null;
  private selectedEntity: number | null = null;
  private followerNames: Map<number, string> = new Map();
  private floatingTexts: { el: HTMLDivElement; life: number }[] = [];

  // Time control
  private timeMode: 'pause' | 'play' | 'fast' = 'play';

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas #game-canvas not found');
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';

    // Core engine
    this.renderer = new Renderer(canvas);
    this.world = new World();
    this.assets = new AssetLoader();

    // World generation — larger map for more building space
    const worldGen = new WorldGen(12345);
    this.map = worldGen.generate({ width: 32, height: 32, waterPools: 3, stonePatches: 4, dirtPatches: 5 });
    this.pathfinder = new Pathfinder(this.map);

    // Scene manager builds tile meshes
    this.sceneMgr = new SceneManager(this.renderer.threeScene, this.world, this.map, this.assets);
    this.sceneMgr.buildTiles();

    // Systems
    this.needsSystem = new NeedsSystem();
    this.jobSystem = new JobSystem();
    this.aiSystem = new AISystem(this.map, this.pathfinder);
    this.buildingSystem = new BuildingSystem(this.map);
    this.renderSystem = new RenderSystem(this.sceneMgr);
    this.factory = new FollowerFactory(42);

    // Event system
    this.eventSystem = new EventSystem(
      DataManager.getEvents() as any,
      12345,
      (event) => {
        this.hud.logEvent(event.description, event.type === 'positive' ? 'success' : event.type === 'danger' ? 'danger' : 'warning');
      },
    );

    // Tech tree
    this.techTree = new TechTreeSystem((node) => {
      this.hud.logEvent(`Researched: ${node.name}!`, 'success');
      this.ritualSystem.unlockTech(node.id);
    });

    // Ritual system
    this.ritualSystem = new RitualSystem(
      ['basic_rituals'],
      (ritual) => {
        this.hud.logEvent(`Ritual started: ${ritual.name}`, 'info');
      },
      (result) => {
        this.cultInfluence += result.influenceGain;
        this.cultNotoriety += result.notorietyGain;
        this.hud.logEvent(`Ritual complete: ${result.name} (+${result.influenceGain} influence, +${result.faithGain} faith)`, 'success');
      },
    );

    this.systems = [this.needsSystem, this.jobSystem, this.aiSystem, this.eventSystem, this.ritualSystem];

    // Input
    this.input = new InputManager(canvas, (x, y) => this.renderer.camera.screenToTile(x, y));

    // Inject CSS
    this.injectStyles();

    // HUD
    const hudContainer = document.createElement('div');
    hudContainer.id = 'hud';
    document.body.appendChild(hudContainer);
    this.hud = new HUDManager({ container: hudContainer });

    // Spawn initial followers
    this.spawnFollowers(4);

    // Set up HUD
    this.updateHUD();
    this.hud.setTimeMode('play');
    this.hud.updateTime(6, 1);
    this.hud.logEvent('Welcome to Cult Tycoon!', 'success');
    this.hud.logEvent('Your cult begins with 4 followers.', 'info');
    this.hud.logEvent('Press B for build mode, click objects in the panel.', 'info');
    this.hud.logEvent('Press T for tech tree, R for rituals.', 'info');

    // Populate build panel
    this.setupBuildPanel();

    // Input callbacks
    this.input.onTileClick = (tile) => this.onTileClick(tile.x, tile.y);
    this.input.onTileHover = (tile) => this.onTileHover(tile.x, tile.y);

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Setup HUD button click handlers
    this.setupHUDInteractions();

    canvas.focus();
    window.addEventListener('resize', this.onResize);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      /* HUD Global */
      #hud {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none; z-index: 100;
        font-family: 'Segoe UI', -apple-system, sans-serif;
        color: #e0e0e0; font-size: 13px;
      }

      /* Resource Bar — top center */
      .hud-resource-bar {
        position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
        display: flex; gap: 16px; padding: 8px 20px;
        background: rgba(15, 15, 30, 0.85);
        border: 1px solid rgba(100, 100, 160, 0.3);
        border-radius: 8px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
      }
      .hud-stat {
        display: flex; align-items: center; gap: 4px;
        font-weight: 600; white-space: nowrap;
      }
      .hud-stat::before {
        content: ''; display: inline-block; width: 8px; height: 8px;
        border-radius: 50%; margin-right: 4px;
      }
      .hud-stat:nth-child(1)::before { background: #a855f7; } /* Influence */
      .hud-stat:nth-child(2)::before { background: #fbbf24; } /* Wealth */
      .hud-stat:nth-child(3)::before { background: #ef4444; } /* Notoriety */
      .hud-stat:nth-child(4)::before { background: #3b82f6; } /* Faith */
      .hud-stat:nth-child(5)::before { background: #10b981; } /* Morale */
      .hud-stat:nth-child(6)::before { background: #f97316; } /* Pop */

      /* Build Panel — left side */
      .hud-build-panel {
        position: absolute; top: 60px; left: 8px;
        width: 200px; max-height: 70vh; overflow-y: auto;
        padding: 8px; background: rgba(15, 15, 30, 0.85);
        border: 1px solid rgba(100, 100, 160, 0.3);
        border-radius: 8px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
      }
      .hud-build-entry {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; margin: 2px 0;
        border-radius: 6px; cursor: pointer;
        transition: background 0.15s;
      }
      .hud-build-entry:hover {
        background: rgba(80, 80, 140, 0.3);
      }
      .hud-build-entry.selected {
        background: rgba(168, 85, 247, 0.3);
        border: 1px solid rgba(168, 85, 247, 0.5);
      }
      .hud-build-icon { font-size: 18px; }
      .hud-build-label { flex: 1; font-size: 12px; }
      .hud-build-cost { color: #fbbf24; font-size: 11px; font-weight: 600; }

      /* Inspector — right side */
      .hud-inspector {
        position: absolute; top: 60px; right: 8px;
        width: 220px; padding: 12px;
        background: rgba(15, 15, 30, 0.85);
        border: 1px solid rgba(100, 100, 160, 0.3);
        border-radius: 8px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
        display: none;
      }
      .hud-inspector-name { font-size: 16px; font-weight: 700; margin-bottom: 2px; color: #a855f7; }
      .hud-inspector-role { font-size: 11px; color: #888; margin-bottom: 8px; }
      .hud-inspector-health { font-size: 12px; margin-bottom: 6px; }
      .hud-inspector-needs { font-size: 11px; line-height: 1.6; margin-bottom: 6px; }
      .hud-inspector-needs div { display: flex; justify-content: space-between; }
      .hud-inspector-job { font-size: 11px; color: #aaa; margin-bottom: 4px; }
      .hud-inspector-traits { font-size: 11px; color: #fbbf24; font-style: italic; }

      /* Event Log — bottom right */
      .hud-event-log {
        position: absolute; bottom: 50px; right: 8px;
        width: 320px; max-height: 180px; overflow-y: auto;
        padding: 8px; background: rgba(15, 15, 30, 0.85);
        border: 1px solid rgba(100, 100, 160, 0.3);
        border-radius: 8px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
      }
      .hud-log-entry {
        font-size: 11px; padding: 2px 0; line-height: 1.4;
      }
      .hud-log-info { color: #aaa; }
      .hud-log-warning { color: #fbbf24; }
      .hud-log-danger { color: #ef4444; font-weight: 600; }
      .hud-log-success { color: #10b981; }

      /* Time Controls — bottom center */
      .hud-time-controls {
        position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
        display: flex; gap: 8px; align-items: center; padding: 6px 16px;
        background: rgba(15, 15, 30, 0.85);
        border: 1px solid rgba(100, 100, 160, 0.3);
        border-radius: 8px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.5);
      }
      .hud-time-btn {
        background: none; border: 1px solid rgba(100,100,160,0.3);
        color: #ccc; padding: 4px 12px; border-radius: 4px;
        cursor: pointer; font-size: 12px; transition: all 0.15s;
      }
      .hud-time-btn:hover { background: rgba(80,80,140,0.3); }
      .hud-time-btn.active { background: rgba(168,85,247,0.3); border-color: rgba(168,85,247,0.5); color: #fff; }
      .hud-time { font-size: 13px; font-weight: 600; color: #ccc; margin-right: 8px; }

      /* Tooltip */
      .hud-tooltip {
        position: absolute; padding: 6px 10px;
        background: rgba(15, 15, 30, 0.95);
        border: 1px solid rgba(100, 100, 160, 0.3);
        border-radius: 6px; font-size: 11px;
        pointer-events: none; z-index: 200;
        max-width: 200px;
      }

      /* Scrollbar */
      .hud-build-panel::-webkit-scrollbar,
      .hud-event-log::-webkit-scrollbar { width: 4px; }
      .hud-build-panel::-webkit-scrollbar-thumb,
      .hud-event-log::-webkit-scrollbar-thumb {
        background: rgba(100,100,160,0.3); border-radius: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  private setupBuildPanel(): void {
    const buildEntries: BuildPanelEntry[] = [
      { id: 'wall', label: 'Wall', icon: '🧱', cost: 5, category: 'walls' },
      { id: 'floor', label: 'Floor', icon: '⬜', cost: 2, category: 'floors' },
      { id: 'door', label: 'Door', icon: '🚪', cost: 8, category: 'walls' },
      ...DataManager.getObjects().map(obj => ({
        id: obj.id,
        label: obj.name,
        icon: obj.category === 'ritual' ? '🔮' : obj.category === 'kitchen' ? '🍲' : obj.category === 'furniture' ? '🛏️' : obj.category === 'research' ? '📚' : obj.category === 'storage' ? '📦' : obj.category === 'decor' ? '🔥' : obj.category === 'wellness' ? '🧘' : '📦',
        cost: obj.cost,
        category: 'objects' as const,
      })),
    ];
    this.hud.setBuildPanel(buildEntries);
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case 'b':
          this.input.setMode('build');
          this.selectedBuildItem = 'wall';
          this.highlightBuildPanel('wall');
          this.hud.logEvent('Build mode: select an item, then click the map.', 'info');
          break;
        case 'x':
          this.input.setMode('demolish');
          this.selectedBuildItem = null;
          this.highlightBuildPanel(null);
          this.hud.logEvent('Demolish mode: click to remove.', 'info');
          break;
        case 'escape':
          this.input.setMode('select');
          this.selectedBuildItem = null;
          this.selectedEntity = null;
          this.hud.hideInspector();
          this.highlightBuildPanel(null);
          break;
        case 't':
          this.showTechTree();
          break;
        case 'r':
          this.showRitualMenu();
          break;
        case ' ': // Space
          e.preventDefault();
          this.togglePause();
          break;
        case '1':
          if (this.timeMode !== 'pause') this.setTimeMode('play');
          break;
        case '2':
          if (this.timeMode !== 'pause') this.setTimeMode('fast');
          break;
      }
    });
  }

  private setupHUDInteractions(): void {
    // Build panel click handlers
    const panel = this.hud['buildPanel'];
    if (panel) {
      panel.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const entry = target.closest('.hud-build-entry') as HTMLElement;
        if (!entry) return;
        const id = entry.getAttribute('data-id');
        const cost = parseInt(entry.getAttribute('data-cost') || '0');
        if (!id) return;

        this.input.setMode('build');
        this.selectedBuildItem = id;
        this.highlightBuildPanel(id);
        this.hud.logEvent(`Selected: ${entry.querySelector('.hud-build-label')?.textContent} (${cost}g)`, 'info');
      });
    }

    // Time control buttons
    const timeCtrl = this.hud['timeControls'];
    if (timeCtrl) {
      timeCtrl.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('hud-time-btn')) {
          const mode = target.dataset.mode as 'pause' | 'play' | 'fast';
          this.setTimeMode(mode);
        }
      });
    }
  }

  private highlightBuildPanel(id: string | null): void {
    const panel = this.hud['buildPanel'];
    if (!panel) return;
    panel.querySelectorAll('.hud-build-entry').forEach(el => {
      const elId = (el as HTMLElement).getAttribute('data-id');
      el.classList.toggle('selected', elId === id);
    });
  }

  private setTimeMode(mode: 'pause' | 'play' | 'fast'): void {
    this.timeMode = mode;
    this.timeScale = mode === 'pause' ? 0 : mode === 'fast' ? 3 : 1;
    this.hud.setTimeMode(mode);
  }

  private togglePause(): void {
    if (this.timeMode === 'pause') {
      this.setTimeMode('play');
    } else {
      this.setTimeMode('pause');
    }
  }

  private showTechTree(): void {
    const nodes = this.techTree.getNodes();
    const available = this.techTree.getAvailable();
    const unlocked = this.techTree.getUnlocked();

    this.hud.logEvent(`Tech Tree: ${unlocked.length}/${nodes.length} unlocked, ${available.length} available`, 'info');
    for (const node of available.slice(0, 3)) {
      const canAfford = this.cultInfluence >= node.cost;
      this.hud.logEvent(`  ${canAfford ? '✅' : '🔒'} ${node.name} (${node.cost} influence) — ${node.description}`, canAfford ? 'success' : 'info');
    }

    // Auto-unlock if we can afford the cheapest available
    const cheapest = available.sort((a, b) => a.cost - b.cost)[0];
    if (cheapest && this.cultInfluence >= cheapest.cost) {
      const result = this.techTree.unlock(cheapest.id, this.cultInfluence);
      if (result.success) {
        this.cultInfluence -= cheapest.cost;
        this.hud.logEvent(`Auto-researched: ${cheapest.name}!`, 'success');
      }
    }
  }

  private showRitualMenu(): void {
    const available = this.ritualSystem.getAvailableRituals();
    const entities = this.world.query([Needs, FollowerAI]);
    this.hud.logEvent(`Rituals available: ${available.length}`, 'info');
    for (const ritual of available) {
      const canStart = this.ritualSystem.canStartRitual(
        ritual.id,
        entities,
        this.cultInfluence,
        this.cultWealth,
      );
      this.hud.logEvent(`  ${canStart.ok ? '✅' : '🔒'} ${ritual.name} — ${ritual.description}`, canStart.ok ? 'success' : 'warning');
    }

    // Auto-start the cheapest available ritual we can afford
    const startable = available.filter(r => {
      const check = this.ritualSystem.canStartRitual(r.id, entities, this.cultInfluence, this.cultWealth);
      return check.ok;
    });
    if (startable.length > 0 && this.ritualSystem.getActiveRituals().length === 0) {
      const ritual = startable[0];
      const participants = entities.slice(0, ritual.minFollowers);
      this.ritualSystem.startRitual(ritual.id, participants);
      // Deduct costs
      this.cultInfluence -= ritual.faithCost;
      if (ritual.wealthCost) this.cultWealth -= ritual.wealthCost;
    }
  }

  private spawnFollowers(count: number): void {
    let spawnX = 16, spawnY = 16;
    for (let y = 14; y < 18; y++) {
      for (let x = 14; x < 18; x++) {
        const tile = this.map.getTile(x, y);
        if (tile && tile.terrain === 'grass' && !tile.occupied) {
          spawnX = x;
          spawnY = y;
          break;
        }
      }
    }

    const followers = this.factory.spawnGroup(this.world, count, spawnX, spawnY);
    for (const f of followers) {
      this.followerNames.set(f.entityId, f.name);
    }
    this.sceneMgr.syncEntities();
  }

  private onTileClick(x: number, y: number): void {
    const tile = this.map.getTile(x, y);
    if (!tile) return;

    if (this.input.getMode() === 'build' && this.selectedBuildItem) {
      this.handleBuild(x, y);
    } else if (this.input.getMode() === 'demolish') {
      const result = this.buildingSystem.demolish(x, y);
      if (result.success) {
        this.hud.logEvent(`Demolished at (${x}, ${y})`, 'info');
        this.sceneMgr.buildTiles();
        this.sceneMgr.syncEntities();
        this.pathfinder.invalidateCache();
      }
    } else {
      // Select mode — check for follower at this tile
      const entity = this.findFollowerAt(x, y);
      if (entity !== null) {
        this.selectFollower(entity);
      } else {
        this.selectedEntity = null;
        this.hud.hideInspector();
        this.hud.logEvent(`Tile (${x}, ${y}): ${tile.terrain}${tile.occupied ? ' [built]' : ''}`, 'info');
      }
    }
  }

  private handleBuild(x: number, y: number): void {
    const item = this.selectedBuildItem!;
    const objDef = DataManager.getObject(item);

    // Determine cost
    let cost = 5;
    if (item === 'wall') cost = 5;
    else if (item === 'floor') cost = 2;
    else if (item === 'door') cost = 8;
    else if (objDef) cost = objDef.cost;

    // Check wealth
    if (this.cultWealth < cost) {
      this.hud.logEvent(`Not enough wealth! Need ${cost}g, have ${Math.floor(this.cultWealth)}g`, 'warning');
      return;
    }

    // Place the item
    let result: { success: boolean; message: string };
    if (item === 'wall') {
      result = this.buildingSystem.placeWall(x, y);
    } else if (item === 'floor') {
      result = this.buildingSystem.placeFloor(x, y);
    } else if (item === 'door') {
      result = this.buildingSystem.placeDoor(x, y);
    } else if (objDef) {
      result = this.buildingSystem.placeObject(x, y, item);
    } else {
      result = { success: false, message: 'Unknown build item' };
    }

    if (result.success) {
      this.cultWealth -= cost;
      const label = item === 'wall' ? 'Wall' : item === 'floor' ? 'Floor' : item === 'door' ? 'Door' : objDef?.name ?? item;
      this.hud.logEvent(`${label} placed at (${x}, ${y}) for ${cost}g`, 'success');
      this.showFloatingText(`-${cost}g`, x, y, '#fbbf24');
      this.sceneMgr.buildTiles();
      this.sceneMgr.syncEntities();
      this.pathfinder.invalidateCache();
      this.updateHUD();
    } else {
      this.hud.logEvent(`Can't build: ${result.message}`, 'warning');
    }
  }

  private onTileHover(x: number, y: number): void {
    this.sceneMgr.highlightTile(x, y);
  }

  private showFloatingText(text: string, tileX: number, tileY: number, color: string = '#fff'): void {
    const screen = this.renderer.camera.tileToScreen(tileX, tileY);
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:absolute;left:${screen.x}px;top:${screen.y}px;color:${color};font-weight:700;font-size:14px;pointer-events:none;z-index:200;text-shadow:0 1px 3px rgba(0,0,0,0.8);transition:all 1s ease-out;opacity:1;`;
    document.body.appendChild(el);
    this.floatingTexts.push({ el, life: 1.0 });

    // Animate upward
    requestAnimationFrame(() => {
      el.style.transform = 'translateY(-40px)';
      el.style.opacity = '0';
    });
  }

  private updateFloatingTexts(dt: number): void {
    this.floatingTexts = this.floatingTexts.filter(ft => {
      ft.life -= dt;
      if (ft.life <= 0) {
        ft.el.remove();
        return false;
      }
      return true;
    });
  }

  private findFollowerAt(tileX: number, tileY: number): number | null {
    const entities = this.world.query([Transform, Renderable, Needs]);
    for (const e of entities) {
      const transform = this.world.getComponent(e, Transform)!;
      if (Math.round(transform.x) === tileX && Math.round(transform.y) === tileY) {
        return e;
      }
    }
    return null;
  }

  private selectFollower(entity: number): void {
    this.selectedEntity = entity;
    const needs = this.world.getComponent(entity, Needs);
    const health = this.world.getComponent(entity, Health);
    const traits = this.world.getComponent(entity, Traits);
    const job = this.world.getComponent(entity, Job);
    const name = this.followerNames.get(entity) ?? 'Unknown';

    if (!needs) return;

    this.hud.showInspector({
      name,
      role: 'Follower',
      health: health?.hp ?? 100,
      needs: {
        hunger: needs.hunger,
        faith: needs.faith,
        fun: needs.fun,
        sanity: needs.sanity,
      },
      job: job?.type ?? 'idle',
      traits: traits?.traits ?? [],
    });
  }

  private updateHUD(): void {
    const entities = this.world.query([Needs, FollowerAI]);
    let totalFaith = 0;
    let totalFun = 0;
    let totalSanity = 0;
    let workingCount = 0;

    for (const e of entities) {
      const n = this.world.getComponent(e, Needs)!;
      totalFaith += n.faith;
      totalFun += n.fun;
      totalSanity += n.sanity;
      const ai = this.world.getComponent(e, FollowerAI);
      if (ai?.state === 'working') workingCount++;
    }

    const pop = entities.length;
    const maxPopBonus = this.techTree.getEffectBonus('maxPopulationBonus');

    // Resource generation: working followers generate wealth
    this.cultWealth += workingCount * 0.05;

    const data: ResourceBarData = {
      influence: Math.floor(this.cultInfluence),
      wealth: Math.floor(this.cultWealth),
      notoriety: Math.floor(this.cultNotoriety),
      faith: pop > 0 ? totalFaith / pop : 100,
      morale: pop > 0 ? (totalFun + totalSanity) / (2 * pop) : 100,
      population: pop,
      maxPopulation: 10 + maxPopBonus,
    };
    this.hud.updateResourceBar(data);

    // Update inspector if a follower is selected
    if (this.selectedEntity !== null) {
      this.selectFollower(this.selectedEntity);
    }
  }

  private onResize = (): void => {
    // Renderer handles its own resize
  };

  start(): void {
    this.lastTime = performance.now();
    this.gameLoop();
  }

  async preloadAssets(): Promise<void> {
    const assetUrls = [
      '/assets/models/followers/follower_novice.glb',
      '/assets/models/followers/follower_adept.glb',
      '/assets/models/followers/follower_priest.glb',
      '/assets/models/buildings/wall_straight.glb',
      '/assets/models/buildings/door.glb',
      '/assets/models/buildings/bed.glb',
      '/assets/models/buildings/prayer_mat.glb',
      '/assets/models/buildings/research_desk.glb',
      '/assets/models/buildings/cooking_pot.glb',
      '/assets/models/buildings/ritual_circle.glb',
    ];
    await this.assets.loadAll(assetUrls);
    // Re-sync entities now that assets are loaded
    this.sceneMgr.syncEntities();
  }

  private gameLoop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.gameLoop);

    const now = performance.now();
    const frameTime = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    // Fixed timestep simulation
    this.accumulator += frameTime * this.timeScale;
    while (this.accumulator >= this.tickDuration) {
      this.simulate(this.tickDuration);
      this.accumulator -= this.tickDuration;
    }

    // Render
    this.renderSystem.update(this.world, 0);
    this.renderer.camera.update(frameTime);

    // Day/night lighting
    this.updateLighting();

    // Update floating texts
    this.updateFloatingTexts(frameTime);

    this.renderer.render();
  };

  private updateLighting(): void {
    const hour = this.currentHour;
    // Day/night cycle: 6-18 is day, 18-6 is night
    const dayFactor = hour < 6 || hour > 18
      ? 0.3 // Night
      : hour < 8 || hour > 16
      ? 0.6 // Dawn/dusk
      : 1.0; // Full day

    const ambient = this.renderer.ambient;
    ambient.intensity = 0.3 + dayFactor * 0.3;

    const dirLight = this.renderer.directional;
    dirLight.intensity = 0.3 + dayFactor * 0.5;
    // Shift color toward orange at dawn/dusk
    const warm = hour >= 16 && hour <= 19;
    dirLight.color.setHex(warm ? 0xffaa66 : 0xffffff);
  }

  private simulate(dt: number): void {
    for (const system of this.systems) {
      system.update(this.world, dt);
    }

    // Time progression: 1 game day = 30 real seconds at 1x speed
    // 30 ticks/sec * 30 sec = 900 ticks per day
    this.tickCount += dt;
    const ticksPerHour = 900 / 24; // 37.5 ticks per hour
    this.currentHour = (6 + this.tickCount / ticksPerHour) % 24;
    const newDay = Math.floor(this.tickCount / 900) + 1;
    if (newDay !== this.currentDay) {
      this.currentDay = newDay;
      this.hud.logEvent(`Day ${newDay} begins.`, 'info');
      // Daily influence from faith
      const entities = this.world.query([Needs]);
      let avgFaith = 0;
      for (const e of entities) {
        avgFaith += this.world.getComponent(e, Needs)!.faith;
      }
      if (entities.length > 0) {
        avgFaith /= entities.length;
        const dailyInfluence = Math.floor(avgFaith * 0.1);
        this.cultInfluence += dailyInfluence;
      }
    }

    // Update HUD every 30 ticks (~1 second)
    const tickFloor = Math.floor(this.tickCount);
    if (tickFloor % 30 === 0) {
      this.updateHUD();
      this.hud.updateTime(this.currentHour, this.currentDay);
    }

    // Sync entity positions for animation
    this.sceneMgr.syncEntities();
  }

  dispose(): void {
    this.running = false;
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.hud.destroy();
    this.sceneMgr.dispose();
    this.renderer.dispose();
  }
}

function init(): void {
  const game = new CultTycoonGame();
  game.preloadAssets().then(() => {
    game.start();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}