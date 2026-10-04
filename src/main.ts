/**
 * Cult Tycoon — Main entry point.
 * Wires together all engine systems into a playable game.
 */

import * as THREE from 'three';
import { Renderer } from './engine/Renderer';
import { AudioManager } from './engine/AudioManager';
import { ParticleSystem } from './engine/ParticleSystem';
import { SceneManager, type BuildPreviewTile, type ConstructionVisualKind } from './engine/SceneManager';
import { InputManager } from './engine/InputManager';
import { AssetLoader } from './engine/AssetLoader';
import { TileMap } from './world/TileMap';
import { WorldGen } from './world/WorldGen';
import { Pathfinder } from './world/Pathfinder';
import { NavigationGrid } from './world/NavigationGrid';
import { ALPHA_SPATIAL_CONFIG } from './world/Spatial';
import { World } from './ecs/World';
import { System } from './ecs/System';
import { Needs } from './components/Needs';
import { FollowerAI } from './components/FollowerAI';
import { Transform } from './components/Transform';
import { Renderable } from './components/Renderable';
import { Health } from './components/Health';
import { Traits } from './components/Traits';
import { Job } from './components/Job';
import { Inventory } from './components/Inventory';
import { Skills } from './components/Skills';
import { Schedule, type Shift } from './components/Schedule';
import { WorkPreferences, type WorkPriority, type WorkRole } from './components/WorkPreferences';
import type { WorkJobKey } from './ui/WorkPanel';
import { NeedsSystem } from './systems/NeedsSystem';
import { JobSystem, type JobPosting } from './systems/JobSystem';
import { AISystem, type NeedKind } from './systems/AISystem';
import { PathfindSystem } from './systems/PathfindSystem';
import { BuildingSystem, type RoomType, type ConstructionOrientation } from './systems/BuildingSystem';
import { RenderSystem } from './systems/RenderSystem';
import { FollowerFactory } from './systems/FollowerFactory';
import { EventSystem } from './systems/EventSystem';
import { RitualSystem } from './systems/RitualSystem';
import { TechTreeSystem } from './systems/TechTreeSystem';
import { InvestigatorSystem } from './systems/InvestigatorSystem';
import { CombatSystem } from './systems/CombatSystem';
import { ResourceSystem } from './systems/ResourceSystem';
import { LogisticsSystem, type ItemKind } from './systems/LogisticsSystem';
import { FogSystem } from './systems/FogSystem';
import { SchedulingSystem } from './systems/SchedulingSystem';
import { MissionSystem } from './systems/MissionSystem';
import { PrestigeSystem } from './systems/PrestigeSystem';
import { HeatSystem } from './systems/HeatSystem';
import { Prestige } from './components/Prestige';
import { DECOR_ITEMS } from './data/DecorItems';
import { RoomGraph } from './world/RoomGraph';
import { FogOfWar } from './world/FogOfWar';
import { GameState as GameInstanceState } from './game/GameState';
import { DataManager } from './data/DataManager';
import { HUDManager, ResourceBarData, BuildPanelEntry, BuildCategory, type TimeControlMode } from './ui/HUDManager';
import { DialogSystem } from './ui/DialogSystem';
import { StartMenu } from './ui/StartMenu';
import { PauseMenu } from './ui/PauseMenu';
import { SettingsMenu, SettingsData, GraphicsQuality } from './ui/SettingsMenu';
import { SaveSystem, type SaveData, type SerializedCult, type SerializedConstructionBlueprint, type SerializedHarvestOrder } from './systems/SaveSystem';
// WinLoseEvent type used for overlay logic

/** Top-level game state. */
type GameState = 'menu' | 'loading' | 'playing' | 'paused';

type ConstructionKind = 'wall' | 'floor' | 'door' | 'object';

type ConstructionBlueprint = SerializedConstructionBlueprint;
type BuildSelectionCoord = { x: number; y: number; orientation?: ConstructionOrientation; space?: 'local' | 'construction' };


class CultTycoonGame {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private sceneMgr: SceneManager;
  private input: InputManager;
  private hud: HUDManager;
  private dialog: DialogSystem;
  private assets: AssetLoader;
  private world: World;
  private map: TileMap;
  private pathfinder: Pathfinder;
  private navigation: NavigationGrid;
  private buildingSystem: BuildingSystem;
  private needsSystem: NeedsSystem;
  private jobSystem: JobSystem;
  private aiSystem: AISystem;
  private pathfindSystem: PathfindSystem;
  private renderSystem: RenderSystem;
  private eventSystem: EventSystem;
  private ritualSystem: RitualSystem;
  private techTree: TechTreeSystem;
  private investigatorSystem: InvestigatorSystem;
  private combatSystem: CombatSystem;
  private resourceSystem: ResourceSystem;
  private logisticsSystem: LogisticsSystem;
  private fogOfWar: FogOfWar;
  private fogSystem: FogSystem;
  private schedulingSystem: SchedulingSystem;
  private missionSystem: MissionSystem;
  private prestigeSystem: PrestigeSystem;
  private heatSystem: HeatSystem;
  private roomGraph: RoomGraph;
  private roomEntities: Map<number, number> = new Map(); // roomId → entity with Prestige
  private audio: AudioManager;
  private particles: ParticleSystem;
  private gameInstanceState: GameInstanceState;
  private factory: FollowerFactory;
  private systems: System[] = [];
  private gameEnded = false;
  private lastTime = 0;
  private accumulator = 0;
  private readonly tickDuration = 1 / 30;
  private timeScale = 1;
  private running = true;

  // Game state
  private cultWealth = 200;
  private cultInfluence = 50;
  private cultNotoriety = 5;
  private currentHour = 6;
  private currentDay = 1;
  private tickCount = 0;
  private selectedBuildItem: string | null = null;
  private selectedBuildRotation = 0;
  private selectedEntity: number | null = null;
  private buildEntries: BuildPanelEntry[] = [];
  private activeBuildCategory: string | null = null;
  private followerNames: Map<number, string> = new Map();
  private floatingTexts: { el: HTMLDivElement; life: number }[] = [];
  private constructionBlueprints: Map<string, ConstructionBlueprint> = new Map();
  private nextConstructionBlueprintId = 1;
  private harvestOrders: Map<string, SerializedHarvestOrder> = new Map();

  /** Average faith across all followers — used for tech tree unlocks. */
  private get cultFaith(): number {
    const entities = this.world.query([Needs, FollowerAI]);
    if (entities.length === 0) return 0;
    let total = 0;
    for (const e of entities) {
      total += this.world.getComponent(e, Needs)!.faith;
    }
    return total / entities.length;
  }

  // Time control
  private timeMode: TimeControlMode = 'speed1';
  private lastHudUpdateSecond = -1;

  // Menu system
  private gameState: GameState = 'menu';
  private startMenu: StartMenu | null = null;
  private pauseMenu: PauseMenu | null = null;
  private settingsMenu: SettingsMenu | null = null;

  // Save system
  private saveSystem: SaveSystem;
  private settingsData: SettingsData = {
    masterVolume: 75,
    sfxVolume: 80,
    graphicsQuality: 'high' as GraphicsQuality,
    cameraSnap: false,
  };

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas #game-canvas not found');
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';
    this.canvas = canvas;

    // Core engine
    this.renderer = new Renderer(canvas);
    this.audio = new AudioManager();
    this.particles = new ParticleSystem(this.renderer.threeScene);
    this.world = new World();
    this.assets = new AssetLoader();

    // World generation — 64x64 large world with fog of war
    const worldGen = new WorldGen(12345);
    this.map = worldGen.generate({ width: 64, height: 64, waterPools: 8, stonePatches: 10, dirtPatches: 12 });
    this.navigation = new NavigationGrid(this.map);
    this.pathfinder = new Pathfinder(this.map, this.navigation);

    // Set map offset for raycaster-based tile picking
    this.renderer.camera.setMapOffset(-this.map.width / 2, -this.map.height / 2);
    this.renderer.camera.setMapBounds(this.map.width, this.map.height);

    // Fog of war — guarantee a generous starter clearing around the initial compound area.
    this.fogOfWar = new FogOfWar(10);
    const mapCenterX = Math.floor(this.map.width / 2);
    const mapCenterY = Math.floor(this.map.height / 2);
    this.fogOfWar.revealArea(mapCenterX, mapCenterY, 15);

    // Scene manager builds tile meshes (fog applied during build)
    this.sceneMgr = new SceneManager(this.renderer.threeScene, this.world, this.map, this.assets);
    this.sceneMgr.setFog(this.fogOfWar);
    this.sceneMgr.buildTiles();

    // Center camera on map center and set initial zoom for 64x64 map
    this.renderer.camera.setTarget(0, 0);
    this.renderer.camera.setZoom(40);

    // Systems
    this.needsSystem = new NeedsSystem();
    this.jobSystem = new JobSystem();
    this.logisticsSystem = new LogisticsSystem(ALPHA_SPATIAL_CONFIG.constructionSubdivisions, this.jobSystem);
    this.jobSystem.setCompletionHandler((posting, entity) => this.onJobCompleted(posting, entity));
    this.aiSystem = new AISystem(this.map, this.pathfinder);
    this.pathfindSystem = new PathfindSystem(this.map, this.pathfinder);
    this.pathfindSystem.bindWorld(this.world);
    this.buildingSystem = new BuildingSystem(this.map, ALPHA_SPATIAL_CONFIG.constructionSubdivisions, this.navigation);
    this.aiSystem.setNeedFacilityProvider((need, from) => this.findNeedFacility(need, from));
    this.renderSystem = new RenderSystem(this.sceneMgr);
    this.renderSystem.setBuildingSystem(this.buildingSystem);
    this.renderSystem.setFollowerNames(this.followerNames);
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
        this.audio.play('ritual-cast');
        // Spawn ritual particles at map center
        const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
        this.particles.spawnRitualCast(offset.x + this.map.width / 2, offset.z + this.map.height / 2);
      },
      (result) => {
        this.cultInfluence += result.influenceGain;
        this.cultNotoriety += result.notorietyGain;
        this.hud.logEvent(`Ritual complete: ${result.name} (+${result.influenceGain} influence, +${result.faithGain} faith)`, 'success');
        this.audio.play('level-up');
        this.dialog.ritualResult(result.name, result);

        // Check if Ascension ritual completed → trigger win condition check
        if (result.id.startsWith('ascension')) {
          this.checkWinCondition();
        }
      },
    );

    // Investigator system — spawns when notoriety > 50
    this.investigatorSystem = new InvestigatorSystem(
      this.map,
      this.pathfinder,
      16,
      16,
      {
        onInvestigatorSpawn: (_inv) => {
          this.hud.logEvent(`⚠️ An investigator has arrived to inspect your cult!`, 'danger');
        },
        onInvestigatorInspectComplete: (_inv) => {
          this.cultNotoriety = Math.min(100, this.cultNotoriety + 10);
          this.hud.logEvent(`Investigator completed inspection. Notoriety +10.`, 'danger');
        },
        onInvestigatorConverted: (_inv) => {
          this.hud.logEvent(`Investigator was converted to your cult!`, 'success');
        },
        onInvestigatorFled: (_inv) => {
          this.hud.logEvent(`Investigator fled.`, 'info');
        },
      },
      99999,
    );

    // Combat system — handles fights between investigators and followers
    this.combatSystem = new CombatSystem(this.investigatorSystem, {}, 99999);

    // Game state store for resource tracking
    this.gameInstanceState = new GameInstanceState({
      faith: 100,
      funds: this.cultWealth,
      materials: 50,
      food: 100,
      influence: this.cultInfluence,
      notoriety: this.cultNotoriety,
    });

    // Resource system — generates and consumes resources each tick
    this.resourceSystem = new ResourceSystem(
      this.gameInstanceState,
      {},
      (event) => {
        const logType = event.type === 'shortage' ? 'danger' : event.type === 'milestone' ? 'success' : 'info';
        this.hud.logEvent(event.message, logType as any);
      },
    );

    // Fog system — updates visibility around followers every 10 ticks
    this.fogSystem = new FogSystem(this.fogOfWar, 0.33);

    // Scheduling system — manages shifts and daily activities
    this.schedulingSystem = new SchedulingSystem();

    // Mission system — sends cultists on external missions for rewards
    this.missionSystem = new MissionSystem(
      (missionId, event, choices) => {
        this.hud.logEvent(`Mission event: ${event.text}`, 'warning');

        // Mission events are player decisions. Pause simulation while the modal is open
        // so the mission cannot advance or resolve behind the player's choice.
        const previousTimeMode = this.timeMode;
        this.setTimeMode('pause');

        this.dialog.show({
          title: 'Mission Decision',
          icon: '🎯',
          body: `<p>${event.text}</p><p style="color:#888;font-size:12px;">Choose how your cultists should respond.</p>`,
          modal: true,
          buttons: choices.map((choice, choiceIndex) => ({
            label: choice.skillCheck
              ? `${choice.label} [${choice.skillCheck.skill} ${choice.skillCheck.difficulty}]`
              : choice.label,
            onClick: () => {
              const result = this.missionSystem.resolveEventChoice(missionId, choiceIndex, this.world);
              if (result) {
                this.hud.logEvent(
                  `Mission outcome: ${result.text}`,
                  result.success ? 'success' : 'danger',
                );
              }
              this.setTimeMode(previousTimeMode);
            },
          })),
        });
      },
      (_missionId, templateId, success, rewards) => {
        // Apply mission rewards to cult resources
        if (rewards.money) this.cultWealth += rewards.money;
        if (rewards.influence) this.cultInfluence += rewards.influence;
        if (rewards.heatReduction) this.heatSystem.reduceHeat(rewards.heatReduction);
        if (rewards.heatGain) this.heatSystem.addHeat(rewards.heatGain, 'mission');
        const parts: string[] = [];
        if (rewards.money) parts.push(`+${rewards.money}g`);
        if (rewards.influence) parts.push(`+${rewards.influence} influence`);
        if (rewards.decorItemIds.length > 0) parts.push(`+${rewards.decorItemIds.length} decor item(s)`);
        this.hud.logEvent(
          `Mission ${success ? 'succeeded' : 'failed'}: ${templateId}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`,
          success ? 'success' : 'danger',
        );
      },
    );

    // Prestige system — manages room decor and mood effects
    this.prestigeSystem = new PrestigeSystem();

    // Heat system — tracks heat accumulation and triggers consequences
    this.heatSystem = new HeatSystem(
      (event) => {
        const logType = event.severity === 'critical' || event.severity === 'danger'
          ? 'danger'
          : event.severity === 'warning'
            ? 'warning'
            : 'info';
        this.hud.logEvent(`🔥 ${event.title}: ${event.message}`, logType as any);
      },
      (reason) => {
        this.showLoseOverlay(reason);
      },
    );

    // Room graph for room detection (used by prestige system)
    this.roomGraph = new RoomGraph(this.map);

    this.systems = [this.needsSystem, this.schedulingSystem, this.jobSystem, this.aiSystem, this.pathfindSystem, this.resourceSystem, this.eventSystem, this.ritualSystem, this.investigatorSystem, this.combatSystem, this.fogSystem];
    // Note: PrestigeSystem, HeatSystem, and MissionSystem are updated manually
    // in simulate() because they don't extend the System base class.
    // Order: Needs → Scheduling → Job → AI → Pathfind → Resource → Event →
    //        Ritual → Investigator → Combat → Fog, then Prestige → Heat → Mission

    // Input
    this.input = new InputManager(canvas, (x, y, mode) => {
      if (mode === 'build') {
        const item = this.selectedBuildItem;
        if (item?.startsWith('room:') || item?.startsWith('harvest:')) {
          return this.renderer.camera.screenToTile(x, y);
        }
        return this.renderer.camera.screenToGrid(x, y, this.buildingSystem.subdivisions);
      }
      if (mode === 'demolish') {
        return this.renderer.camera.screenToGrid(x, y, this.buildingSystem.subdivisions);
      }
      return this.renderer.camera.screenToTile(x, y);
    });

    // Initialize audio on first user interaction (browser autoplay policy)
    const initAudio = () => {
      this.audio.init();
      this.audio.startAmbient();
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);

    // Right-click without drag → cancel/deselect (IsoCamera handles right-drag for rotation)
    this.renderer.camera.onRightClickWithoutDrag = () => {
      this.closeBuildMenu();
    };

    // Inject CSS
    this.injectStyles();

    // HUD
    const hudContainer = document.createElement('div');
    hudContainer.id = 'hud';
    document.body.appendChild(hudContainer);
    this.hud = new HUDManager({ container: hudContainer });
    this.dialog = new DialogSystem();

    // Player-facing management panels.
    this.hud.onOpenTechTree = () => this.openTechTreePanel();
    this.hud.onOpenMissions = () => this.openMissionPanel();
    this.hud.onOpenSchedule = () => this.openSchedulePanel();
    this.hud.onOpenRituals = () => this.showRitualMenu();
    this.hud.onOpenWork = () => this.openWorkPanel();
    this.hud.onSetWorkRole = (entityId, role) => this.setWorkRole(entityId, role);
    this.hud.onSetWorkPriority = (entityId, job, priority) => this.setWorkPriority(entityId, job, priority);
    this.hud.onAutoAssignWorkRoles = () => this.autoAssignWorkRoles();
    this.hud.onTimeModeChange = (mode) => this.setTimeMode(mode);
    this.hud.onWallsVisibilityChange = (visible) => this.sceneMgr.setWallsVisible(visible);
    this.hud.onRoofsVisibilityChange = (visible) => this.sceneMgr.setRoofsVisible(visible);
    this.hud.onTechTreeUnlock = (techId) => this.unlockTechFromPanel(techId);
    this.hud.onSendMission = (templateId, cultistIds) => this.startMissionFromPanel(templateId, cultistIds);
    this.hud.onAssignShift = (entityId, shift) => {
      this.schedulingSystem.assignShift(this.world, entityId, shift);
      this.openSchedulePanel();
    };
    this.hud.onAutoAssignShifts = () => {
      this.schedulingSystem.autoAssignShifts(this.world);
      this.openSchedulePanel();
    };

    // Spawn initial followers at map center
    this.spawnFollowers(6);

    // Set up HUD
    this.updateHUD();
    this.hud.setTimeMode('speed1');
    this.hud.updateTime(6, 1);
    this.hud.logEvent('Welcome to Cult Tycoon!', 'success');
    this.hud.logEvent('Your cult begins with 6 followers and a revealed starter clearing for the first compound.', 'info');
    this.hud.logEvent('Press B for build mode, click objects in the panel.', 'info');
    this.hud.logEvent('Press T for tech tree, R for rituals, M for missions.', 'info');

    // Populate build panel
    this.setupBuildPanel();

    // Input callbacks
    this.input.onTileClick = (tile, event) => this.onTileClick(tile.x, tile.y, event);
    this.input.onTileHover = (tile) => this.onTileHover(tile.x, tile.y);
    this.input.onDragStart = (tile) => {
      if (this.input.getMode() === 'demolish') {
        this.updateDemolishPreview(tile.x, tile.y, tile.x, tile.y);
      } else {
        this.updateBuildPreview(tile.x, tile.y, tile.x, tile.y);
      }
    };
    this.input.onDragUpdate = (start, end) => {
      if (this.input.getMode() === 'demolish') {
        this.updateDemolishPreview(start.x, start.y, end.x, end.y);
      } else {
        this.updateBuildPreview(start.x, start.y, end.x, end.y);
      }
    };
    this.input.onDragEnd = (start, end) => {
      const mode = this.input.getMode();
      this.sceneMgr.clearBuildPreview();
      this.hud.clearBuildStatus();
      if (mode === 'demolish') {
        this.onDemolishDragEnd(start.x, start.y, end.x, end.y);
      } else {
        this.onBuildDragEnd(start.x, start.y, end.x, end.y);
      }
    };

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Setup HUD button click handlers
    this.setupHUDInteractions();

    // Save system
    this.saveSystem = new SaveSystem({
      volume: this.settingsData.masterVolume / 100,
      autoSaveInterval: 300,
      showTutorial: true,
    });

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

      /* SciFi sprite image rendering — crisp pixel art */
      .hud-stat-icon, .hud-need-icon {
        image-rendering: crisp-edges;
        width: 20px; height: 20px;
        flex-shrink: 0;
        filter: brightness(0.9) sepia(0.3) hue-rotate(-20deg) saturate(0.8);
      }

      /* Resource Bar — top center, sprite panel background */
      .hud-resource-bar {
        position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
        display: flex; gap: 12px; padding: 10px 24px;
        background: rgba(12,18,30,0.88);
        border: 1px solid rgba(100, 100, 160, 0.4);
        border-radius: 6px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(168,85,247,0.1);
      }
      .hud-stat {
        display: flex; align-items: center; gap: 6px;
        font-weight: 600; white-space: nowrap; font-size: 12px;
        flex-direction: column; gap: 2px;
        min-width: 70px;
      }
      .hud-stat-icon {
        width: 18px; height: 18px;
      }
      .hud-stat-value {
        font-size: 11px; text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      }
      .hud-stat-bar {
        width: 60px; height: 4px;
        background: rgba(0,0,0,0.5);
        border-radius: 2px; overflow: hidden;
        border: 1px solid rgba(100,100,160,0.2);
      }
      .hud-stat-bar-fill {
        height: 100%; border-radius: 2px;
        transition: width 0.3s ease;
        box-shadow: 0 0 4px currentColor;
      }

      /* Build Bar — bottom center, horizontal category buttons (Prison Architect style) */
      .hud-build-bar {
        position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
        display: flex; flex-direction: row; flex-wrap: nowrap; gap: 4px; padding: 6px 8px;
        max-width: calc(100vw - 20px);
        overflow-x: auto;
        overflow-y: hidden;
        background: rgba(12,18,30,0.90);
        border: 1px solid rgba(80, 120, 180, 0.5);
        border-bottom: none;
        border-radius: 8px 8px 0 0;
        pointer-events: auto;
        backdrop-filter: blur(10px);
        box-shadow: 0 -2px 16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(120,160,220,0.15);
        z-index: 10;
      }
      .hud-build-cat {
        display: flex; flex-direction: column; align-items: center; gap: 2px;
        padding: 8px 14px; border-radius: 6px; cursor: pointer;
        transition: all 0.15s; min-width: 64px;
        background: rgba(0,0,0,0.25);
        border: 1px solid transparent;
      }
      .hud-build-cat:hover {
        background: rgba(50, 80, 130, 0.5);
        border-color: rgba(100, 150, 220, 0.3);
      }
      .hud-build-cat.active {
        background: rgba(40, 80, 160, 0.6);
        border-color: rgba(120, 180, 255, 0.6);
        box-shadow: 0 0 12px rgba(80, 140, 220, 0.3), inset 0 1px 0 rgba(150,200,255,0.2);
      }
      .hud-build-cat-icon { font-size: 22px; line-height: 1; }
      .hud-build-cat-label {
        font-size: 10px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.5px; color: #a0b8d8;
      }
      .hud-build-cat.active .hud-build-cat-label { color: #e0f0ff; }

      /* Build Items — horizontal strip panel above the bottom bar */
      .hud-build-items {
        position: absolute; bottom: 72px; left: 50%; transform: translateX(-50%);
        display: flex; flex-direction: row; flex-wrap: nowrap; align-items: stretch;
        gap: 6px; padding: 8px 10px;
        overflow-x: auto; overflow-y: hidden;
        background: rgba(12,18,30,0.92);
        border: 1px solid rgba(80, 120, 180, 0.4);
        border-radius: 8px;
        pointer-events: auto;
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(120,160,220,0.1);
        max-width: 90vw; z-index: 9;
      }
      .hud-build-item {
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 7px 9px; width: 76px; min-width: 76px; flex: 0 0 76px;
        border-radius: 6px; cursor: pointer;
        transition: all 0.12s;
        background: rgba(0,0,0,0.3);
        border: 1px solid rgba(60, 80, 120, 0.2);
      }
      .hud-build-item:hover {
        background: rgba(50, 80, 140, 0.5);
        border-color: rgba(100, 160, 240, 0.4);
        transform: translateY(-1px);
      }
      .hud-build-item.selected {
        background: rgba(60, 120, 200, 0.5);
        border-color: rgba(140, 200, 255, 0.7);
        box-shadow: 0 0 10px rgba(80, 150, 240, 0.4);
      }
      .hud-build-item-icon { font-size: 24px; line-height: 1; }
      .hud-build-item-label {
        font-size: 10px; font-weight: 500; text-align: center;
        color: #b0c4e0; line-height: 1.2;
      }
      .hud-build-item-cost {
        font-size: 10px; font-weight: 700; color: #fbbf24;
      }

      .hud-build-status {
        position: absolute;
        left: 50%;
        bottom: 148px;
        transform: translateX(-50%);
        display: none;
        max-width: min(720px, calc(100vw - 32px));
        padding: 7px 12px;
        background: rgba(12,18,30,0.96);
        border: 1px solid rgba(100,140,190,0.5);
        border-radius: 6px;
        color: #dbeafe;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
        pointer-events: none;
        z-index: 14;
        box-shadow: 0 3px 14px rgba(0,0,0,0.55);
      }
      .hud-build-status[data-state="valid"] {
        border-color: rgba(74,222,128,0.8);
        color: #bbf7d0;
      }
      .hud-build-status[data-state="invalid"] {
        border-color: rgba(248,113,113,0.85);
        color: #fecaca;
      }

      /* Legacy Build Panel — left side (hidden, kept for compat) */
      .hud-build-panel {
        position: absolute; top: 60px; left: 8px;
        width: 200px; max-height: 70vh; overflow-y: auto;
        padding: 10px; display: none;
        background: rgba(15,15,30,0.92); border: 1px solid rgba(100,100,160,0.4);
        border-radius: 6px; pointer-events: auto;
      }
      .hud-build-entry {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; margin: 2px 0;
        border-radius: 4px; cursor: pointer;
        transition: background 0.15s;
        background: rgba(0,0,0,0.2);
      }
      .hud-build-entry:hover {
        background: rgba(80, 80, 140, 0.4);
        box-shadow: inset 0 0 0 1px rgba(168,85,247,0.2);
      }
      .hud-build-entry.selected {
        background: rgba(168, 85, 247, 0.25);
        border: 1px solid rgba(168, 85, 247, 0.5);
        box-shadow: 0 0 8px rgba(168,85,247,0.2);
      }
      .hud-build-icon { font-size: 18px; }
      .hud-build-label { flex: 1; font-size: 12px; }
      .hud-build-cost { color: #fbbf24; font-size: 11px; font-weight: 600; }

      /* Inspector — right side, sprite panel background */
      .hud-inspector {
        position: absolute; top: 60px; right: 8px;
        width: 240px; padding: 14px;
        background: rgba(12,18,30,0.90);
        border: 1px solid rgba(100, 100, 160, 0.4);
        border-radius: 6px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(168,85,247,0.08);
        display: none;
      }
      .hud-inspector-name { font-size: 16px; font-weight: 700; margin-bottom: 2px; color: #a855f7; text-shadow: 0 0 8px rgba(168,85,247,0.3); }
      .hud-inspector-role { font-size: 11px; color: #888; margin-bottom: 8px; }
      .hud-inspector-health { font-size: 12px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
      .hud-inspector-health .hud-need-bar { flex: 1; }
      .hud-inspector-needs { font-size: 11px; line-height: 1.6; margin-bottom: 6px; }
      .hud-inspector-need-row {
        display: flex; align-items: center; gap: 6px; margin: 3px 0;
      }
      .hud-need-icon {
        width: 16px; height: 16px;
        filter: brightness(0.9) sepia(0.3) hue-rotate(-20deg) saturate(0.8);
      }
      .hud-need-label { min-width: 50px; color: #aaa; }
      .hud-need-bar {
        flex: 1; height: 6px; background: rgba(0,0,0,0.5);
        border-radius: 3px; overflow: hidden;
        border: 1px solid rgba(100,100,160,0.2);
      }
      .hud-need-bar-fill {
        height: 100%; background: linear-gradient(90deg, #3b82f6, #a855f7);
        border-radius: 3px; transition: width 0.3s ease;
      }
      .hud-need-value { min-width: 40px; text-align: right; color: #ccc; font-size: 10px; }
      .hud-inspector-job { font-size: 11px; color: #aaa; margin-bottom: 4px; }
      .hud-inspector-traits { font-size: 11px; color: #fbbf24; font-style: italic; }
      .hud-pawn-state { font-size: 10px; color: #93c5fd; margin: 0 0 8px; text-transform: capitalize; }
      .hud-pawn-section { margin-top: 8px; padding-top: 7px; border-top: 1px solid rgba(100,140,200,0.18); font-size: 10px; color: #cbd5e1; }
      .hud-pawn-section > b { display: block; margin-bottom: 4px; color: #93a4bd; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }
      .hud-pawn-chip-grid { display: flex; flex-wrap: wrap; gap: 4px; }
      .hud-pawn-chip { padding: 2px 5px; border-radius: 4px; background: rgba(40,55,80,.65); color: #dbeafe; text-transform: capitalize; }


      /* Event Log — bottom right, sprite panel background */
      .hud-event-log {
        position: absolute; bottom: 50px; right: 8px;
        width: 320px; max-height: 180px; overflow-y: auto;
        padding: 10px;
        background: rgba(12,18,30,0.90);
        border: 1px solid rgba(100, 100, 160, 0.4);
        border-radius: 6px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.6);
      }
      .hud-log-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      .hud-log-title {
        font-size: 11px;
        font-weight: 700;
        color: #cbd5e1;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
      .hud-log-toggle {
        width: 24px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(100,120,160,0.35);
        border-radius: 4px;
        color: #cbd5e1;
        background: rgba(255,255,255,0.05);
        cursor: pointer;
      }
      .hud-log-toggle:hover {
        background: rgba(255,255,255,0.10);
      }
      .hud-event-log.collapsed {
        width: 150px;
        max-height: none;
        overflow: hidden;
        padding: 7px 9px;
      }
      .hud-event-log.collapsed .hud-log-header {
        margin-bottom: 0;
      }
      .hud-log-entry {
        font-size: 11px; padding: 2px 0; line-height: 1.4;
        text-shadow: 0 1px 2px rgba(0,0,0,0.6);
      }
      .hud-log-info { color: #aaa; }
      .hud-log-warning { color: #fbbf24; }
      .hud-log-danger { color: #ef4444; font-weight: 600; }
      .hud-log-success { color: #10b981; }

      /* Time Controls — bottom center, sprite banner background */
      .hud-time-controls {
        position: absolute; top: 220px; right: 8px;
        display: flex; gap: 6px; align-items: center; padding: 7px 10px;
        background: rgba(12,18,30,0.94);
        border: 1px solid rgba(110, 150, 210, 0.55);
        border-radius: 6px; pointer-events: auto;
        box-shadow: 0 2px 12px rgba(0,0,0,0.55);
        z-index: 12;
      }
      .hud-time-btn {
        min-width: 38px;
        background: rgba(0,0,0,0.28); border: 1px solid rgba(100,130,180,0.35);
        color: #dbeafe; padding: 5px 8px; border-radius: 4px;
        cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.15s;
      }
      .hud-time-btn:hover { background: rgba(80,80,140,0.4); }
      .hud-time-btn.active { background: rgba(168,85,247,0.3); border-color: rgba(168,85,247,0.5); color: #fff; box-shadow: 0 0 8px rgba(168,85,247,0.2); }
      .hud-time { font-size: 13px; font-weight: 700; color: #f1f5f9; margin-right: 8px; white-space: nowrap; }

      /* Responsive HUD scaling */
      @media (max-width: 1200px) {
        .hud-resource-bar {
          gap: 7px;
          padding: 8px 12px;
          max-width: calc(100vw - 24px);
          overflow-x: auto;
          overflow-y: hidden;
        }
        .hud-stat { min-width: 58px; }
        .hud-stat-value { font-size: 10px; }

        .hud-build-bar { max-width: calc(100vw - 18px); }
        .hud-build-cat {
          min-width: 56px;
          padding: 7px 10px;
          flex: 0 0 auto;
        }

        .hud-build-items {
          bottom: 66px;
          max-width: calc(100vw - 18px);
        }

        .hud-inspector { width: min(230px, calc(100vw - 24px)); }
        .hud-event-log { width: min(300px, calc(100vw - 24px)); }
      }

      @media (max-width: 800px) {
        .hud-resource-bar {
          top: 54px;
          padding: 6px 8px;
          gap: 5px;
        }
        .hud-stat { min-width: 48px; }
        .hud-stat-icon { width: 16px; height: 16px; }
        .hud-stat-bar { width: 46px; }

        .hud-build-cat {
          min-width: 48px;
          padding: 6px 8px;
        }
        .hud-build-cat-icon { font-size: 18px; }
        .hud-build-cat-label { font-size: 9px; }

        .hud-build-items {
          bottom: 60px;
          padding: 6px 8px;
        }
        .hud-build-item {
          width: 68px;
          min-width: 68px;
          flex-basis: 68px;
          padding: 6px 7px;
        }
        .hud-build-item-icon { font-size: 20px; }

        .hud-inspector {
          top: 112px;
          right: 6px;
        }
        .hud-event-log { display: none; }
        .hud-time-controls { top: 172px; right: 8px; padding: 6px 8px; }
        .hud-time { font-size: 11px; }
      }

      /* Tooltip */
      .hud-tooltip {
        position: absolute; padding: 6px 10px;
        background: rgba(15, 15, 30, 0.95);
        border: 1px solid rgba(100, 100, 160, 0.3);
        border-radius: 4px; font-size: 11px;
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

      /* SciFi cursor — apply to game canvas and HUD */
      #game-canvas, #hud {
        cursor: url('./assets/ui/scifi_cursor.png') 4 4, auto;
      }
    `;
    document.head.appendChild(style);
  }

  private setupBuildPanel(): void {
    // Define build categories (Prison Architect style bottom bar)
    const categories: BuildCategory[] = [
      { id: 'structure', label: 'Build', icon: '🧱' },
      { id: 'objects', label: 'Objects', icon: '📦' },
      { id: 'ritual', label: 'Ritual', icon: '🔮' },
      { id: 'rooms', label: 'Room Purpose', icon: '🏠' },
      { id: 'decor', label: 'Decor', icon: '🎨' },
      { id: 'harvest', label: 'Harvest', icon: '🪓' },
      { id: 'zones', label: 'Zones', icon: '▦' },
      { id: 'demolish', label: 'Demolish', icon: '❌' },
    ];
    this.hud.setBuildCategories(categories);

    // Build all items grouped by category
    const allObjects = DataManager.getObjects();
    this.buildEntries = [
      { id: 'wall', label: 'Wall', icon: '🧱', cost: 5, category: 'structure' },
      { id: 'floor', label: 'Floor', icon: '⬜', cost: 2, category: 'structure' },
      { id: 'door', label: 'Door', icon: '🚪', cost: 8, category: 'structure' },
      { id: 'harvest:tree', label: 'Chop Trees', icon: '🌲', cost: 0, category: 'harvest' },
      { id: 'harvest:rock', label: 'Mine Rock', icon: '🪨', cost: 0, category: 'harvest' },
      { id: 'harvest:food', label: 'Gather Food', icon: '🫐', cost: 0, category: 'harvest' },
      { id: 'zone:stockpile', label: 'Stockpile', icon: '▦', cost: 0, category: 'zones' as BuildPanelEntry['category'] },
      ...DataManager.getRooms().map(room => ({
        id: `room:${room.id}`,
        label: room.name,
        icon: '🏠',
        cost: 0,
        category: 'rooms' as BuildPanelEntry['category'],
      })),
      {
        id: 'room:clear',
        label: 'Clear Purpose',
        icon: '🧽',
        cost: 0,
        category: 'rooms' as BuildPanelEntry['category'],
      },
      ...allObjects.map(obj => ({
        id: obj.id,
        label: obj.name,
        icon: obj.category === 'ritual' ? '🔮' : obj.category === 'kitchen' ? '🍲' : obj.category === 'furniture' ? '🛏️' : obj.category === 'research' ? '📚' : obj.category === 'storage' ? '📦' : obj.category === 'decor' ? '🔥' : obj.category === 'wellness' ? '🧘' : '📦',
        cost: obj.cost,
        category: obj.category === 'ritual' ? 'ritual' : 'objects' as BuildPanelEntry['category'],
      })),
      // Decor items for room prestige
      ...Object.values(DECOR_ITEMS).filter(d => !d.missionOnly).map(d => ({
        id: `decor_${d.id}`,
        label: d.name,
        icon: '🎨',
        cost: d.cost,
        category: 'decor' as BuildPanelEntry['category'],
      })),
    ];

    // Also keep legacy panel populated (hidden, but available if needed)
    this.hud.setBuildPanel(this.buildEntries);
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case 'b':
          this.openBuildCategory('structure');
          this.hud.logEvent('Build mode: select an item, then click the map.', 'info');
          break;
        case 'x':
          this.openBuildCategory('demolish');
          this.hud.logEvent('Demolish mode: click to remove.', 'info');
          break;
        case 'escape':
          if (this.gameState === 'playing') {
            if (this.input.getMode() !== 'select') {
              this.closeBuildMenu();
            } else {
              this.openPauseMenu();
            }
          } else if (this.gameState === 'paused') {
            this.closePauseMenu();
          }
          break;
        case 't':
          this.openTechTreePanel();
          break;
        case 'r':
          if (this.input.getMode() === 'build' && this.selectedBuildItem && !this.selectedBuildItem.startsWith('room:')) {
            const objDef = DataManager.getObject(this.selectedBuildItem);
            if (objDef) {
              this.selectedBuildRotation = (this.selectedBuildRotation + Math.PI / 2) % (Math.PI * 2);
              const degrees = Math.round(this.selectedBuildRotation * 180 / Math.PI);
              this.hud.setBuildStatus(`Rotation: ${degrees}° · click to place blueprint · R rotates`, 'info');
            } else {
              this.showRitualMenu();
            }
          } else {
            this.showRitualMenu();
          }
          break;
        case 'm':
          this.openMissionPanel();
          break;
        case 'j':
          this.openWorkPanel();
          break;
        case '?':
          this.showControlsHelp();
          break;
        case ' ': // Space
          e.preventDefault();
          this.togglePause();
          break;
        case '1':
          this.setTimeMode('speed1');
          break;
        case '2':
          this.setTimeMode('speed2');
          break;
        case '3':
          this.setTimeMode('speed3');
          break;
      }
    });
  }

  private setupHUDInteractions(): void {
    // Build category bar click handler (bottom bar)
    const buildBar = this.hud['buildBar'];
    if (buildBar) {
      buildBar.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const cat = target.closest('.hud-build-cat') as HTMLElement;
        if (!cat) return;
        const catId = cat.getAttribute('data-cat');
        if (!catId) return;
        this.openBuildCategory(catId);
      });
    }

    // Build items grid click handler (panel above bar)
    const buildItems = this.hud['buildItems'];
    if (buildItems) {
      buildItems.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest('.hud-build-item') as HTMLElement;
        if (!item) return;
        const id = item.getAttribute('data-id');
        const cost = parseInt(item.getAttribute('data-cost') || '0');
        if (!id) return;

        this.selectedBuildRotation = 0;

        if (this.activeBuildCategory === 'demolish') {
          this.input.setMode('demolish');
          this.selectedBuildItem = null;
        } else {
          this.input.setMode('build');
          this.selectedBuildItem = id;
          const label = item.querySelector('.hud-build-item-label')?.textContent ?? id;
          if (id === 'room:clear') {
            this.hud.logEvent('Clear Purpose: drag over an enclosed room to remove its optional room-purpose override.', 'info');
            this.hud.setBuildStatus('Drag over an enclosed room to clear its purpose override.', 'info');
          } else if (id.startsWith('harvest:')) {
            const harvestLabel =
              id === 'harvest:tree' ? 'trees for Materials' :
              id === 'harvest:rock' ? 'rocks for Materials' :
              'bushes for Food';
            this.hud.logEvent(`Harvest order: drag over ${harvestLabel}.`, 'info');
            this.hud.setBuildStatus(`Drag a rectangle over ${harvestLabel} to designate work.`, 'info');
          } else if (id.startsWith('room:')) {
            const roomDef = DataManager.getRoom(id.slice(5));
            this.hud.logEvent(
              `Optional room-purpose override: ${label}. Rooms are created automatically by enclosed walls/doors and normally infer purpose from furnishings.`,
              'info',
            );
            this.hud.setBuildStatus(
              `Drag over an enclosed room to assign ${label} (minimum ${roomDef?.minSize ?? 1} square units).`,
              'info',
            );
          } else {
            const instruction =
              id === 'wall' ? 'Drag to plan a wall line.' :
              id === 'floor' ? 'Drag a rectangle to plan floor construction.' :
              id === 'door' ? 'Click a tile beside a wall to plan a door.' :
              'Click a tile to place a construction blueprint. Press R to rotate.';
            this.hud.logEvent(`Selected: ${label} (${cost}g). ${instruction}`, 'info');
            this.hud.setBuildStatus(instruction, 'info');
          }
          this.audio.play('ui-select');
        }
        this.hud.highlightBuildItem(id);
      });
    }

    // Legacy build panel click handlers (kept for compat)
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

  }

  private highlightBuildPanel(id: string | null): void {
    // Update both legacy panel and new item grid
    const panel = this.hud['buildPanel'];
    if (panel) {
      panel.querySelectorAll('.hud-build-entry').forEach(el => {
        const elId = (el as HTMLElement).getAttribute('data-id');
        el.classList.toggle('selected', elId === id);
      });
    }
    this.hud.highlightBuildItem(id);
  }

  /**
   * Open a build category — shows items in the grid panel above the bottom bar.
   */
  private openBuildCategory(categoryId: string): void {
    this.activeBuildCategory = categoryId;

    if (categoryId === 'demolish') {
      this.input.setMode('demolish');
      this.selectedBuildItem = null;
      this.hud.setBuildItems([
        { id: 'demolish_tool', label: 'Demolish', icon: '❌', cost: 0, category: 'demolish' },
      ], categoryId);
      this.hud.highlightBuildItem('demolish_tool');
      this.hud.logEvent('Demolish mode: click a built tile or object to remove it.', 'info');
      return;
    }

    // Filter items by category
    const items = this.buildEntries.filter(e => e.category === categoryId);
    this.hud.setBuildItems(items, categoryId);
    this.input.setMode('build');

    // Auto-select first item
    if (items.length > 0) {
      this.selectedBuildItem = items[0].id;
      this.hud.highlightBuildItem(items[0].id);
    }
  }

  /**
   * Close the build menu entirely — return to select mode.
   */
  private closeBuildMenu(): void {
    this.input.setMode('select');
    this.selectedBuildItem = null;
    this.selectedBuildRotation = 0;
    this.activeBuildCategory = null;
    this.selectedEntity = null;
    this.sceneMgr.setSelectedFollower(null);
    this.hud.hideBuildItems();
    this.hud.hideInspector();
    this.hud.highlightBuildItem(null);
    this.hud.clearBuildStatus();
    this.sceneMgr.clearBuildPreview();
  }

  private setTimeMode(mode: TimeControlMode): void {
    this.timeMode = mode;
    this.timeScale =
      mode === 'pause' ? 0 :
      mode === 'speed2' ? 2 :
      mode === 'speed3' ? 3 : 1;
    this.hud.setTimeMode(mode);
  }

  private togglePause(): void {
    if (this.timeMode === 'pause') {
      this.setTimeMode('speed1');
    } else {
      this.setTimeMode('pause');
    }
  }

  private showControlsHelp(): void {
    this.dialog.show({
      title: 'Controls',
      icon: '⌨️',
      body: [
        '<p><b>Move camera:</b> WASD or Arrow Keys</p>',
        '<p><b>Zoom:</b> Mouse Wheel or +/-</p>',
        '<p><b>Rotate:</b> Q / E or right-drag</p>',
        '<p><b>Pan:</b> Middle-mouse drag</p>',
        '<p><b>Recenter:</b> Home</p>',
        '<p><b>Build:</b> B · <b>Demolish:</b> X · <b>Cancel:</b> Right-click / Esc</p>',
        '<p><b>Speed:</b> Space pause · 1 = 1× · 2 = 2× · 3 = 3×</p>',
        '<p><b>Jobs / Work:</b> J · <b>Tech:</b> T · <b>Missions:</b> M · <b>Rituals:</b> R</p>',
      ].join(''),
      buttons: [{ label: 'Got it', style: 'primary' }],
    });
  }

  private openWorkPanel(): void {
    const entities = this.world.query([FollowerAI, Skills, WorkPreferences]);
    const cultists = entities.map((entityId) => {
      const ai = this.world.getComponent(entityId, FollowerAI)!;
      const skills = this.world.getComponent(entityId, Skills)!;
      const prefs = this.world.getComponent(entityId, WorkPreferences)!;
      return {
        id: entityId,
        name: this.followerNames.get(entityId) ?? `Cultist ${entityId}`,
        tier: ai.tier,
        role: prefs.role,
        skills: {
          cook: skills.cooking,
          research: skills.research,
          pray: skills.faith,
          build: skills.construction,
          clean: Math.max(1, Math.round((skills.construction + skills.social) / 2)),
          haul: skills.construction,
          harvest: skills.construction,
        },
        priorities: { ...prefs.priorities },
      };
    });
    this.hud.showWorkPanel({ cultists });
  }

  private setWorkRole(entityId: number, role: WorkRole): void {
    const prefs = this.world.getComponent(entityId, WorkPreferences);
    if (!prefs) return;
    prefs.applyRole(role);
    this.hud.logEvent(`${this.followerNames.get(entityId) ?? 'Cultist'} assigned role: ${role}.`, 'info');
    this.openWorkPanel();
  }

  private setWorkPriority(entityId: number, job: WorkJobKey, priority: WorkPriority): void {
    const prefs = this.world.getComponent(entityId, WorkPreferences);
    if (!prefs) return;
    prefs.setPriority(job, priority);
    this.openWorkPanel();
  }

  private autoAssignWorkRoles(): void {
    const entities = this.world.query([Skills, WorkPreferences]);
    for (const entityId of entities) {
      const skills = this.world.getComponent(entityId, Skills)!;
      const prefs = this.world.getComponent(entityId, WorkPreferences)!;
      const ranked: { role: WorkRole; score: number }[] = [
        { role: 'researcher', score: skills.research },
        { role: 'cook', score: skills.cooking },
        { role: 'devotee', score: Math.max(skills.faith, skills.social) },
        { role: 'builder', score: skills.construction },
        { role: 'caretaker', score: Math.round((skills.social + skills.construction) / 2) },
      ];
      ranked.sort((a, b) => b.score - a.score);
      prefs.applyRole(ranked[0]?.role ?? 'generalist');
    }
    this.hud.logEvent('Roles auto-assigned from follower skills.', 'success');
    this.openWorkPanel();
  }

  private openMissionPanel(): void {
    const entities = this.world.query([Needs, FollowerAI]);
    const cultists = entities.map((entityId) => {
      const ai = this.world.getComponent(entityId, FollowerAI)!;
      const skills = this.world.getComponent(entityId, Skills) ?? new Skills(entityId);
      return {
        id: entityId,
        name: this.followerNames.get(entityId) ?? `Cultist ${entityId}`,
        tier: ai.tier,
        skills: {
          cooking: skills.cooking,
          research: skills.research,
          construction: skills.construction,
          faith: skills.faith,
          combat: skills.combat,
          social: skills.social,
        },
        onMission: this.missionSystem.isOnMission(entityId, this.world),
      };
    });

    this.hud.showMissionPanel({
      cultists,
      activeMissions: this.missionSystem.getActiveMissions(),
    });
  }

  private startMissionFromPanel(templateId: string, cultistIds: number[]): void {
    const result = this.missionSystem.startMission(templateId, cultistIds, this.world);
    if (result.success) {
      this.hud.logEvent(`Mission launched: ${templateId} with ${cultistIds.length} cultist(s).`, 'success');
      this.audio.play('ui-select');
    } else {
      this.hud.logEvent(`Mission could not start: ${result.reason ?? 'unknown reason'}`, 'warning');
    }
    this.openMissionPanel();
  }

  private openTechTreePanel(): void {
    this.hud.showTechTreePanel({
      unlockedIds: this.techTree.getUnlocked().map(node => node.id),
      influence: this.cultInfluence,
      faith: this.cultFaith,
    });
  }

  private unlockTechFromPanel(techId: string): void {
    const node = this.techTree.getTree().find(candidate => candidate.id === techId);
    if (!node) {
      this.hud.logEvent('Unknown research node.', 'warning');
      return;
    }

    const result = this.techTree.unlock(techId, this.cultInfluence, this.cultFaith);
    if (result.success) {
      this.cultInfluence -= node.cost.influence;
      this.hud.logEvent(`Research completed: ${node.name}`, 'success');
      this.audio.play('level-up');
    } else {
      this.hud.logEvent(`Research blocked: ${result.reason ?? 'requirements not met'}`, 'warning');
    }
    this.openTechTreePanel();
    this.updateHUD();
  }

  private openSchedulePanel(): void {
    const entities = this.world.query([FollowerAI]);
    const cultists = entities.map((entityId) => {
      const ai = this.world.getComponent(entityId, FollowerAI)!;
      const schedule = this.world.getComponent(entityId, Schedule);
      const health = this.world.getComponent(entityId, Health);
      const activity: 'working' | 'eating' | 'free' | 'sleeping' =
        ai.state === 'working' ? 'working' :
        ai.state === 'sleeping' ? 'sleeping' :
        ai.state === 'needs' ? 'eating' : 'free';

      return {
        id: entityId,
        name: this.followerNames.get(entityId) ?? `Cultist ${entityId}`,
        tier: ai.tier,
        shift: (schedule?.shift ?? 'morning') as Shift,
        activity,
        health: health?.hp ?? 100,
      };
    });

    this.hud.showSchedulePanel({
      cultists,
      currentHour: this.currentHour,
    });
  }

  private showRitualMenu(): void {
    const available = this.ritualSystem.getAvailableRituals();
    const entities = this.world.query([Needs, FollowerAI]);
    const active = this.ritualSystem.getActiveRituals();

    if (active.length > 0) {
      this.dialog.alert('Ritual in Progress', 'Your cult is already performing a ritual. Let it finish before beginning another.', '🔮');
      return;
    }

    if (available.length === 0) {
      this.dialog.alert('No Rituals Available', 'Research and progress will unlock additional rituals.', '🔒');
      return;
    }

    this.dialog.show({
      title: 'Choose a Ritual',
      icon: '🔮',
      body: '<p>Rituals trade resources and follower time for powerful effects. Choose deliberately.</p>',
      modal: true,
      buttons: available.map((ritual) => {
        const check = this.ritualSystem.canStartRitual(
          ritual.id,
          entities,
          this.cultInfluence,
          this.cultWealth,
        );
        return {
          label: `${check.ok ? '' : '🔒 '}${ritual.name}`,
          style: check.ok ? 'primary' as const : 'default' as const,
          onClick: () => {
            if (!check.ok) {
              this.hud.logEvent(`${ritual.name}: ${check.reason ?? 'requirements not met'}`, 'warning');
              return;
            }
            const participants = entities.slice(0, ritual.minFollowers);
            const started = this.ritualSystem.startRitual(ritual.id, participants);
            if (started) {
              if (ritual.faithCost > 0 && participants.length > 0) {
                const faithPerParticipant = ritual.faithCost / participants.length;
                for (const entityId of participants) {
                  const needs = this.world.getComponent(entityId, Needs);
                  if (needs) needs.faith = Math.max(0, needs.faith - faithPerParticipant);
                }
              }
              if (ritual.wealthCost) this.cultWealth -= ritual.wealthCost;
              this.hud.logEvent(`Ritual begun: ${ritual.name}`, 'success');
              this.updateHUD();
            }
          },
        };
      }),
    });
  }

  private spawnFollowers(count: number): void {
    // Spawn near map center
    const centerX = Math.floor(this.map.width / 2);
    const centerY = Math.floor(this.map.height / 2);
    let spawnX = centerX, spawnY = centerY;
    for (let y = centerY - 2; y <= centerY + 2; y++) {
      for (let x = centerX - 2; x <= centerX + 2; x++) {
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

    // The starting compound must always have enough visible space to build immediately.
    this.fogOfWar.revealArea(spawnX, spawnY, 15);
    this.sceneMgr.buildTiles();

    // Auto-assign shifts to new followers
    this.schedulingSystem.autoAssignShifts(this.world);
    this.sceneMgr.syncEntities();
  }

  private getBuildItemCost(item: string): number {
    if (item === 'wall') return 5;
    if (item === 'floor') return 2;
    if (item === 'door') return 8;
    return DataManager.getObject(item)?.cost ?? 0;
  }

  private getBuildMaterialCost(item: string): number {
    if (item === 'wall') return 3;
    if (item === 'floor') return 1;
    if (item === 'door') return 4;
    const moneyCost = this.getBuildItemCost(item);
    return moneyCost > 0 ? Math.max(1, Math.ceil(moneyCost / 5)) : 0;
  }

  private getReservedConstructionCost(): number {
    let total = 0;
    for (const blueprint of this.constructionBlueprints.values()) total += blueprint.cost;
    return total;
  }

  private getReservedConstructionMaterials(): number {
    let total = 0;
    for (const blueprint of this.constructionBlueprints.values()) total += blueprint.materialCost ?? 0;
    return total;
  }

  private getSpendableWealth(): number {
    return this.cultWealth - this.getReservedConstructionCost();
  }

  private getAvailableMaterials(): number {
    return this.gameInstanceState.resources.materials - this.getReservedConstructionMaterials();
  }

  private getConstructionBlueprintAt(
    x: number,
    y: number,
    orientation?: ConstructionOrientation,
  ): ConstructionBlueprint | null {
    for (const blueprint of this.constructionBlueprints.values()) {
      if (blueprint.x !== x || blueprint.y !== y) continue;
      if (orientation !== undefined && blueprint.orientation !== orientation) continue;
      return blueprint;
    }
    return null;
  }

  private hasPlannedWall(x: number, y: number, orientation: ConstructionOrientation): boolean {
    const planned = this.getConstructionBlueprintAt(x, y, orientation);
    return planned?.kind === 'wall';
  }

  private findDoorEdgeAtCell(x: number, y: number): BuildSelectionCoord | null {
    const candidates: BuildSelectionCoord[] = [
      { x, y, orientation: 'horizontal', space: 'construction' },
      { x, y: y + 1, orientation: 'horizontal', space: 'construction' },
      { x, y, orientation: 'vertical', space: 'construction' },
      { x: x + 1, y, orientation: 'vertical', space: 'construction' },
    ];
    return candidates.find(edge =>
      this.buildingSystem.hasWallEdge(edge.x, edge.y, edge.orientation!) ||
      this.hasPlannedWall(edge.x, edge.y, edge.orientation!)
    ) ?? null;
  }

  private getEdgesAroundConstructionCell(x: number, y: number): BuildSelectionCoord[] {
    return [
      { x, y, orientation: 'horizontal', space: 'construction' },
      { x, y: y + 1, orientation: 'horizontal', space: 'construction' },
      { x, y, orientation: 'vertical', space: 'construction' },
      { x: x + 1, y, orientation: 'vertical', space: 'construction' },
    ];
  }

  private cancelConstructionAtCell(x: number, y: number): number {
    const ids = new Set<string>();
    const exact = this.getConstructionBlueprintAt(x, y);
    if (exact) ids.add(exact.id);
    for (const edge of this.getEdgesAroundConstructionCell(x, y)) {
      const blueprint = this.getConstructionBlueprintAt(edge.x, edge.y, edge.orientation);
      if (blueprint) ids.add(blueprint.id);
    }

    for (const id of ids) {
      this.jobSystem.cancelJob(id);
      this.constructionBlueprints.delete(id);
    }
    if (ids.size > 0) {
      this.refreshConstructionBlueprintVisuals();
      this.updateHUD();
    }
    return ids.size;
  }

  private demolishEdgesAtCell(x: number, y: number): number {
    let removed = 0;
    for (const edge of this.getEdgesAroundConstructionCell(x, y)) {
      const result = this.buildingSystem.demolishEdge(edge.x, edge.y, edge.orientation!);
      if (result.success) removed++;
    }
    return removed;
  }

  private getBuildSelectionTiles(
    item: string,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): BuildSelectionCoord[] {
    if (item === 'wall') {
      const horizontal = Math.abs(endX - startX) >= Math.abs(endY - startY);
      const orientation: ConstructionOrientation = horizontal ? 'horizontal' : 'vertical';
      const cells: BuildSelectionCoord[] = [];

      if (horizontal) {
        const step = endX >= startX ? 1 : -1;
        for (let x = startX; ; x += step) {
          cells.push({ x, y: startY, orientation, space: 'construction' });
          if (x === endX) break;
        }
      } else {
        const step = endY >= startY ? 1 : -1;
        for (let y = startY; ; y += step) {
          cells.push({ x: startX, y, orientation, space: 'construction' });
          if (y === endY) break;
        }
      }
      return cells;
    }

    if (item === 'door') {
      const edge = this.findDoorEdgeAtCell(endX, endY);
      return edge ? [edge] : [{ x: endX, y: endY, orientation: 'horizontal', space: 'construction' }];
    }

    if (item === 'floor' || item === 'zone:stockpile') {
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);
      const cells: BuildSelectionCoord[] = [];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) cells.push({ x, y, space: 'construction' });
      }
      return cells;
    }

    if (item.startsWith('room:') || item.startsWith('harvest:')) {
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);
      const tiles: BuildSelectionCoord[] = [];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) tiles.push({ x, y, space: 'local' });
      }
      return tiles;
    }

    return [{ x: endX, y: endY, space: 'construction' }];
  }

  private isBuildTileValid(
    item: string,
    x: number,
    y: number,
    orientation?: ConstructionOrientation,
  ): boolean {
    const localTool = item.startsWith('room:') || item.startsWith('harvest:');
    const tile = localTool
      ? this.map.getTile(x, y)
      : this.buildingSystem.getTerrainTileForBuild(x, y);
    if (!tile) return false;

    if (item === 'room:clear') return tile.roomId !== null;
    if (item.startsWith('room:')) return tile.buildable;
    if (item.startsWith('harvest:')) {
      const orderId = `harvest:${item.slice(8)}:${x}:${y}`;
      if (this.harvestOrders.has(orderId)) return false;
      if (item === 'harvest:tree') return tile.decor === 'tree';
      if (item === 'harvest:rock') return tile.decor === 'rock';
      if (item === 'harvest:food') return tile.decor === 'bush';
      return false;
    }

    if (item === 'zone:stockpile') return tile.buildable;

    const existingBlueprint = this.getConstructionBlueprintAt(x, y, orientation);
    if (existingBlueprint && !(item === 'door' && existingBlueprint.kind === 'wall')) return false;
    if (!tile.buildable) return false;

    if (item === 'wall') {
      if (!orientation) return false;
      return !this.buildingSystem.hasWallEdge(x, y, orientation) &&
        !this.buildingSystem.hasDoorEdge(x, y, orientation);
    }

    if (item === 'door') {
      if (!orientation) return false;
      return this.buildingSystem.hasWallEdge(x, y, orientation) ||
        this.hasPlannedWall(x, y, orientation);
    }

    if (item === 'floor') {
      return !this.buildingSystem.floorTiles.has(`${x},${y}`);
    }

    return !this.buildingSystem.hasBlockingElementAt(x, y);
  }

  private getPreviewKind(item: string): ConstructionVisualKind | 'room' {
    if (item.startsWith('room:')) return 'room';
    if (item.startsWith('harvest:') || item === 'zone:stockpile') return 'floor';
    if (item === 'wall' || item === 'floor' || item === 'door') return item;
    return 'object';
  }

  private updateBuildPreview(startX: number, startY: number, endX: number, endY: number): void {
    if (this.input.getMode() !== 'build' || !this.selectedBuildItem) {
      this.sceneMgr.clearBuildPreview();
      this.hud.clearBuildStatus();
      return;
    }

    const item = this.selectedBuildItem;
    const selected = this.getBuildSelectionTiles(item, startX, startY, endX, endY);
    const preview: BuildPreviewTile[] = selected.map(pos => ({
      ...pos,
      valid: this.isBuildTileValid(item, pos.x, pos.y, pos.orientation),
    }));
    this.sceneMgr.showBuildPreview(preview, this.getPreviewKind(item));

    const validCount = preview.filter(pos => pos.valid).length;
    const invalidCount = preview.length - validCount;
    const isHarvest = item.startsWith('harvest:');
    const isZone = item.startsWith('zone:');
    const unitCost = item.startsWith('room:') || isHarvest || isZone ? 0 : this.getBuildItemCost(item);
    const unitMaterials = item.startsWith('room:') || isHarvest || isZone ? 0 : this.getBuildMaterialCost(item);
    const totalCost = validCount * unitCost;
    const totalMaterials = validCount * unitMaterials;
    const affordable = totalCost <= this.getSpendableWealth() && totalMaterials <= this.getAvailableMaterials();
    const label =
      item === 'room:clear' ? 'Clear Room' :
      item.startsWith('room:') ? DataManager.getRoom(item.slice(5))?.name ?? 'Room' :
      item === 'harvest:tree' ? 'Chop Trees' :
      item === 'harvest:rock' ? 'Mine Rock' :
      item === 'harvest:food' ? 'Gather Food' :
      item === 'zone:stockpile' ? 'Stockpile' :
      item === 'wall' ? 'Wall' :
      item === 'floor' ? 'Floor' :
      item === 'door' ? 'Door' :
      DataManager.getObject(item)?.name ?? item;

    const noun = item === 'wall' || item === 'door' ? 'segment' : 'cell';
    const parts = [label, `${validCount} ${noun}${validCount === 1 ? '' : 's'}`];
    if (unitCost > 0) parts.push(`${totalCost}g reserved`);
    if (unitMaterials > 0) parts.push(`${totalMaterials} Materials reserved`);
    if (invalidCount > 0) parts.push(`${invalidCount} blocked`);
    if (totalCost > this.getSpendableWealth()) parts.push('not enough wealth');
    if (totalMaterials > this.getAvailableMaterials()) parts.push('not enough Materials');

    this.hud.setBuildStatus(
      parts.join(' · '),
      validCount > 0 && invalidCount === 0 && affordable ? 'valid' : 'invalid',
    );
  }

  private refreshConstructionBlueprintVisuals(): void {
    this.sceneMgr.setConstructionBlueprints(
      Array.from(this.constructionBlueprints.values()).map(blueprint => ({
        id: blueprint.id,
        kind: blueprint.kind,
        x: blueprint.x,
        y: blueprint.y,
        orientation: blueprint.orientation,
        space: blueprint.space,
        rotation: blueprint.rotation,
      })),
    );
  }

  private postConstructionJob(blueprint: ConstructionBlueprint, priority: number = 9): void {
    const target = blueprint.space === 'construction'
      ? this.buildingSystem.toTerrainTile(blueprint.x, blueprint.y)
      : { x: blueprint.x, y: blueprint.y };
    const workTile = blueprint.kind === 'floor'
      ? target
      : this.findAdjacentWorkTile(target.x, target.y) ?? target;

    const duration =
      blueprint.kind === 'floor' ? 1.5 :
      blueprint.kind === 'wall' ? 3 :
      blueprint.kind === 'door' ? 2.5 : 4;

    this.jobSystem.postJob({
      id: blueprint.id,
      type: 'build',
      targetTile: workTile,
      priority,
      duration,
      requiredSkill: 'construction',
      minSkillLevel: 1,
    });
  }

  private queueConstructionBlueprint(
    kind: ConstructionKind,
    x: number,
    y: number,
    cost: number,
    objectId?: string,
    rotation: number = 0,
    orientation?: ConstructionOrientation,
    space: 'local' | 'construction' = 'construction',
  ): boolean {
    const existing = this.getConstructionBlueprintAt(x, y, orientation);
    if (existing && !(kind === 'door' && existing.kind === 'wall')) return false;

    const id = `construct:${this.nextConstructionBlueprintId++}`;
    const materialCost = this.getBuildMaterialCost(objectId ?? kind);
    const blueprint: ConstructionBlueprint = {
      id,
      kind,
      x,
      y,
      space,
      orientation,
      objectId,
      rotation,
      cost,
      materialCost,
    };
    this.constructionBlueprints.set(id, blueprint);
    this.postConstructionJob(blueprint);
    return true;
  }

  private queueConstructionSelection(item: string, tiles: BuildSelectionCoord[]): void {
    const validTiles = tiles.filter(pos => this.isBuildTileValid(item, pos.x, pos.y, pos.orientation));
    if (validTiles.length === 0) {
      this.hud.logEvent('No valid cells in that construction selection.', 'warning');
      return;
    }

    const cost = this.getBuildItemCost(item);
    const materialCost = this.getBuildMaterialCost(item);
    const totalCost = cost * validTiles.length;
    const totalMaterials = materialCost * validTiles.length;
    if (totalCost > this.getSpendableWealth()) {
      this.hud.logEvent(
        `Not enough available wealth. Need ${totalCost}g, have ${Math.floor(this.getSpendableWealth())}g after reservations.`,
        'warning',
      );
      return;
    }
    if (totalMaterials > this.getAvailableMaterials()) {
      this.hud.logEvent(
        `Not enough Materials. Need ${totalMaterials}, have ${Math.floor(this.getAvailableMaterials())} after reservations. Designate trees/rocks in Harvest.`,
        'warning',
      );
      return;
    }

    const kind: ConstructionKind =
      item === 'wall' ? 'wall' :
      item === 'floor' ? 'floor' :
      item === 'door' ? 'door' : 'object';

    let queued = 0;
    for (const pos of validTiles) {
      if (this.queueConstructionBlueprint(
        kind,
        pos.x,
        pos.y,
        cost,
        kind === 'object' ? item : undefined,
        kind === 'object' ? this.selectedBuildRotation : 0,
        pos.orientation,
        pos.space ?? 'construction',
      )) {
        queued++;
      }
    }

    if (queued > 0) {
      const label = item === 'wall' ? 'wall segment' : item === 'floor' ? 'floor cell' : item === 'door' ? 'door' : DataManager.getObject(item)?.name ?? item;
      this.hud.logEvent(
        `Queued ${queued} ${label}${queued === 1 ? '' : 's'} for construction (${queued * cost}g + ${queued * materialCost} Materials reserved).`,
        'info',
      );
      this.refreshConstructionBlueprintVisuals();
      this.updateHUD();
    }
  }

  private cancelConstructionBlueprintAt(
    x: number,
    y: number,
    orientation?: ConstructionOrientation,
  ): boolean {
    const blueprint = this.getConstructionBlueprintAt(x, y, orientation);
    if (!blueprint) return false;
    this.jobSystem.cancelJob(blueprint.id);
    this.constructionBlueprints.delete(blueprint.id);
    this.refreshConstructionBlueprintVisuals();
    this.updateHUD();
    this.hud.logEvent(`Cancelled construction blueprint at (${x}, ${y}).`, 'info');
    return true;
  }

  private refreshHarvestDesignationVisuals(): void {
    this.sceneMgr.setHarvestDesignations(Array.from(this.harvestOrders.values()));
  }

  private refreshLogisticsVisuals(): void {
    this.sceneMgr.setLogisticsVisuals(
      this.logisticsSystem.getStacks(),
      this.logisticsSystem.getStockpiles(),
      this.buildingSystem.subdivisions,
    );
  }

  private harvestOrderId(kind: SerializedHarvestOrder['kind'], x: number, y: number): string {
    return `harvest:${kind}:${x}:${y}`;
  }

  private postHarvestJob(order: SerializedHarvestOrder): void {
    const duration = order.kind === 'rock' ? 4 : order.kind === 'tree' ? 3 : 2;
    this.jobSystem.postJob({
      id: order.id,
      type: 'harvest',
      targetTile: { x: order.x, y: order.y },
      priority: 8,
      duration,
      requiredSkill: 'construction',
      minSkillLevel: 1,
    });
  }

  private designateHarvestArea(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    kind: SerializedHarvestOrder['kind'],
  ): void {
    const expectedDecor = kind === 'tree' ? 'tree' : kind === 'rock' ? 'rock' : 'bush';
    let queued = 0;

    for (const pos of this.getRectangleTiles(startX, startY, endX, endY)) {
      const tile = this.map.getTile(pos.x, pos.y);
      if (!tile || tile.decor !== expectedDecor) continue;

      const id = this.harvestOrderId(kind, pos.x, pos.y);
      if (this.harvestOrders.has(id)) continue;

      const order: SerializedHarvestOrder = { id, kind, x: pos.x, y: pos.y };
      this.harvestOrders.set(id, order);
      this.postHarvestJob(order);
      queued++;
    }

    this.refreshHarvestDesignationVisuals();

    if (queued === 0) {
      const label = kind === 'tree' ? 'trees' : kind === 'rock' ? 'rocks' : 'food bushes';
      this.hud.logEvent(`No undesignated ${label} were found in that area.`, 'info');
      return;
    }

    const output = kind === 'food' ? 'Food' : 'Materials';
    this.hud.logEvent(
      `Designated ${queued} resource${queued === 1 ? '' : 's'} for harvesting → ${output}.`,
      'success',
    );
    this.updateHUD();
  }

  private completeHarvestOrder(id: string): void {
    const order = this.harvestOrders.get(id);
    if (!order) return;

    const tile = this.map.getTile(order.x, order.y);
    const expectedDecor = order.kind === 'tree' ? 'tree' : order.kind === 'rock' ? 'rock' : 'bush';
    this.harvestOrders.delete(id);
    this.refreshHarvestDesignationVisuals();

    if (!tile || tile.decor !== expectedDecor) {
      this.hud.logEvent(`Harvest order at (${order.x}, ${order.y}) was cancelled because the resource is gone.`, 'info');
      return;
    }

    this.map.setDecor(order.x, order.y, 'none');
    if (order.kind === 'tree' || order.kind === 'rock') this.map.setOccupied(order.x, order.y, false);

    const kind: ItemKind = order.kind === 'food' ? 'food' : order.kind === 'rock' ? 'stone' : 'wood';
    const yieldAmount = order.kind === 'food' ? 8 : order.kind === 'rock' ? 14 : 10;
    this.logisticsSystem.addStack(kind, yieldAmount, order.x, order.y);
    this.showFloatingText(`+${yieldAmount} ${kind}`, order.x, order.y, order.kind === 'food' ? '#84cc16' : '#cbd5e1');
    this.hud.logEvent(
      `${order.kind === 'rock' ? 'Mined rock' : order.kind === 'tree' ? 'Chopped tree' : 'Gathered food'}: ${yieldAmount} ${kind} dropped for hauling.`,
      'success',
    );

    this.sceneMgr.buildTiles();
    this.refreshLogisticsVisuals();
    this.updateHUD();
  }

  private onJobCompleted(posting: JobPosting, entity: number): void {
    const logisticsResult = this.logisticsSystem.handleJobCompleted(
      posting,
      entity,
      this.world,
      this.gameInstanceState.resources,
    );
    if (logisticsResult.handled) {
      if (logisticsResult.message) this.hud.logEvent(logisticsResult.message, 'success');
      if (logisticsResult.changed) {
        this.refreshLogisticsVisuals();
        this.updateHUD();
      }
      return;
    }

    if (posting.id.startsWith('harvest:')) {
      this.completeHarvestOrder(posting.id);
      return;
    }
    if (!posting.id.startsWith('construct:')) return;
    const blueprint = this.constructionBlueprints.get(posting.id);
    if (!blueprint) return;

    let result: { success: boolean; message: string };
    if (blueprint.kind === 'wall' && blueprint.orientation) {
      result = this.buildingSystem.placeWallEdge(blueprint.x, blueprint.y, blueprint.orientation);
    } else if (blueprint.kind === 'floor') {
      result = this.buildingSystem.placeFloor(blueprint.x, blueprint.y);
    } else if (blueprint.kind === 'door' && blueprint.orientation) {
      result = this.buildingSystem.placeDoorEdge(blueprint.x, blueprint.y, blueprint.orientation);
    } else if (blueprint.objectId) {
      result = this.buildingSystem.placeObject(
        blueprint.x,
        blueprint.y,
        blueprint.objectId,
        blueprint.rotation ?? 0,
      );
    } else {
      result = { success: false, message: 'Missing construction orientation or object definition' };
    }

    if (!result.success) {
      if (blueprint.kind === 'door' && blueprint.orientation &&
          this.hasPlannedWall(blueprint.x, blueprint.y, blueprint.orientation)) {
        this.postConstructionJob(blueprint, 6);
        return;
      }

      this.constructionBlueprints.delete(blueprint.id);
      this.refreshConstructionBlueprintVisuals();
      this.hud.logEvent(`Construction failed at (${blueprint.x}, ${blueprint.y}): ${result.message}`, 'warning');
      return;
    }

    this.constructionBlueprints.delete(blueprint.id);
    this.refreshConstructionBlueprintVisuals();
    this.gameInstanceState.resources.materials = Math.max(
      0,
      this.gameInstanceState.resources.materials - (blueprint.materialCost ?? 0),
    );

    const local = blueprint.space === 'construction'
      ? this.buildingSystem.toTerrainTile(blueprint.x, blueprint.y)
      : { x: blueprint.x, y: blueprint.y };
    const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
    this.particles.spawnBuildDust(local.x + offset.x + 0.5, local.y + offset.z + 0.5);
    this.showFloatingText(`-${blueprint.cost}g`, local.x, local.y, '#fbbf24');
    this.audio.play('ui-build');

    if (blueprint.kind === 'object' && blueprint.objectId) {
      this.registerWorkstationJob(local.x, local.y, blueprint.objectId);
      this.inferAutomaticRoomAt(blueprint.x, blueprint.y);
      this.refreshRoomRequirementAt(local.x, local.y);
      if (blueprint.objectId.startsWith('decor_')) {
        this.handleDecorPlacement(local.x, local.y, blueprint.objectId.replace('decor_', ''));
      }
    }

    this.sceneMgr.buildTiles();
    this.sceneMgr.syncEntities();
    this.pathfinder.invalidateCache();
    this.pathfindSystem.invalidateCache();
    this.roomGraph.invalidate();
    this.updateHUD();
  }

  private getRectangleTiles(startX: number, startY: number, endX: number, endY: number): { x: number; y: number }[] {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const tiles: { x: number; y: number }[] = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) tiles.push({ x, y });
    }
    return tiles;
  }

  private canDemolishAt(x: number, y: number): boolean {
    if (this.getConstructionBlueprintAt(x, y)) return true;
    for (const edge of this.getEdgesAroundConstructionCell(x, y)) {
      if (this.getConstructionBlueprintAt(edge.x, edge.y, edge.orientation)) return true;
      if (this.buildingSystem.hasWallEdge(edge.x, edge.y, edge.orientation!)) return true;
      if (this.buildingSystem.hasDoorEdge(edge.x, edge.y, edge.orientation!)) return true;
    }
    const tile = this.buildingSystem.getTerrainTileForBuild(x, y);
    if (!tile) return false;
    return (
      this.buildingSystem.floorTiles.has(`${x},${y}`) ||
      this.buildingSystem.hasBlockingElementAt(x, y)
    );
  }

  private updateDemolishPreview(startX: number, startY: number, endX: number, endY: number): void {
    const tiles = this.getRectangleTiles(startX, startY, endX, endY);
    const removable = tiles.filter(tile => this.canDemolishAt(tile.x, tile.y));
    this.sceneMgr.showBuildPreview(
      tiles.map(tile => ({ ...tile, valid: false })),
      'floor',
    );
    this.hud.setBuildStatus(
      `Demolish · ${removable.length} removable tile${removable.length === 1 ? '' : 's'}`,
      removable.length > 0 ? 'invalid' : 'info',
    );
  }

  private onDemolishDragEnd(startX: number, startY: number, endX: number, endY: number): void {
    let removed = 0;
    let cancelled = 0;

    for (const cell of this.getRectangleTiles(startX, startY, endX, endY)) {
      cancelled += this.cancelConstructionAtCell(cell.x, cell.y);

      const result = this.buildingSystem.demolish(cell.x, cell.y);
      if (result.success) {
        this.jobSystem.cancelJob(`station:${cell.x}:${cell.y}`);
        removed++;
      }
      removed += this.demolishEdgesAtCell(cell.x, cell.y);
    }

    if (removed > 0) {
      this.audio.play('destroy');
      this.sceneMgr.buildTiles();
      this.sceneMgr.syncEntities();
      this.pathfinder.invalidateCache();
      this.pathfindSystem.invalidateCache();
      this.roomGraph.invalidate();
    }

    if (removed > 0 || cancelled > 0) {
      this.hud.logEvent(
        `Demolish order completed: ${removed} built element${removed === 1 ? '' : 's'} removed, ${cancelled} blueprint${cancelled === 1 ? '' : 's'} cancelled.`,
        'info',
      );
      this.updateHUD();
    } else {
      this.hud.logEvent('Nothing removable in that area.', 'info');
    }
  }

  private onBuildDragEnd(startX: number, startY: number, endX: number, endY: number): void {
    if (this.input.getMode() !== 'build' || !this.selectedBuildItem) return;

    const item = this.selectedBuildItem;
    if (item === 'room:clear') {
      const cleared = this.buildingSystem.clearRoomArea(startX, startY, endX, endY);
      if (cleared > 0) {
        this.hud.logEvent(`Cleared room designation from ${cleared} tile${cleared === 1 ? '' : 's'}.`, 'info');
        this.sceneMgr.buildTiles();
        this.updateHUD();
      } else {
        this.hud.logEvent('No designated room tiles in that area.', 'info');
      }
      return;
    }

    if (item.startsWith('room:')) {
      this.designateRoom(startX, startY, endX, endY, item.slice(5));
      return;
    }

    if (item.startsWith('harvest:')) {
      this.designateHarvestArea(startX, startY, endX, endY, item.slice(8) as SerializedHarvestOrder['kind']);
      return;
    }

    if (item === 'zone:stockpile') {
      const cells = this.getBuildSelectionTiles(item, startX, startY, endX, endY)
        .filter(pos => this.isBuildTileValid(item, pos.x, pos.y))
        .map(pos => ({ x: pos.x, y: pos.y }));
      const zone = this.logisticsSystem.designateStockpile(cells);
      if (zone) {
        this.hud.logEvent(`Created stockpile zone with ${zone.cells.length} cells.`, 'success');
        this.refreshLogisticsVisuals();
      }
      return;
    }

    const tiles = this.getBuildSelectionTiles(item, startX, startY, endX, endY);
    this.queueConstructionSelection(item, tiles);
  }

  private roomTypeForDefinition(roomDefinitionId: string): RoomType {
    const typeMap: Record<string, RoomType> = {
      dormitory: 'bedroom',
      mess_hall: 'canteen',
      prayer_room: 'temple',
      research_room: 'research_office',
      kitchen: 'kitchen',
      ritual_room: 'temple',
      storage: 'generic',
      meditation_room: 'recreation_room',
    };
    return typeMap[roomDefinitionId] ?? 'generic';
  }

  private getObjectsInRoom(roomId: number): string[] {
    const room = this.buildingSystem.getRoom(roomId);
    if (!room) return [];

    if (room.constructionCells?.length) {
      return this.buildingSystem.getAllObjects()
        .filter(obj => this.buildingSystem.getRoomAtConstructionCell(obj.x, obj.y)?.id === roomId)
        .map(obj => obj.objectId);
    }

    const tileKeys = new Set(room.tiles.map(tile => `${tile.x},${tile.y}`));
    return this.buildingSystem.getAllObjects()
      .filter(obj => {
        const terrain = this.buildingSystem.toTerrainTile(obj.x, obj.y);
        return tileKeys.has(`${terrain.x},${terrain.y}`);
      })
      .map(obj => obj.objectId);
  }

  private inferAutomaticRoomAt(constructionX: number, constructionY: number): void {
    const room = this.buildingSystem.getRoomAtConstructionCell(constructionX, constructionY);
    if (!room || room.source !== 'automatic') return;

    const placed = new Set(this.getObjectsInRoom(room.id));
    const candidates = DataManager.getRooms()
      .filter(def =>
        room.area >= def.minSize &&
        def.requiredObjects.length > 0 &&
        def.requiredObjects.every(required => placed.has(required)),
      )
      .sort((a, b) =>
        b.requiredObjects.length - a.requiredObjects.length ||
        b.minSize - a.minSize,
      );

    const inferred = candidates[0];
    if (!inferred) return;

    const changed = room.roomDefinitionId !== inferred.id;
    this.buildingSystem.setRoomDefinition(
      room.id,
      inferred.id,
      this.roomTypeForDefinition(inferred.id),
    );
    if (changed) {
      this.hud.logEvent(
        `${inferred.name} recognized automatically from its enclosure and furnishings.`,
        'success',
      );
    }
  }

  private designateRoom(startX: number, startY: number, endX: number, endY: number, roomDefinitionId: string): void {
    const def = DataManager.getRoom(roomDefinitionId);
    if (!def) {
      this.hud.logEvent('Unknown room type.', 'warning');
      return;
    }

    // Fine-grid Alpha rooms are created by physical enclosure. The legacy room
    // tool now acts only as an optional purpose override for an enclosed room.
    if (this.buildingSystem.subdivisions > 1) {
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);

      const candidates = this.buildingSystem.getAllRooms()
        .filter(room => room.source === 'automatic')
        .map(room => ({
          room,
          overlap: room.tiles.filter(tile =>
            tile.x >= minX && tile.x <= maxX && tile.y >= minY && tile.y <= maxY,
          ).length,
        }))
        .filter(entry => entry.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap);

      const room = candidates[0]?.room;
      if (!room) {
        this.hud.logEvent(
          `Enclose a room with walls/doors before assigning it as ${def.name}.`,
          'warning',
        );
        return;
      }
      if (room.area < def.minSize) {
        this.hud.logEvent(
          `${def.name} needs at least ${def.minSize} square units; this room is ${room.area.toFixed(1)}.`,
          'warning',
        );
        return;
      }

      this.buildingSystem.setRoomDefinition(
        room.id,
        roomDefinitionId,
        this.roomTypeForDefinition(roomDefinitionId),
      );
      const status = this.getRoomRequirementStatus(room.id);
      this.hud.logEvent(
        status.missing.length
          ? `${def.name} assigned. Add: ${status.missing.join(', ')}.`
          : `${def.name} assigned and complete.`,
        status.missing.length ? 'info' : 'success',
      );
      this.sceneMgr.syncBuildings(this.buildingSystem);
      this.updateHUD();
      return;
    }

    // Legacy 1:1 fallback retained for old saves/tests.
    const width = Math.abs(endX - startX) + 1;
    const height = Math.abs(endY - startY) + 1;
    const area = width * height;
    if (area < def.minSize) {
      this.hud.logEvent(`${def.name} needs at least ${def.minSize} tiles; selected area is ${area}.`, 'warning');
      return;
    }

    const room = this.buildingSystem.designateRoomArea(
      startX,
      startY,
      endX,
      endY,
      this.roomTypeForDefinition(roomDefinitionId),
      roomDefinitionId,
    );

    if (!room) {
      this.hud.logEvent(`Could not designate ${def.name} in that area.`, 'warning');
      return;
    }

    this.sceneMgr.buildTiles();
    const status = this.getRoomRequirementStatus(room.id);
    this.hud.logEvent(
      status.missing.length
        ? `${def.name} designated (${room.area} tiles). Add: ${status.missing.join(', ')}.`
        : `${def.name} designated and complete.`,
      status.missing.length ? 'info' : 'success',
    );
    this.updateHUD();
  }

  private getRoomRequirementStatus(roomId: number): { complete: boolean; missing: string[] } {
    const room = this.buildingSystem.getRoom(roomId);
    if (!room?.roomDefinitionId) return { complete: true, missing: [] };

    const def = DataManager.getRoom(room.roomDefinitionId);
    if (!def) return { complete: true, missing: [] };

    const placedIds = new Set(this.getObjectsInRoom(roomId));
    const missing = def.requiredObjects.filter(required => !placedIds.has(required));
    return { complete: room.area >= def.minSize && missing.length === 0, missing };
  }

  private refreshRoomRequirementAt(x: number, y: number): void {
    const tile = this.map.getTile(x, y);
    if (!tile || tile.roomId === null) return;
    const room = this.buildingSystem.getRoom(tile.roomId);
    if (!room?.roomDefinitionId) return;
    const def = DataManager.getRoom(room.roomDefinitionId);
    if (!def) return;

    const status = this.getRoomRequirementStatus(room.id);
    if (status.complete) {
      this.hud.logEvent(`${def.name} is now complete and functional.`, 'success');
    }
  }

  private onTileClick(x: number, y: number, event?: MouseEvent): void {
    const tile = this.map.getTile(x, y);
    if (!tile) return;

    if (this.input.getMode() === 'build' && this.selectedBuildItem) {
      this.handleBuild(x, y);
    } else if (this.input.getMode() === 'demolish') {
      if (this.cancelConstructionBlueprintAt(x, y)) return;
      const result = this.buildingSystem.demolish(x, y);
      if (result.success) {
        this.jobSystem.cancelJob(`station:${x}:${y}`);
        this.hud.logEvent(`Demolished at (${x}, ${y})`, 'info');
        this.audio.play('destroy');
        this.sceneMgr.buildTiles();
        this.sceneMgr.syncEntities();
        this.pathfinder.invalidateCache();
        this.pathfindSystem.invalidateCache();
        this.roomGraph.invalidate();
      }
    } else {
      // Select mode — pick the visible pawn under the mouse first, then
      // fall back to logical tile lookup for keyboard/test compatibility.
      const entity = event
        ? this.findFollowerAtScreen(event.clientX, event.clientY)
        : this.findFollowerAt(x, y);
      if (entity !== null) {
        this.selectFollower(entity);
      } else {
        this.selectedEntity = null;
        this.sceneMgr.setSelectedFollower(null);
        this.hud.hideInspector();
        if (tile.roomId !== null) {
          const room = this.buildingSystem.getRoom(tile.roomId);
          const def = room?.roomDefinitionId ? DataManager.getRoom(room.roomDefinitionId) : null;
          if (room && def) {
            const status = this.getRoomRequirementStatus(room.id);
            this.hud.logEvent(
              `${def.name}: ${status.complete ? 'complete' : `missing ${status.missing.join(', ')}`} · ${room.area} tiles`,
              status.complete ? 'success' : 'info',
            );
          }
        } else {
          this.hud.logEvent(`Tile (${x}, ${y}): ${tile.terrain}${tile.occupied ? ' [built]' : ''}`, 'info');
        }
      }
    }
  }

  private handleBuild(x: number, y: number): void {
    if (!this.selectedBuildItem) return;
    const item = this.selectedBuildItem;
    if (item.startsWith('room:')) return;
    if (item.startsWith('harvest:')) {
      this.designateHarvestArea(x, y, x, y, item.slice(8) as SerializedHarvestOrder['kind']);
      return;
    }
    if (item === 'zone:stockpile') {
      this.logisticsSystem.designateStockpile([{ x, y }]);
      this.refreshLogisticsVisuals();
      return;
    }
    this.queueConstructionSelection(item, [{ x, y }]);
  }

  private findNeedFacility(need: NeedKind, from: { x: number; y: number }): { x: number; y: number } | null {
    const facilitiesByNeed: Record<NeedKind, string[]> = {
      hunger: ['cookpot', 'cauldron', 'garden_plot', 'farm_plot'],
      faith: ['altar', 'sacrificial_altar', 'offering_bowl', 'incense_burner', 'prayer_beads', 'statue'],
      fun: ['bonfire', 'zen_garden', 'meditation_mat'],
      sanity: ['meditation_mat', 'zen_garden', 'bonfire'],
      energy: ['bed', 'bunk_bed'],
      bladder: ['bathroom_fixture', 'toilet'],
      hygiene: ['bathroom_fixture', 'shower'],
    };

    const validIds = new Set(facilitiesByNeed[need]);
    const candidates = this.buildingSystem.getAllObjects()
      .filter(obj => validIds.has(obj.objectId))
      .map(obj => {
        const workTile = this.findAdjacentWorkTile(obj.x, obj.y);
        if (!workTile) return null;
        const distance = Math.abs(workTile.x - from.x) + Math.abs(workTile.y - from.y);
        return { tile: workTile, distance };
      })
      .filter((entry): entry is { tile: { x: number; y: number }; distance: number } => entry !== null)
      .sort((a, b) => a.distance - b.distance);

    return candidates[0]?.tile ?? null;
  }

  private registerWorkstationJob(x: number, y: number, objectId: string): void {
    const stationTypes: Record<string, { type: 'cook' | 'research' | 'pray' | 'haul'; skill: keyof Skills; priority: number }> = {
      cookpot: { type: 'cook', skill: 'cooking', priority: 7 },
      cauldron: { type: 'cook', skill: 'cooking', priority: 8 },
      garden_plot: { type: 'cook', skill: 'cooking', priority: 5 },
      farm_plot: { type: 'cook', skill: 'cooking', priority: 6 },
      research_desk: { type: 'research', skill: 'research', priority: 7 },
      library_shelf: { type: 'research', skill: 'research', priority: 8 },
      altar: { type: 'pray', skill: 'faith', priority: 7 },
      sacrificial_altar: { type: 'pray', skill: 'faith', priority: 9 },
      offering_bowl: { type: 'pray', skill: 'faith', priority: 5 },
      incense_burner: { type: 'pray', skill: 'faith', priority: 5 },
      prayer_beads: { type: 'pray', skill: 'faith', priority: 5 },
      storage_box: { type: 'haul', skill: 'construction', priority: 3 },
      warehouse: { type: 'haul', skill: 'construction', priority: 4 },
    };
    const station = stationTypes[objectId];
    if (!station) return;

    const targetTile = this.findAdjacentWorkTile(x, y);
    if (!targetTile) {
      this.hud.logEvent(`No accessible work tile beside ${objectId}; station will remain idle.`, 'warning');
      return;
    }

    this.jobSystem.cancelJob(`station:${x}:${y}`);
    this.jobSystem.postJob({
      id: `station:${x}:${y}`,
      type: station.type,
      targetTile,
      priority: station.priority,
      duration: 100000,
      requiredSkill: station.skill,
      minSkillLevel: 1,
    });
    this.hud.logEvent(`Workstation ready: ${objectId.replaceAll('_', ' ')}`, 'success');
  }

  private findAdjacentWorkTile(x: number, y: number): { x: number; y: number } | null {
    const candidates = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];
    return candidates.find(tile => {
      const mapTile = this.map.getTile(tile.x, tile.y);
      return !!mapTile && mapTile.buildable && !mapTile.occupied;
    }) ?? null;
  }

  private onTileHover(x: number, y: number): void {
    const state = this.input.getState();
    const usesConstructionSpace =
      state.mode === 'demolish' ||
      (state.mode === 'build' && !!this.selectedBuildItem &&
        !this.selectedBuildItem.startsWith('room:') &&
        !this.selectedBuildItem.startsWith('harvest:'));
    const highlight = usesConstructionSpace
      ? this.buildingSystem.toTerrainTile(x, y)
      : { x, y };
    this.sceneMgr.highlightTile(highlight.x, highlight.y);
    if (state.mode === 'build' && this.selectedBuildItem && !state.isDragging) {
      this.updateBuildPreview(x, y, x, y);
    } else if (state.mode !== 'build') {
      this.sceneMgr.clearBuildPreview();
      this.hud.clearBuildStatus();
    }
  }

  /**
   * Handle decor item placement — find or create a room entity with Prestige
   * component and add the decor to it.
   */
  private handleDecorPlacement(x: number, y: number, decorId: string): void {
    const room = this.roomGraph.getRoomAt(x, y);
    if (!room) {
      this.hud.logEvent(`Decor placed at (${x}, ${y}) but no room detected here.`, 'warning');
      return;
    }

    // Find or create a Prestige entity for this room
    let roomEntity = this.roomEntities.get(room.id);
    if (roomEntity === undefined) {
      roomEntity = this.world.createEntity();
      const prestige = new Prestige(roomEntity);
      // Base prestige from room area (bigger rooms start with slightly more)
      (prestige as Prestige & { baseLevel?: number }).baseLevel = Math.min(3, Math.floor(room.area / 20));
      this.world.addComponent(roomEntity, prestige);
      this.roomEntities.set(room.id, roomEntity);
    }

    const success = this.prestigeSystem.addDecor(this.world, roomEntity, decorId);
    if (success) {
      const decorDef = DECOR_ITEMS[decorId];
      this.hud.logEvent(
        `Decor placed: ${decorDef?.name ?? decorId} (+${decorDef?.prestigeValue ?? 0} prestige)`,
        'success',
      );
    }
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

  private findFollowerAtScreen(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    let bestEntity: number | null = null;
    let bestDistanceSq = 44 * 44;

    for (const entity of this.world.query([Transform, Renderable, Needs])) {
      const renderable = this.world.getComponent(entity, Renderable)!;
      if (!renderable.visible || !renderable.meshId.startsWith('follower')) continue;

      const transform = this.world.getComponent(entity, Transform)!;
      if (!this.fogOfWar.isVisible(Math.round(transform.x), Math.round(transform.y))) continue;

      const displayOffset = this.sceneMgr.getFollowerDisplayOffset(entity);
      const screen = this.renderer.camera.tileToScreen(
        transform.x + displayOffset.x,
        transform.y + displayOffset.y,
      );

      // The projection point is at the pawn's feet. Bias upward toward the visible body.
      const dx = localX - screen.x;
      const dy = localY - (screen.y - 18);
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestEntity = entity;
      }
    }

    return bestEntity;
  }

  private selectFollower(entity: number): void {
    this.selectedEntity = entity;
    this.sceneMgr.setSelectedFollower(entity);

    const needs = this.world.getComponent(entity, Needs);
    const health = this.world.getComponent(entity, Health);
    const traits = this.world.getComponent(entity, Traits);
    const job = this.world.getComponent(entity, Job);
    const ai = this.world.getComponent(entity, FollowerAI);
    const skills = this.world.getComponent(entity, Skills);
    const schedule = this.world.getComponent(entity, Schedule);
    const work = this.world.getComponent(entity, WorkPreferences);
    const inventory = this.world.getComponent(entity, Inventory);
    const name = this.followerNames.get(entity) ?? 'Unknown';

    if (!needs) return;

    this.hud.showInspector({
      name,
      role: work?.role ?? 'Follower',
      tier: ai?.tier,
      aiState: ai?.state,
      schedule: schedule?.shift,
      health: health?.hp ?? 100,
      needs: {
        hunger: needs.hunger,
        faith: needs.faith,
        fun: needs.fun,
        sanity: needs.sanity,
        energy: needs.energy,
        bladder: needs.bladder,
        hygiene: needs.hygiene,
      },
      job: job?.type ?? 'idle',
      traits: traits?.traits ?? [],
      skills: skills ? {
        cooking: skills.cooking,
        research: skills.research,
        construction: skills.construction,
        faith: skills.faith,
        combat: skills.combat,
        social: skills.social,
      } : undefined,
      priorities: work ? { ...work.priorities } : undefined,
      inventory: inventory?.items ?? [],
    });
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
    const maxPopBonus = this.techTree.getEffectBonus('maxPopulationPlus');

    const data: ResourceBarData = {
      influence: Math.floor(this.cultInfluence),
      wealth: Math.floor(this.getSpendableWealth()),
      notoriety: Math.floor(this.cultNotoriety),
      faith: pop > 0 ? totalFaith / pop : 100,
      morale: pop > 0 ? (totalFun + totalSanity) / (2 * pop) : 100,
      materials: Math.floor(this.getAvailableMaterials()),
      food: Math.floor(this.gameInstanceState.resources.food),
      population: pop,
      maxPopulation: 8 + maxPopBonus,
    };
    this.hud.updateResourceBar(data);
    this.hud.updateMinimap({
      width: this.map.width,
      height: this.map.height,
      tiles: this.map.getAllTiles().map(tile => ({
        x: tile.x,
        y: tile.y,
        terrain: tile.terrain,
        explored: this.fogOfWar.isExplored(tile.x, tile.y),
      })),
      followers: this.world.query([Transform, FollowerAI]).map(entityId => {
        const transform = this.world.getComponent(entityId, Transform)!;
        return { x: transform.x, y: transform.y };
      }),
      objects: this.buildingSystem.getAllObjects().map(obj => ({ x: obj.x, y: obj.y })),
      rooms: this.buildingSystem.getAllRooms().map(room => ({
        tiles: room.tiles.map(tile => ({ ...tile })),
      })),
    });
    this.updateAlphaObjective();

    // Keep open management panels current while the simulation runs.
    this.hud.updateTechTreePanel({
      unlockedIds: this.techTree.getUnlocked().map(node => node.id),
      influence: this.cultInfluence,
      faith: this.cultFaith,
    });

    const workEntities = this.world.query([FollowerAI, Skills, WorkPreferences]);
    this.hud.updateWorkPanel({
      cultists: workEntities.map((entityId) => {
        const ai = this.world.getComponent(entityId, FollowerAI)!;
        const skills = this.world.getComponent(entityId, Skills)!;
        const prefs = this.world.getComponent(entityId, WorkPreferences)!;
        return {
          id: entityId,
          name: this.followerNames.get(entityId) ?? `Cultist ${entityId}`,
          tier: ai.tier,
          role: prefs.role,
          skills: {
            cook: skills.cooking,
            research: skills.research,
            pray: skills.faith,
            build: skills.construction,
            clean: Math.max(1, Math.round((skills.construction + skills.social) / 2)),
            haul: skills.construction,
            harvest: skills.construction,
          },
          priorities: { ...prefs.priorities },
        };
      }),
    });

    // Update inspector if a follower is selected
    if (this.selectedEntity !== null) {
      this.selectFollower(this.selectedEntity);
    }
  }

  private updateAlphaObjective(): void {
    const rooms = this.buildingSystem.getAllRooms();
    const completeRoomIds = new Set(
      rooms
        .filter(room => this.getRoomRequirementStatus(room.id).complete)
        .map(room => room.roomDefinitionId)
        .filter((id): id is string => !!id),
    );
    const workPrefs = this.world.query([WorkPreferences])
      .map(entityId => this.world.getComponent(entityId, WorkPreferences)!)
      .filter(Boolean);
    const hasSpecializedRole = workPrefs.some(pref => pref.role !== 'generalist');
    const researched = this.techTree.getUnlocked().length;
    const activeMissions = this.missionSystem.getActiveMissions().length;
    const heat = this.heatSystem.getHeat();

    if (rooms.length === 0) {
      this.hud.setObjective(
        'Build your first enclosed room',
        'Use fine-grid walls and a door to enclose at least 4 square units. The room and roof are detected automatically.',
      );
    } else if (!rooms.some(room => room.roomDefinitionId === 'dormitory')) {
      this.hud.setObjective(
        'Furnish a sleeping room',
        'Place a Bed inside an enclosed room of at least 4 square units. It will be recognized as a Dormitory automatically.',
      );
    } else if (!completeRoomIds.has('dormitory')) {
      this.hud.setObjective(
        'Complete the Dormitory',
        'Add the missing Dormitory furnishings shown by the room inspector/status.',
      );
    } else if (!rooms.some(room => room.roomDefinitionId === 'kitchen')) {
      this.hud.setObjective(
        'Create a Kitchen',
        'Enclose a room of at least 4 square units and place a Cookpot plus Storage Box inside. Its purpose is inferred automatically.',
      );
    } else if (!completeRoomIds.has('kitchen')) {
      const kitchen = rooms.find(room => room.roomDefinitionId === 'kitchen');
      const missing = kitchen ? this.getRoomRequirementStatus(kitchen.id).missing : [];
      this.hud.setObjective(
        'Complete the Kitchen',
        `Place the required objects inside it: ${missing.join(', ') || 'Cookpot and Storage Box'}.`,
      );
    } else if (!hasSpecializedRole) {
      this.hud.setObjective(
        'Assign follower roles',
        'Open ☰ → Work (or press J). Use Auto Assign Roles or specialize at least one follower so jobs follow your priorities.',
      );
    } else if (researched === 0) {
      this.hud.setObjective(
        'Choose your first research',
        'Open ☰ → Tech Tree (T) and unlock a first upgrade that supports your compound.',
      );
    } else if (activeMissions === 0) {
      this.hud.setObjective(
        'Send your first mission',
        'Open ☰ → Missions (M), compare follower skills and risk, then choose a team.',
      );
    } else if (heat >= 50) {
      this.hud.setObjective(
        'Control the heat',
        `Heat is ${Math.floor(heat)}. Reduce exposure before protests and raids escalate.`,
      );
    } else {
      this.hud.setObjective(
        'Grow without losing control',
        'Expand enclosed rooms, keep needs stable, improve work priorities, research, recruit and prepare for rising pressure.',
      );
    }
  }

  private onResize = (): void => {
    // Renderer handles its own resize
  };

  /**
   * Start the render loop only (no simulation). Used when showing the menu
   * so the 3D scene is visible behind the menu overlay.
   */
  startRenderLoop(): void {
    this.lastTime = performance.now();
    this.running = true;
    this.gameLoop();
  }

  /**
   * Start the full game (render + simulation). Called when "New Game" is clicked.
   */
  start(): void {
    this.lastTime = performance.now();
    this.running = true;
    this.gameLoop();
  }

  async preloadAssets(): Promise<void> {
    console.log('[preloadAssets] Starting asset preload...');
    const assetUrls = [
      // Real fantasy character models
      './assets/models/followers/fantasy_wizard_01.glb',
      './assets/models/followers/fantasy_sorcerer_01.glb',
      './assets/models/followers/fantasy_witch_01.glb',
      './assets/models/followers/fantasy_druid_01.glb',
      './assets/models/followers/fantasy_bard_01.glb',
      './assets/models/followers/fantasy_gypsy_01.glb',
      './assets/models/followers/fantasy_rougemale_01.glb',
      './assets/models/followers/fantasy_malepeasant_01.glb',
      './assets/models/followers/fantasy_femalepeasant_01.glb',
      './assets/models/followers/dungeon_goblinshaman_01.glb',
      './assets/models/followers/adventure_viking_01.glb',
      './assets/models/followers/adventure_warrior_01.glb',
      // Building models (old Blender-generated)
      './assets/models/buildings/wall_straight.glb',
      './assets/models/buildings/door.glb',
      './assets/models/buildings/bed.glb',
      './assets/models/buildings/prayer_mat.glb',
      './assets/models/buildings/research_desk.glb',
      './assets/models/buildings/cooking_pot.glb',
      './assets/models/buildings/ritual_circle.glb',
    ];
    await this.assets.loadAll(assetUrls);
    await this.preloadFollowerAnimationLibrary();
    console.log('[preloadAssets] All assets loaded. Cached:', this.assets.cachedCount);
    // Re-sync entities now that assets are loaded.
    this.sceneMgr.syncEntities();
    console.log('[preloadAssets] syncEntities done. Starting game...');
  }

  private async preloadFollowerAnimationLibrary(): Promise<void> {
    try {
      const response = await window.fetch('./assets/animations/followers/manifest.json', { cache: 'no-store' });
      if (!response.ok) return;

      const manifest = await response.json() as { enabled?: boolean; source?: string };
      if (!manifest.enabled || !manifest.source) {
        console.log('[animations] Shared follower animation library disabled.');
        return;
      }

      const asset = await this.assets.load(manifest.source);
      if (!asset || asset.animations.length === 0) {
        console.warn('[animations] Shared follower animation library enabled but no clips were loaded.');
        return;
      }

      this.sceneMgr.setFollowerAnimationLibrary(asset.animations);
      console.log(
        `[animations] Loaded shared follower animation library: ${asset.animations.length} clips from ${manifest.source}`,
      );
    } catch (err) {
      console.warn('[animations] Failed to load follower animation manifest/library:', err);
    }
  }

  private gameLoop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.gameLoop);

    const now = performance.now();
    const frameTime = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    // Only simulate when playing
    if (this.gameState === 'playing') {
      // Fixed timestep simulation
      this.accumulator += frameTime * this.timeScale;
      while (this.accumulator >= this.tickDuration) {
        this.simulate(this.tickDuration);
        this.accumulator -= this.tickDuration;
      }
    }

    // Always render (even when paused, so the scene is visible behind pause overlay)
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
    // Smooth day/night cycle with dawn/dusk transitions
    let dayFactor: number;
    let lightColor: number;
    let ambientColor: number;
    let fogColor: number;
    let bloomStrength: number;

    if (hour >= 6 && hour < 8) {
      // Dawn — warm orange, low light, soft bloom
      const t = (hour - 6) / 2;
      dayFactor = 0.3 + t * 0.4;
      lightColor = 0xffb066;
      ambientColor = 0x6677aa;
      fogColor = 0x343044;
      bloomStrength = 0.6;
    } else if (hour >= 8 && hour < 16) {
      // Full day — bright white, full bloom
      dayFactor = 1.0;
      lightColor = 0xfff4dd;
      ambientColor = 0x8899bb;
      fogColor = 0x1a1a2e;
      bloomStrength = 0.8;
    } else if (hour >= 16 && hour < 19) {
      // Dusk — warm orange fading to purple
      const t = (hour - 16) / 3;
      dayFactor = 1.0 - t * 0.6;
      lightColor = t < 0.5 ? 0xffaa66 : 0xaa6699;
      ambientColor = 0x8899bb;
      fogColor = 0x34283f;
      bloomStrength = 0.9 + t * 0.3;
    } else {
      // Night — cool blue, low light, strong bloom for torches/lights
      dayFactor = 0.25;
      lightColor = 0x6688cc;
      ambientColor = 0x334466;
      fogColor = 0x182033;
      bloomStrength = 1.2;
    }

    const ambient = this.renderer.ambient;
    ambient.intensity = 0.62 + dayFactor * 0.28;
    ambient.color.setHex(ambientColor);

    const dirLight = this.renderer.directional;
    dirLight.intensity = 0.5 + dayFactor * 0.65;
    dirLight.color.setHex(lightColor);

    // Update fog color to match time of day
    if (this.renderer.threeScene.fog instanceof THREE.Fog) {
      this.renderer.threeScene.fog.color.setHex(fogColor);
      this.renderer.threeScene.background = new THREE.Color(fogColor);
    }

    // Adjust bloom for time of day — stronger at night for glow effects
    this.renderer.setBloomStrength(bloomStrength * 0.4);
  }

  private simulate(dt: number): void {
    // ResourceSystem owns the continuous economy. Seed it from player-facing state
    // before simulation, then read its results back immediately afterward.
    // Construction blueprints reserve money without immediately consuming it.
    // Economy simulation only sees currently spendable funds.
    this.gameInstanceState.resources.funds = this.getSpendableWealth();
    this.gameInstanceState.resources.influence = this.cultInfluence;
    this.gameInstanceState.resources.notoriety = this.cultNotoriety;

    for (const system of this.systems) {
      system.update(this.world, dt);
    }

    // Recombine spendable funds with construction reservations that are still open.
    // A completed blueprint disappears from the reservation pool, consuming its cost.
    this.cultWealth = this.gameInstanceState.resources.funds + this.getReservedConstructionCost();
    this.cultInfluence = this.gameInstanceState.resources.influence;
    this.cultNotoriety = this.gameInstanceState.resources.notoriety;

    // Update PrestigeSystem (doesn't extend System, called manually)
    // Runs after ResourceSystem in the loop (position 7)
    this.prestigeSystem.update(this.world, dt);

    // Update HeatSystem (different update signature: dt only, no world)
    // Runs after CultManagementSystem would run (position 9)
    this.heatSystem.update(dt);

    // Sync notoriety to heat (notoriety is the passive heat component)
    this.heatSystem.syncNotoriety(this.cultNotoriety);

    // Update MissionSystem (doesn't extend System, called manually)
    // Runs after HeatSystem (position 10)
    this.missionSystem.update(this.world, dt);

    // Check for police raids
    if (this.heatSystem.isRaidReady()) {
      const roster = this.world.query([Needs, FollowerAI]);
      if (roster.length > 0) {
        const raidResult = this.heatSystem.executeRaid(roster, this.cultWealth);
        this.cultWealth -= raidResult.fundsConfiscated;
        for (const arrestedId of raidResult.arrestedEntityIds) {
          this.world.destroyEntity(arrestedId);
          this.followerNames.delete(arrestedId);
        }
        this.hud.logEvent(
          `🚨 Police raid! ${raidResult.arrestedEntityIds.length} cultist(s) arrested, ${raidResult.fundsConfiscated}g confiscated.`,
          'danger',
        );
        this.sceneMgr.syncEntities();
      }
    }

    // Time progression: 1 game day = 30 real seconds at 1x speed
    // 30 ticks/sec * 30 sec = 900 ticks per day
    this.tickCount += dt;
    const ticksPerHour = 900 / 24; // 37.5 ticks per hour
    this.currentHour = (6 + this.tickCount / ticksPerHour) % 24;
    this.schedulingSystem.setHour(this.currentHour);
    const newDay = Math.floor(this.tickCount / 900) + 1;
    if (newDay !== this.currentDay) {
      this.currentDay = newDay;
      this.hud.logEvent(`Day ${newDay} begins.`, 'info');
      this.heatSystem.advanceDay();
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

    // Clock updates continuously so the player can always see that simulation is moving.
    this.hud.updateTime(this.currentHour, this.currentDay);

    // Expensive HUD panels/minimap refresh once per real simulation second.
    const hudSecond = Math.floor(this.tickCount);
    if (hudSecond !== this.lastHudUpdateSecond) {
      this.lastHudUpdateSecond = hudSecond;
      this.updateHUD();
    }

    // Sync entity positions for animation
    this.sceneMgr.syncEntities();

    // Update particle effects
    this.particles.update(dt);

    // Update fog of war tile visuals (only tiles that changed)
    this.sceneMgr.updateFog();

    // Update investigator notoriety
    this.investigatorSystem.setNotoriety(this.cultNotoriety);
    this.combatSystem.setNotoriety(this.cultNotoriety);

    // Check lose conditions
    this.checkLoseConditions();
  }

  /**
   * Check win condition: 20+ followers and Ascension ritual completed.
   */
  private checkWinCondition(): void {
    if (this.gameEnded) return;
    const entities = this.world.query([Needs, FollowerAI]);
    if (entities.length >= 20) {
      this.showWinOverlay();
    } else {
      this.hud.logEvent(`Ascension ritual complete! Need 20 followers to win (have ${entities.length}).`, 'success');
    }
  }

  /**
   * Check lose conditions each tick.
   */
  private checkLoseConditions(): void {
    if (this.gameEnded) return;

    const entities = this.world.query([Needs, FollowerAI]);
    const pop = entities.length;

    // Bankruptcy
    if (this.cultWealth < -50) {
      this.showLoseOverlay('bankruptcy');
      return;
    }

    // HeatSystem owns threat escalation: protests at 50, raids at 100,
    // and a terminal crackdown at the critical heat threshold.

    // Population zero tracking
    if (pop <= 0) {
      if (!this._popZeroTimer) this._popZeroTimer = 0;
      this._popZeroTimer += this.tickDuration;
      if (this._popZeroTimer >= 30) {
        this.showLoseOverlay('abandoned');
      }
    } else {
      this._popZeroTimer = 0;
    }
  }

  private _popZeroTimer = 0;

  /**
   * Show the victory overlay.
   */
  private showWinOverlay(): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.setTimeMode('pause');

    const stats = this.gatherStats();
    const overlay = this.createOverlay('win');
    overlay.innerHTML = `
      <div class="ov-card win">
        <div class="ov-icon">🌟</div>
        <h1>Your cult has achieved Ascension!</h1>
        <div class="ov-stats">
          <div>Day: <b>${stats.day}</b></div>
          <div>Followers: <b>${stats.pop}</b></div>
          <div>Influence: <b>${stats.influence}</b></div>
          <div>Wealth: <b>${stats.wealth}</b></div>
          <div>Notoriety: <b>${stats.notoriety}</b></div>
        </div>
        <div class="ov-buttons">
          <button id="ov-continue" class="ov-btn">Continue Playing</button>
          <button id="ov-newgame" class="ov-btn ov-btn-primary">New Game</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('ov-continue')?.addEventListener('click', () => {
      overlay.remove();
      this.gameEnded = false;
      this.setTimeMode('speed1');
    });
    document.getElementById('ov-newgame')?.addEventListener('click', () => {
      overlay.remove();
      this.resetForNewGame();
    });
  }

  /**
   * Show the defeat overlay.
   */
  private showLoseOverlay(reason: 'abandoned' | 'bankruptcy' | 'busted'): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.setTimeMode('pause');

    const reasons: Record<string, { icon: string; title: string; desc: string }> = {
      abandoned: { icon: '👻', title: 'Your cult has been abandoned', desc: 'All your followers have left. The cult is no more.' },
      bankruptcy: { icon: '💸', title: 'Your cult is bankrupt', desc: 'Wealth has dropped below -50g. The cult cannot sustain itself.' },
      busted: { icon: '🚨', title: 'Your cult has been busted', desc: 'Heat reached a critical level. Authorities overwhelmed the compound and shut the cult down.' },
    };
    const r = reasons[reason];
    const stats = this.gatherStats();
    const overlay = this.createOverlay('lose');
    overlay.innerHTML = `
      <div class="ov-card lose">
        <div class="ov-icon">${r.icon}</div>
        <h1>${r.title}</h1>
        <p class="ov-desc">${r.desc}</p>
        <div class="ov-stats">
          <div>Day: <b>${stats.day}</b></div>
          <div>Followers: <b>${stats.pop}</b></div>
          <div>Influence: <b>${stats.influence}</b></div>
          <div>Wealth: <b>${stats.wealth}</b></div>
          <div>Notoriety: <b>${stats.notoriety}</b></div>
        </div>
        <div class="ov-buttons">
          <button id="ov-newgame" class="ov-btn ov-btn-primary">New Game</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('ov-newgame')?.addEventListener('click', () => {
      overlay.remove();
      this.resetForNewGame();
    });
  }

  private createOverlay(_type: 'win' | 'lose'): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000; pointer-events: auto;
      font-family: 'Segoe UI', -apple-system, sans-serif;
    `;
    // Add card styles if not already present
    if (!document.getElementById('overlay-styles')) {
      const style = document.createElement('style');
      style.id = 'overlay-styles';
      style.textContent = `
        .ov-card {
          background: rgba(20,20,34,0.96);
          border: 2px solid rgba(168,85,247,0.4);
          border-radius: 12px; padding: 40px 48px; text-align: center;
          max-width: 480px; box-shadow: 0 8px 40px rgba(0,0,0,0.6);
          color: #e0e0e0;
          }
        .ov-card.win { border-color: rgba(168,85,247,0.6); box-shadow: 0 8px 40px rgba(168,85,247,0.3); }
        .ov-card.lose { border-color: rgba(239,68,68,0.5); box-shadow: 0 8px 40px rgba(239,68,68,0.3); }
        .ov-icon { font-size: 48px; margin-bottom: 16px; }
        .ov-card h1 { font-size: 24px; margin: 0 0 12px; color: #fff; }
        .ov-desc { color: #aaa; font-size: 14px; margin: 0 0 20px; }
        .ov-stats { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; margin: 16px 0 24px; font-size: 14px; }
        .ov-stats div { color: #ccc; }
        .ov-stats b { color: #fff; }
        .ov-buttons { display: flex; gap: 12px; justify-content: center; }
        .ov-btn {
          background: rgba(60,60,90,0.8); border: 1px solid rgba(100,100,160,0.4);
          color: #ccc; padding: 10px 24px; border-radius: 8px;
          cursor: pointer; font-size: 14px; font-weight: 600;
          transition: all 0.15s;
        }
        .ov-btn:hover { background: rgba(80,80,120,0.9); }
        .ov-btn-primary { background: rgba(168,85,247,0.4); border-color: rgba(168,85,247,0.6); color: #fff; }
        .ov-btn-primary:hover { background: rgba(168,85,247,0.6); }
      `;
      document.head.appendChild(style);
    }
    return overlay;
  }

  private gatherStats() {
    const entities = this.world.query([Needs, FollowerAI]);
    return {
      day: this.currentDay,
      pop: entities.length,
      influence: Math.floor(this.cultInfluence),
      wealth: Math.floor(this.cultWealth),
      notoriety: Math.floor(this.cultNotoriety),
    };
  }

  /**
   * Reset game state for a new game (from win/lose overlay).
   */
  private resetForNewGame(): void {
    // Clear all entities
    this.world.clear();

    // Reset game state
    this.gameEnded = false;
    this._popZeroTimer = 0;
    this.cultWealth = 200;
    this.cultInfluence = 50;
    this.cultNotoriety = 5;
    this.currentHour = 6;
    this.currentDay = 1;
    this.tickCount = 0;
    this.selectedBuildItem = null;
    this.selectedEntity = null;
    this.followerNames.clear();
    this.constructionBlueprints.clear();
    this.harvestOrders.clear();
    this.nextConstructionBlueprintId = 1;
    this.jobSystem.clear();
    this.sceneMgr.setConstructionBlueprints([]);
    this.sceneMgr.setHarvestDesignations([]);
    this.sceneMgr.setSelectedFollower(null);

    // Reset systems
    this.investigatorSystem.reset();
    this.combatSystem.reset();
    this.resourceSystem.reset();
    this.heatSystem.reset();
    this.missionSystem = new MissionSystem(
      (missionId, event, choices) => {
        this.hud.logEvent(`Mission event: ${event.text}`, 'warning');

        // Mission events are player decisions. Pause simulation while the modal is open
        // so the mission cannot advance or resolve behind the player's choice.
        const previousTimeMode = this.timeMode;
        this.setTimeMode('pause');

        this.dialog.show({
          title: 'Mission Decision',
          icon: '🎯',
          body: `<p>${event.text}</p><p style="color:#888;font-size:12px;">Choose how your cultists should respond.</p>`,
          modal: true,
          buttons: choices.map((choice, choiceIndex) => ({
            label: choice.skillCheck
              ? `${choice.label} [${choice.skillCheck.skill} ${choice.skillCheck.difficulty}]`
              : choice.label,
            onClick: () => {
              const result = this.missionSystem.resolveEventChoice(missionId, choiceIndex, this.world);
              if (result) {
                this.hud.logEvent(
                  `Mission outcome: ${result.text}`,
                  result.success ? 'success' : 'danger',
                );
              }
              this.setTimeMode(previousTimeMode);
            },
          })),
        });
      },
      (_missionId, templateId, success, rewards) => {
        if (rewards.money) this.cultWealth += rewards.money;
        if (rewards.influence) this.cultInfluence += rewards.influence;
        if (rewards.heatReduction) this.heatSystem.reduceHeat(rewards.heatReduction);
        if (rewards.heatGain) this.heatSystem.addHeat(rewards.heatGain, 'mission');
        this.hud.logEvent(
          `Mission ${success ? 'succeeded' : 'failed'}: ${templateId}`,
          success ? 'success' : 'danger',
        );
      },
    );
    this.prestigeSystem = new PrestigeSystem();
    this.roomEntities.clear();
    this.gameInstanceState = new GameInstanceState({
      faith: 100,
      funds: this.cultWealth,
      materials: 50,
      food: 100,
      influence: this.cultInfluence,
      notoriety: this.cultNotoriety,
    });
    this.resourceSystem = new ResourceSystem(
      this.gameInstanceState,
      {},
      (event) => {
        const logType = event.type === 'shortage' ? 'danger' : event.type === 'milestone' ? 'success' : 'info';
        this.hud.logEvent(event.message, logType as any);
      },
    );
    this.systems = [this.needsSystem, this.schedulingSystem, this.jobSystem, this.aiSystem, this.pathfindSystem, this.resourceSystem, this.eventSystem, this.ritualSystem, this.investigatorSystem, this.combatSystem, this.fogSystem];
    // Note: PrestigeSystem, HeatSystem, and MissionSystem are updated manually
    // in simulate() because they don't extend the System base class.
    // Order: Needs → Scheduling → Job → AI → Pathfind → Resource → Event →
    //        Ritual → Investigator → Combat → Fog, then Prestige → Heat → Mission

    // Rebuild map — 64x64 with fog of war
    const worldGen = new WorldGen(12345);
    this.map = worldGen.generate({ width: 64, height: 64, waterPools: 8, stonePatches: 10, dirtPatches: 12 });
    this.pathfinder = new Pathfinder(this.map);
    this.renderer.camera.setMapOffset(-this.map.width / 2, -this.map.height / 2);
    this.renderer.camera.setMapBounds(this.map.width, this.map.height);
    this.pathfindSystem = new PathfindSystem(this.map, this.pathfinder);
    this.pathfindSystem.bindWorld(this.world);

    // Rebuild room graph for new map
    this.roomGraph = new RoomGraph(this.map);

    // Reset fog of war
    this.fogOfWar = new FogOfWar(10);
    this.fogOfWar.revealArea(Math.floor(this.map.width / 2), Math.floor(this.map.height / 2), 15);
    this.fogSystem = new FogSystem(this.fogOfWar, 0.33);
    this.sceneMgr.setFog(this.fogOfWar);
    this.sceneMgr.buildTiles();

    // Spawn initial followers at map center
    this.spawnFollowers(6);

    // Update HUD
    this.updateHUD();
    this.hud.updateTime(6, 1);
    this.hud.logEvent('New game started!', 'success');
    this.hud.logEvent('Your cult begins with 6 followers in a vast unexplored land.', 'info');

    this.setTimeMode('speed1');
  }

  dispose(): void {
    this.running = false;
    window.removeEventListener('resize', this.onResize);
    this.input.dispose();
    this.hud.destroy();
    this.dialog.destroy();
    this.sceneMgr.dispose();
    this.renderer.dispose();
    this.startMenu?.destroy();
    this.pauseMenu?.destroy();
    this.settingsMenu?.destroy();
  }

  // ─── Menu System ───────────────────────────────────────────────

  /**
   * Show the start menu on game boot. Does NOT start the game loop.
   */
  showStartMenu(): void {
    this.gameState = 'menu';

    this.startMenu = new StartMenu({
      onNewGame: () => this.startNewGame(),
      onContinue: () => this.continueGame(),
      onSettings: () => this.openSettings(),
      onQuit: () => this.quitGame(),
    });
    this.startMenu.mount();
    this.startMenu.show();

    // Enable Continue button only if a save exists
    this.startMenu.setCanContinue(this.saveSystem.hasSave());

    // Settings menu (shared, created on demand)
    this.settingsMenu = new SettingsMenu({
      onApply: (data) => this.applySettings(data),
      onClose: () => this.closeSettings(),
    }, this.settingsData);
    this.settingsMenu.mount();
    this.settingsMenu.hide();
  }

  /**
   * Start a new game from the start menu.
   */
  private startNewGame(): void {
    console.log('[Menu] Starting new game...');
    this.startMenu?.hide();

    // Start preloading and then the game
    this.gameState = 'loading';
    this.preloadAssets().then(() => {
      console.log('[Menu] Preload complete, starting game loop');
      this.gameState = 'playing';
      this.start();
    }).catch((err) => {
      console.error('[Menu] Preload failed:', err);
      this.gameState = 'playing';
      this.start();
    });
  }

  /**
   * Continue from a saved game.
   */
  private continueGame(): void {
    console.log('[Menu] Continue: loading save...');

    const data = this.saveSystem.load();
    if (!data) {
      console.warn('[Menu] No save found — falling back to new game');
      this.hud.logEvent('No saved game found. Starting new game.', 'warning');
      this.startNewGame();
      return;
    }

    this.startMenu?.hide();
    this.gameState = 'loading';

    this.preloadAssets().then(() => {
      console.log('[Menu] Preload complete, restoring save');
      this.restoreFromSave(data);
      this.gameState = 'playing';
      this.start();
    }).catch((err) => {
      console.error('[Menu] Preload failed:', err);
      this.restoreFromSave(data);
      this.gameState = 'playing';
      this.start();
    });
  }

  /**
   * Restore all game state from a SaveData object.
   */
  private restoreFromSave(data: SaveData): void {
    // Reset game-ended state
    this.gameEnded = false;
    this._popZeroTimer = 0;

    // Restore cult stats
    this.cultWealth = data.cult.wealth;
    this.cultInfluence = data.cult.influence;
    this.cultNotoriety = data.cult.notoriety;
    this.gameInstanceState.resources.materials = data.cult.materials ?? this.gameInstanceState.resources.materials;
    this.gameInstanceState.resources.food = data.cult.food ?? this.gameInstanceState.resources.food;
    this.currentHour = data.time.hour;
    this.currentDay = data.time.day;

    // Recalculate tickCount from hour/day so simulation continues smoothly
    // 900 ticks per day, 37.5 ticks per hour; day 1 starts at hour 6
    const hoursElapsed = (data.time.day - 1) * 24 + (data.time.hour - 6);
    this.tickCount = hoursElapsed * (900 / 24);
    this.selectedBuildItem = null;
    this.selectedEntity = null;

    // Deserialize world entities
    this.saveSystem.deserializeWorld(data, this.world);

    // Restore tile map in-place (same dimensions expected)
    // Update terrain and tile properties from save data
    let tileIndex = 0;
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const saved = data.tileMap.tiles[tileIndex++];
        if (saved) {
          this.map.setTerrain(x, y, saved.terrain as any);
          this.map.setOccupied(x, y, saved.occupied);
          if (saved.roomId !== null) {
            this.map.setRoomId(x, y, saved.roomId);
          }
          this.map.setDecor(x, y, (saved.decor ?? 'none') as any);
          // Restore buildable flag explicitly (setTerrain sets a default, but saved value may differ)
          const tile = this.map.getTile(x, y);
          if (tile) tile.buildable = saved.buildable;
        }
      }
    }

    // Restore BuildingSystem's internal object/room collections after tile occupancy.
    this.buildingSystem.restoreSnapshot(data.building);
    this.jobSystem.clear();
    this.logisticsSystem.restoreSnapshot(data.logistics, this.world);
    this.refreshLogisticsVisuals();

    this.constructionBlueprints.clear();
    let highestConstructionId = 0;
    for (const savedBlueprint of data.construction ?? []) {
      const blueprint: ConstructionBlueprint = { ...savedBlueprint };
      this.constructionBlueprints.set(blueprint.id, blueprint);
      const numericId = Number.parseInt(blueprint.id.split(':')[1] ?? '0', 10);
      if (Number.isFinite(numericId)) highestConstructionId = Math.max(highestConstructionId, numericId);
    }
    this.nextConstructionBlueprintId = highestConstructionId + 1;
    this.refreshConstructionBlueprintVisuals();

    this.harvestOrders.clear();
    for (const savedOrder of data.harvestOrders ?? []) {
      this.harvestOrders.set(savedOrder.id, { ...savedOrder });
    }
    this.refreshHarvestDesignationVisuals();

    // Resume from a clean assignment state, then recreate jobs from restored stations.
    for (const entityId of this.world.query([Job, FollowerAI])) {
      const job = this.world.getComponent(entityId, Job)!;
      job.jobId = null;
      job.type = 'idle';
      job.priority = 0;
      job.targetTile = null;
      job.workProgress = 0;

      const ai = this.world.getComponent(entityId, FollowerAI)!;
      ai.path = [];
      ai.pathIndex = 0;
      if (!ai.needTarget) ai.state = 'idle';
    }
    for (const blueprint of this.constructionBlueprints.values()) {
      this.postConstructionJob(blueprint);
    }
    for (const order of this.harvestOrders.values()) {
      this.postHarvestJob(order);
    }
    for (const obj of this.buildingSystem.getAllObjects()) {
      this.registerWorkstationJob(obj.x, obj.y, obj.objectId);
    }

    // Existing pathfinder references use the same TileMap instance; invalidate caches
    // rather than replacing the Pathfinder behind live systems.
    this.pathfinder.invalidateCache();
    this.pathfindSystem.invalidateCache();
    this.roomGraph.invalidate();

    // Rebuild scene tiles and placed objects.
    this.sceneMgr.buildTiles();
    this.sceneMgr.syncEntities();

    // Reset investigator system for the loaded map
    this.investigatorSystem.reset();

    // Update HUD
    this.updateHUD();
    this.hud.updateTime(Math.floor(this.currentHour), this.currentDay);
    this.hud.logEvent(`Save loaded — Day ${this.currentDay}, Hour ${Math.floor(this.currentHour)}.`, 'success');
    this.setTimeMode('speed1');
  }

  /**
   * Open the settings menu (from start menu or pause menu).
   */
  private openSettings(): void {
    // Rebuild settings menu with current data
    this.settingsMenu?.setData(this.settingsData);
    this.settingsMenu?.show();
  }

  /**
   * Close the settings menu and return to the previous context.
   */
  private closeSettings(): void {
    this.settingsMenu?.hide();
  }

  /**
   * Apply settings changes.
   */
  private applySettings(data: SettingsData): void {
    this.settingsData = { ...data };
    console.log('[Menu] Settings applied:', this.settingsData);

    // Apply graphics quality
    this.applyGraphicsQuality(data.graphicsQuality);

    this.closeSettings();
  }

  /**
   * Apply graphics quality to the renderer.
   */
  private applyGraphicsQuality(quality: GraphicsQuality): void {
    const pixelRatios: Record<GraphicsQuality, number> = { low: 0.5, medium: 0.75, high: 1.0 };
    const shadowSizes: Record<GraphicsQuality, number> = { low: 512, medium: 1024, high: 2048 };

    this.renderer.setPixelRatio(pixelRatios[quality]);
    this.renderer.setShadowMapSize(shadowSizes[quality]);
  }

  /**
   * Open the pause menu (Esc during gameplay).
   */
  private openPauseMenu(): void {
    if (this.gameState !== 'playing') return;
    this.gameState = 'paused';

    // Pause time simulation
    const prevTimeMode = this.timeMode;
    this.timeScale = 0;

    if (!this.pauseMenu) {
      this.pauseMenu = new PauseMenu({
        onResume: () => this.closePauseMenu(),
        onSettings: () => this.openSettings(),
        onSave: () => this.saveGame(),
        onMainMenu: () => this.returnToMainMenu(),
      });
      this.pauseMenu.mount();
    }
    this.pauseMenu.show();

    // Store previous time mode for restore
    (this.pauseMenu as any)._prevTimeMode = prevTimeMode;
  }

  /**
   * Close the pause menu and resume gameplay.
   */
  private closePauseMenu(): void {
    if (this.gameState !== 'paused') return;
    this.gameState = 'playing';

    this.pauseMenu?.hide();

    // Restore time scale
    const prevMode = (this.pauseMenu as any)._prevTimeMode as TimeControlMode | undefined;
    if (prevMode) {
      this.setTimeMode(prevMode);
    } else {
      this.setTimeMode('speed1');
    }
  }

  /**
   * Save the game to localStorage.
   */
  private saveGame(): void {
    const cult: SerializedCult = {
      influence: this.cultInfluence,
      wealth: this.cultWealth,
      notoriety: this.cultNotoriety,
      faith: 0,
      morale: 0,
      population: this.world.query([Needs]).length,
      maxPopulation: 8 + this.techTree.getEffectBonus('maxPopulationPlus'),
      leaderName: 'The Founder',
      leaderTitle: 'Cult Leader',
      day: this.currentDay,
      hour: this.currentHour,
      materials: this.gameInstanceState.resources.materials,
      food: this.gameInstanceState.resources.food,
    };

    const data = this.saveSystem.serialize(
      this.world,
      this.map,
      cult,
      { hour: this.currentHour, day: this.currentDay },
      this.buildingSystem.getSnapshot(),
      Array.from(this.constructionBlueprints.values()),
      Array.from(this.harvestOrders.values()),
      this.logisticsSystem.getSnapshot(),
    );

    const success = this.saveSystem.save(data);
    if (success) {
      this.hud.logEvent('Game saved successfully!', 'success');
      console.log('[Menu] Game saved to localStorage');
    } else {
      this.hud.logEvent('Save failed!', 'danger');
      console.error('[Menu] Save failed');
    }
  }

  /**
   * Return to the main menu from pause.
   */
  private returnToMainMenu(): void {
    console.log('[Menu] Returning to main menu...');
    this.gameState = 'menu';
    this.pauseMenu?.hide();

    // Stop the game loop
    this.running = false;

    // Show start menu again
    this.startMenu?.show();

    // Reset game state for a fresh start
    // Note: We keep the instance alive but stop the loop.
    // A full reset would require re-initializing all systems.
    // For now, the user can start a new game from the menu.
  }

  /**
   * Quit the game (Electron only).
   */
  private quitGame(): void {
    const electronAPI = (window as unknown as {
      electronAPI?: { quitApp?: () => void };
    }).electronAPI;

    if (electronAPI?.quitApp) {
      electronAPI.quitApp();
      return;
    }

    // Browser/dev fallback: return to the menu rather than attempting Node access.
    this.hud.logEvent('Quit is only available in the desktop build.', 'info');
  }}

function init(): void {
  console.log('[init] Starting Cult Tycoon...');
  const game = new CultTycoonGame();
  // Show start menu first; game starts when "New Game" is clicked
  game.showStartMenu();
  // Start the render loop immediately so the 3D scene renders behind the menu
  game.startRenderLoop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}