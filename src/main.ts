/**
 * Cult Tycoon — Main entry point.
 * Wires together all engine systems into a playable game.
 */

import { Renderer } from './engine/Renderer';
import { SceneManager } from './engine/SceneManager';
import { InputManager } from './engine/InputManager';
import { TileMap } from './world/TileMap';
import { WorldGen } from './world/WorldGen';
import { Pathfinder } from './world/Pathfinder';
import { World } from './ecs/World';
import { System } from './ecs/System';
import { Needs } from './components/Needs';
import { FollowerAI } from './components/FollowerAI';
import { NeedsSystem } from './systems/NeedsSystem';
import { JobSystem } from './systems/JobSystem';
import { AISystem } from './systems/AISystem';
import { BuildingSystem } from './systems/BuildingSystem';
import { RenderSystem } from './systems/RenderSystem';
import { FollowerFactory } from './systems/FollowerFactory';
import { EventSystem } from './systems/EventSystem';
import { DataManager } from './data/DataManager';
import { HUDManager, ResourceBarData, BuildPanelEntry } from './ui/HUDManager';

class CultTycoonGame {
  private renderer: Renderer;
  private sceneMgr: SceneManager;
  private input: InputManager;
  private hud: HUDManager;
  private world: World;
  private map: TileMap;
  private pathfinder: Pathfinder;
  private buildingSystem: BuildingSystem;
  private needsSystem: NeedsSystem;
  private jobSystem: JobSystem;
  private aiSystem: AISystem;
  private renderSystem: RenderSystem;
  private eventSystem: EventSystem;
  private factory: FollowerFactory;
  private systems: System[] = [];
  private lastTime = 0;
  private accumulator = 0;
  private readonly tickDuration = 1 / 30;
  private timeScale = 1;
  private running = true;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas #game-canvas not found');
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';

    // Core engine
    this.renderer = new Renderer(canvas);
    this.world = new World();

    // World generation
    const worldGen = new WorldGen(12345);
    this.map = worldGen.generate({ width: 24, height: 24, waterPools: 2, stonePatches: 3, dirtPatches: 4 });
    this.pathfinder = new Pathfinder(this.map);

    // Scene manager builds tile meshes
    this.sceneMgr = new SceneManager(this.renderer.threeScene, this.world, this.map);
    this.sceneMgr.buildTiles();

    // Systems
    this.needsSystem = new NeedsSystem();
    this.jobSystem = new JobSystem();
    this.aiSystem = new AISystem(this.map, this.pathfinder);
    this.buildingSystem = new BuildingSystem(this.map);
    this.renderSystem = new RenderSystem(this.sceneMgr);
    this.factory = new FollowerFactory(42);

    // Event system with data-driven events
    this.eventSystem = new EventSystem(
      DataManager.getEvents() as any,
      12345,
      (event) => {
        this.hud.logEvent(event.description, event.type === 'positive' ? 'success' : event.type === 'danger' ? 'danger' : 'warning');
      },
    );

    this.systems = [this.needsSystem, this.jobSystem, this.aiSystem, this.eventSystem];

    // Input
    this.input = new InputManager(canvas, (x, y) => this.renderer.camera.screenToTile(x, y));

    // HUD
    const hudContainer = document.createElement('div');
    hudContainer.id = 'hud';
    document.body.appendChild(hudContainer);
    this.hud = new HUDManager({ container: hudContainer });

    // Spawn initial followers
    this.spawnFollowers(3);

    // Set up HUD
    this.updateHUD();
    this.hud.setTimeMode('play');
    this.hud.updateTime(6, 1);
    this.hud.logEvent('Welcome to Cult Tycoon!', 'success');
    this.hud.logEvent('Your cult begins with 3 followers.', 'info');
    this.hud.logEvent('Press B to enter build mode, click to place walls.', 'info');

    // Populate build panel with objects from data
    const buildEntries: BuildPanelEntry[] = DataManager.getObjects().map(obj => ({
      id: obj.id,
      label: obj.name,
      icon: obj.category === 'ritual' ? '🔮' : obj.category === 'kitchen' ? '🍲' : obj.category === 'furniture' ? '🛏️' : obj.category === 'research' ? '📚' : obj.category === 'storage' ? '📦' : '📦',
      cost: obj.cost,
      category: obj.category as any,
    }));
    this.hud.setBuildPanel(buildEntries);

    // Input callbacks
    this.input.onTileClick = (tile) => this.onTileClick(tile.x, tile.y);
    this.input.onTileHover = (tile) => this.sceneMgr.highlightTile(tile.x, tile.y);

    canvas.focus();
    window.addEventListener('resize', this.onResize);
  }

  private spawnFollowers(count: number): void {
    // Find a grass tile near center
    let spawnX = 12, spawnY = 12;
    for (let y = 10; y < 14; y++) {
      for (let x = 10; x < 14; x++) {
        const tile = this.map.getTile(x, y);
        if (tile && tile.terrain === 'grass' && !tile.occupied) {
          spawnX = x;
          spawnY = y;
          break;
        }
      }
    }

    this.factory.spawnGroup(this.world, count, spawnX, spawnY);
    this.sceneMgr.syncEntities();
  }

  private onTileClick(x: number, y: number): void {
    const tile = this.map.getTile(x, y);
    if (!tile) return;

    if (this.input.getMode() === 'build') {
      const result = this.buildingSystem.placeWall(x, y);
      if (result.success) {
        this.hud.logEvent(`Wall placed at (${x}, ${y})`, 'info');
        this.sceneMgr.buildTiles();
        this.pathfinder.invalidateCache();
      } else {
        this.hud.logEvent(`Can't build: ${result.message}`, 'warning');
      }
    } else if (this.input.getMode() === 'demolish') {
      const result = this.buildingSystem.demolish(x, y);
      if (result.success) {
        this.hud.logEvent(`Demolished at (${x}, ${y})`, 'info');
        this.sceneMgr.buildTiles();
        this.pathfinder.invalidateCache();
      }
    } else {
      // Select mode — show info
      this.hud.logEvent(`Tile (${x}, ${y}): ${tile.terrain}${tile.occupied ? ' [occupied]' : ''}`, 'info');
    }
  }

  private updateHUD(): void {
    const entities = this.world.query([Needs, FollowerAI]);
    let totalFaith = 0;
    let totalFun = 0;
    let totalSanity = 0;
    for (const e of entities) {
      const n = this.world.getComponent(e, Needs)!;
      totalFaith += n.faith;
      totalFun += n.fun;
      totalSanity += n.sanity;
    }
    const pop = entities.length;
    const data: ResourceBarData = {
      influence: 50,
      wealth: 100,
      notoriety: 5,
      faith: pop > 0 ? totalFaith / pop : 100,
      morale: pop > 0 ? (totalFun + totalSanity) / (2 * pop) : 100,
      population: pop,
      maxPopulation: 10,
    };
    this.hud.updateResourceBar(data);
  }

  private onResize = (): void => {
    // Renderer handles its own resize
  };

  start(): void {
    this.lastTime = performance.now();
    this.gameLoop();
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
    this.renderer.render();
  };

  private simulate(dt: number): void {
    for (const system of this.systems) {
      system.update(this.world, dt);
    }

    // Update HUD periodically (every 30 ticks = 1 second)
    if (Math.floor(performance.now() / 1000) !== Math.floor((performance.now() - dt * 1000) / 1000)) {
      this.updateHUD();
    }
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
  game.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}