import './ui/quality.css';
import animationManifest from '../public/assets/animations/followers/manifest.json';
import { OnMission } from './components/OnMission';
import type { NeedFacilityTarget } from './systems/AISystem';
import { getScheduledActivity } from './systems/SchedulingSystem';
/**
 * Cult Tycoon — Main entry point.
 * Wires together all engine systems into a playable game.
 */

import * as THREE from 'three';
import { Renderer } from './engine/Renderer';
import { AudioManager } from './engine/AudioManager';
import { ParticleSystem } from './engine/ParticleSystem';
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
import { Skills } from './components/Skills';
import { Schedule, type Shift } from './components/Schedule';
import { WorkPreferences, type WorkPriority, type WorkRole } from './components/WorkPreferences';
import type { WorkJobKey } from './ui/WorkPanel';
import { NeedsSystem } from './systems/NeedsSystem';
import { JobSystem } from './systems/JobSystem';
import { AISystem, type NeedKind } from './systems/AISystem';
import { PathfindSystem } from './systems/PathfindSystem';
import { BuildingSystem, type RoomType } from './systems/BuildingSystem';
import { RenderSystem } from './systems/RenderSystem';
import { FollowerFactory } from './systems/FollowerFactory';
import { EventSystem } from './systems/EventSystem';
import { RitualSystem } from './systems/RitualSystem';
import { TechTreeSystem } from './systems/TechTreeSystem';
import { InvestigatorSystem } from './systems/InvestigatorSystem';
import { CombatSystem } from './systems/CombatSystem';
import { ResourceSystem } from './systems/ResourceSystem';
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
import { HUDManager, ResourceBarData, BuildPanelEntry, BuildCategory } from './ui/HUDManager';
import { DialogSystem } from './ui/DialogSystem';
import { StartMenu } from './ui/StartMenu';
import { PauseMenu } from './ui/PauseMenu';
import { SettingsMenu, SettingsData, GraphicsQuality } from './ui/SettingsMenu';
import { SaveSystem, type SaveData, type SerializedCult } from './systems/SaveSystem';
// WinLoseEvent type used for overlay logic

/** Top-level game state. */
type GameState = 'menu' | 'loading' | 'playing' | 'paused';

class CultTycoonGame {
  private renderer: Renderer;
  private sceneMgr: SceneManager;
  private input: InputManager;
  private hud: HUDManager;
  private dialog: DialogSystem;
  private assets: AssetLoader;
  private world: World;
  private map: TileMap;
  private pathfinder: Pathfinder;
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
  private running = false;
  private frameId = 0;
  private hudElapsed = 0;
  private readonly secondsPerDay = 600;
  private readonly startingHour = 8;
  private buildRotation = 0;
  private selectedRoom: number | null = null;
  private readonly stationIds = new Set<string>();
  private autosaveElapsed = 0;
  private raidWarning = 0;

  // Game state
  private cultWealth = 500;
  private cultInfluence = 50;
  private cultNotoriety = 5;
  private currentHour = 8;
  private currentDay = 1;
  private tickCount = 0;
  private selectedBuildItem: string | null = null;
  private selectedEntity: number | null = null;
  private buildEntries: BuildPanelEntry[] = [];
  private activeBuildCategory: string | null = null;
  private followerNames: Map<number, string> = new Map();
  private floatingTexts: { el: HTMLDivElement; life: number }[] = [];

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
  private timeMode: 'pause' | 'play' | 'fast' = 'play';

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

    // Core engine
    this.renderer = new Renderer(canvas);
    this.audio = new AudioManager();
    this.particles = new ParticleSystem(this.renderer.threeScene);
    this.world = new World();
    this.assets = new AssetLoader();

    // World generation — 64x64 large world with fog of war
    const worldGen = new WorldGen(12345);
    this.map = worldGen.generate({
      width: 64,
      height: 64,
      waterPools: 8,
      stonePatches: 10,
      dirtPatches: 12,
    });
    this.prepareClearing();
    this.pathfinder = new Pathfinder(this.map);

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
    this.aiSystem = new AISystem(this.map, this.pathfinder);
    this.pathfindSystem = new PathfindSystem(this.map, this.pathfinder);
    this.pathfindSystem.bindWorld(this.world);
    this.buildingSystem = new BuildingSystem(this.map);
    this.aiSystem.setNeedFacilityProvider(
      (need, from, entity) => this.findNeedFacility(need, from, entity),
      (_entity, need, target) => this.facilityValid(need, target),
      (_entity, need, amount) => {
        if (need !== 'hunger') return amount;
        const usable = Math.min(amount, this.gameInstanceState.resources.food * 40);
        this.gameInstanceState.resources.food -= usable / 40;
        return usable;
      },
    );
    this.jobSystem.setReachabilityCheck(
      (from, to) =>
        this.pathfinder.findPath(Math.round(from.x), Math.round(from.y), to.x, to.y).success,
    );
    this.renderSystem = new RenderSystem(this.sceneMgr);
    this.renderSystem.setBuildingSystem(this.buildingSystem);
    this.renderSystem.setFollowerNames(this.followerNames);
    this.factory = new FollowerFactory(42);

    // Event system
    this.eventSystem = new EventSystem(DataManager.getEvents() as any, 12345, (event) => {
      this.hud.logEvent(
        event.description,
        event.type === 'positive' ? 'success' : event.type === 'danger' ? 'danger' : 'warning',
      );
    });

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
        this.particles.spawnRitualCast(
          offset.x + this.map.width / 2,
          offset.z + this.map.height / 2,
        );
      },
      (result) => {
        this.cultInfluence += result.influenceGain;
        this.cultNotoriety += result.notorietyGain;
        this.hud.logEvent(
          `Ritual complete: ${result.name} (+${result.influenceGain} influence, +${result.faithGain} faith)`,
          'success',
        );
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
      { foodConsumptionPerFollower: 0, fundsUpkeepPerFollower: 0.01 },
      (event) => {
        const logType =
          event.type === 'shortage' ? 'danger' : event.type === 'milestone' ? 'success' : 'info';
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
              const result = this.missionSystem.resolveEventChoice(
                missionId,
                choiceIndex,
                this.world,
              );
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
        if (rewards.decorItemIds.length > 0)
          parts.push(`+${rewards.decorItemIds.length} decor item(s)`);
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
        const logType =
          event.severity === 'critical' || event.severity === 'danger'
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

    this.systems = [
      this.needsSystem,
      this.schedulingSystem,
      this.jobSystem,
      this.aiSystem,
      this.pathfindSystem,
      this.resourceSystem,
      this.eventSystem,
      this.ritualSystem,
      this.investigatorSystem,
      this.combatSystem,
      this.fogSystem,
    ];
    // Note: PrestigeSystem, HeatSystem, and MissionSystem are updated manually
    // in simulate() because they don't extend the System base class.
    // Order: Needs → Scheduling → Job → AI → Pathfind → Resource → Event →
    //        Ritual → Investigator → Combat → Fog, then Prestige → Heat → Mission

    // Input
    this.input = new InputManager(canvas, (x, y) => this.renderer.camera.screenToTile(x, y));

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
    this.hud.onSetWorkPriority = (entityId, job, priority) =>
      this.setWorkPriority(entityId, job, priority);
    this.hud.onAutoAssignWorkRoles = () => this.autoAssignWorkRoles();
    this.hud.onTechTreeUnlock = (techId) => this.unlockTechFromPanel(techId);
    this.hud.onSendMission = (templateId, cultistIds) =>
      this.startMissionFromPanel(templateId, cultistIds);
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
    this.hud.setTimeMode('play');
    this.hud.updateTime(6, 1);
    this.hud.logEvent('Welcome to Cult Tycoon!', 'success');
    this.hud.logEvent(
      'Your cult begins with 6 followers and a revealed starter clearing for the first compound.',
      'info',
    );
    this.hud.logEvent('Press B for build mode, click objects in the panel.', 'info');
    this.hud.logEvent('Press T for tech tree, R for rituals, M for missions.', 'info');

    // Populate build panel
    this.setupBuildPanel();

    // Input callbacks
    this.input.onTileClick = (tile) => this.onTileClick(tile.x, tile.y);
    this.input.onTileHover = (tile) => this.onTileHover(tile.x, tile.y);
    this.input.onDragStart = (tile) => this.previewBuild(tile, tile);
    this.input.onDragUpdate = (start, end) => this.previewBuild(start, end);
    this.input.onDragEnd = (start, end) => this.onBuildDragEnd(start.x, start.y, end.x, end.y);

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Setup HUD button click handlers
    this.setupHUDInteractions();
    this.hud.onMinimapNavigate = (x, y) =>
      this.renderer.camera.setTarget(x - this.map.width / 2, y - this.map.height / 2);
    this.hud.onSelectBuildObject = (id) => {
      this.openBuildCategory('objects');
      this.selectedBuildItem = id;
      this.hud.highlightBuildItem(id);
    };
    this.hud.onOpenSettings = () => this.openPauseMenu();

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
        position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
        display: flex; gap: 8px; align-items: center; padding: 8px 20px;
        background: rgba(12,18,30,0.88);
        border: 1px solid rgba(100, 100, 160, 0.4);
        border-radius: 4px; pointer-events: auto;
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 12px rgba(0,0,0,0.6);
      }
      .hud-time-btn {
        background: rgba(0,0,0,0.3); border: 1px solid rgba(100,100,160,0.3);
        color: #ccc; padding: 4px 12px; border-radius: 3px;
        cursor: pointer; font-size: 12px; transition: all 0.15s;
      }
      .hud-time-btn:hover { background: rgba(80,80,140,0.4); }
      .hud-time-btn.active { background: rgba(168,85,247,0.3); border-color: rgba(168,85,247,0.5); color: #fff; box-shadow: 0 0 8px rgba(168,85,247,0.2); }
      .hud-time { font-size: 13px; font-weight: 600; color: #ccc; margin-right: 8px; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }

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
        .hud-time-controls { padding: 6px 10px; }
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
      { id: 'rooms', label: 'Rooms', icon: '🏠' },
      { id: 'decor', label: 'Decor', icon: '🎨' },
      { id: 'demolish', label: 'Demolish', icon: '❌' },
    ];
    this.hud.setBuildCategories(categories);

    // Build all items grouped by category
    const allObjects = DataManager.getObjects();
    this.buildEntries = [
      { id: 'wall', label: 'Wall', icon: '🧱', cost: 5, category: 'structure' },
      { id: 'floor', label: 'Floor', icon: '⬜', cost: 2, category: 'structure' },
      { id: 'door', label: 'Door', icon: '🚪', cost: 10, category: 'structure' },
      ...DataManager.getRooms().map((room) => ({
        id: `room:${room.id}`,
        label: room.name,
        icon: '🏠',
        cost: 0,
        category: 'rooms' as BuildPanelEntry['category'],
      })),
      {
        id: 'room:clear',
        label: 'Clear Room',
        icon: '🧽',
        cost: 0,
        category: 'rooms' as BuildPanelEntry['category'],
      },
      ...allObjects.map((obj) => ({
        id: obj.id,
        label: obj.name,
        icon:
          obj.category === 'ritual'
            ? '🔮'
            : obj.category === 'kitchen'
              ? '🍲'
              : obj.category === 'furniture'
                ? '🛏️'
                : obj.category === 'research'
                  ? '📚'
                  : obj.category === 'storage'
                    ? '📦'
                    : obj.category === 'decor'
                      ? '🔥'
                      : obj.category === 'wellness'
                        ? '🧘'
                        : '📦',
        cost: obj.cost,
        category: obj.category === 'ritual' ? 'ritual' : ('objects' as BuildPanelEntry['category']),
      })),
      // Decor items for room prestige
      ...Object.values(DECOR_ITEMS)
        .filter((d) => !d.missionOnly)
        .map((d) => ({
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
      if ((e.target as HTMLElement)?.closest('input,select,textarea,[contenteditable=true]'))
        return;
      if (this.gameState !== 'playing' && this.gameState !== 'paused') return;
      if (e.repeat) return;
      if (e.key === 'Escape' && this.hud.closeManagementPanels()) {
        e.preventDefault();
        return;
      }
      if (this.dialog.isVisible) return;
      switch (e.key.toLowerCase()) {
        case 'f':
          if (this.selectedBuildItem) {
            this.buildRotation = (this.buildRotation + 90) % 360;
            this.hud.setBuildHint(
              `Rotation ${this.buildRotation} degrees. F to rotate; right-click to cancel.`,
            );
          }
          break;
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
          this.showRitualMenu();
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
          this.setTimeMode('play');
          break;
        case '2':
          this.setTimeMode('fast');
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

        if (this.activeBuildCategory === 'demolish') {
          this.input.setMode('demolish');
          this.selectedBuildItem = null;
        } else {
          this.input.setMode('build');
          this.selectedBuildItem = id;
          const label = item.querySelector('.hud-build-item-label')?.textContent ?? id;
          if (id === 'room:clear') {
            this.hud.logEvent(
              'Clear Room: drag over designated room tiles to remove the designation.',
              'info',
            );
          } else if (id.startsWith('room:')) {
            const roomDef = DataManager.getRoom(id.slice(5));
            this.hud.logEvent(
              `Room designation: ${label}. Drag an area at least ${roomDef?.minSize ?? 1} tiles, then place required objects.`,
              'info',
            );
          } else {
            this.hud.logEvent(`Selected: ${label} (${cost}g)`, 'info');
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
        this.hud.logEvent(
          `Selected: ${entry.querySelector('.hud-build-label')?.textContent} (${cost}g)`,
          'info',
        );
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
    // Update both legacy panel and new item grid
    const panel = this.hud['buildPanel'];
    if (panel) {
      panel.querySelectorAll('.hud-build-entry').forEach((el) => {
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
    this.buildRotation = 0;
    this.sceneMgr.clearBuildPreview();
    this.activeBuildCategory = categoryId;

    if (categoryId === 'demolish') {
      this.input.setMode('demolish');
      this.selectedBuildItem = null;
      this.hud.setBuildItems(
        [{ id: 'demolish_tool', label: 'Demolish', icon: '❌', cost: 0, category: 'demolish' }],
        categoryId,
      );
      this.hud.highlightBuildItem('demolish_tool');
      this.hud.logEvent('Demolish mode: click a built tile or object to remove it.', 'info');
      return;
    }

    // Filter items by category
    const items = this.buildEntries.filter((e) => e.category === categoryId);
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
    this.sceneMgr.clearBuildPreview();
    this.hud.setBuildHint('');
    this.input.setMode('select');
    this.selectedBuildItem = null;
    this.activeBuildCategory = null;
    this.selectedEntity = null;
    this.hud.hideBuildItems();
    this.hud.hideInspector();
    this.hud.highlightBuildItem(null);
  }

  private setTimeMode(mode: 'pause' | 'play' | 'fast'): void {
    this.accumulator = 0;
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
        '<p><b>Jobs / Work:</b> J · <b>Tech:</b> T · <b>Missions:</b> M · <b>Rituals:</b> R · <b>Pause:</b> Space</p>',
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
    this.hud.logEvent(
      `${this.followerNames.get(entityId) ?? 'Cultist'} assigned role: ${role}.`,
      'info',
    );
    this.openWorkPanel();
  }

  private setWorkPriority(entityId: number, job: WorkJobKey, priority: WorkPriority): void {
    const prefs = this.world.getComponent(entityId, WorkPreferences);
    if (!prefs) return;
    prefs.setPriority(job, priority);
    this.openWorkPanel();
  }

  private autoAssignWorkRoles(): void {
    const ids = this.world.query([Skills, WorkPreferences]);
    for (const id of ids) this.world.getComponent(id, WorkPreferences)!.applyRole('generalist');
    const available = new Set(ids);
    for (const [role, skill] of [
      ['cook', 'cooking'],
      ['researcher', 'research'],
      ['devotee', 'faith'],
    ] as const) {
      const id = [...available].sort(
        (a, b) =>
          this.world.getComponent(b, Skills)![skill] - this.world.getComponent(a, Skills)![skill],
      )[0];
      if (id !== undefined) {
        this.world.getComponent(id, WorkPreferences)!.applyRole(role);
        available.delete(id);
      }
    }
    this.openWorkPanel();
    this.hud.logEvent(
      'Best available cook, researcher and devotee assigned; others remain generalists.',
      'success',
    );
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
      this.hud.logEvent(
        `Mission launched: ${templateId} with ${cultistIds.length} cultist(s).`,
        'success',
      );
      this.audio.play('ui-select');
    } else {
      this.hud.logEvent(`Mission could not start: ${result.reason ?? 'unknown reason'}`, 'warning');
    }
    this.openMissionPanel();
  }

  private openTechTreePanel(): void {
    this.hud.showTechTreePanel({
      unlockedIds: this.techTree.getUnlocked().map((node) => node.id),
      influence: this.cultInfluence,
      faith: this.cultFaith,
    });
  }

  private unlockTechFromPanel(techId: string): void {
    const node = this.techTree.getTree().find((candidate) => candidate.id === techId);
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
      const activity = getScheduledActivity(schedule?.shift ?? 'morning', this.currentHour);

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
    const entities = this.world
      .query([Needs, FollowerAI])
      .filter((id) => !this.world.hasComponent(id, OnMission));
    const active = this.ritualSystem.getActiveRituals();

    if (active.length > 0) {
      this.dialog.alert(
        'Ritual in Progress',
        'Your cult is already performing a ritual. Let it finish before beginning another.',
        '🔮',
      );
      return;
    }

    if (available.length === 0) {
      this.dialog.alert(
        'No Rituals Available',
        'Research and progress will unlock additional rituals.',
        '🔒',
      );
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
          this.cultFaith,
          this.cultWealth,
        );
        return {
          label: `${check.ok ? '' : '🔒 '}${ritual.name}`,
          style: check.ok ? ('primary' as const) : ('default' as const),
          onClick: () => {
            const roomsReady = ritual.requirements
              .filter((id) => !!DataManager.getRoom(id))
              .every((id) =>
                this.buildingSystem
                  .getAllRooms()
                  .some(
                    (room) =>
                      room.roomDefinitionId === id &&
                      this.buildingSystem.getRoomStatus(room.id).complete,
                  ),
              );
            if (!roomsReady) {
              this.hud.logEvent('Complete the required Ritual / Prayer room first.', 'warning');
              return;
            }
            if (!check.ok) {
              this.hud.logEvent(
                `${ritual.name}: ${check.reason ?? 'requirements not met'}`,
                'warning',
              );
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
    let spawnX = centerX,
      spawnY = centerY;
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
    for (const follower of followers)
      this.schedulingSystem.assignShift(this.world, follower.entityId, 'morning');
    this.sceneMgr.syncEntities();
  }

  private onBuildDragEnd(startX: number, startY: number, endX: number, endY: number): void {
    this.sceneMgr.clearBuildPreview();
    if (this.gameState !== 'playing' || this.input.getMode() !== 'build' || !this.selectedBuildItem)
      return;

    const item = this.selectedBuildItem;

    if (item === 'room:clear') {
      const cleared = this.buildingSystem.clearRoomArea(startX, startY, endX, endY);
      if (cleared > 0) {
        this.hud.logEvent(
          `Cleared room designation from ${cleared} tile${cleared === 1 ? '' : 's'}.`,
          'info',
        );
        this.refreshWorkstations();
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

    if (item === 'wall') {
      const estimatedTiles = Math.max(Math.abs(endX - startX), Math.abs(endY - startY)) + 1;
      const estimatedCost = estimatedTiles * 5;
      if (this.cultWealth < estimatedCost) {
        this.hud.logEvent(
          `Not enough wealth for wall line. Need up to ${estimatedCost}g.`,
          'warning',
        );
        return;
      }
      const result = this.buildingSystem.placeWallLine(startX, startY, endX, endY);
      if (result.success) {
        this.cultWealth -= result.cost;
        this.hud.logEvent(`${result.message} for ${result.cost}g`, 'success');
        this.afterStructureChange();
      } else {
        this.hud.logEvent(`Can't build: ${result.message}`, 'warning');
      }
      return;
    }

    if (item === 'floor') {
      const area = (Math.abs(endX - startX) + 1) * (Math.abs(endY - startY) + 1);
      const estimatedCost = area * 2;
      if (this.cultWealth < estimatedCost) {
        this.hud.logEvent(
          `Not enough wealth for floor area. Need up to ${estimatedCost}g.`,
          'warning',
        );
        return;
      }
      const result = this.buildingSystem.placeFloorArea(startX, startY, endX, endY);
      if (result.success) {
        this.cultWealth -= result.cost;
        this.hud.logEvent(`${result.message} for ${result.cost}g`, 'success');
        this.afterStructureChange();
      } else {
        this.hud.logEvent(`Can't build: ${result.message}`, 'warning');
      }
      return;
    }

    // Doors and objects remain single-tile placement. A click is a 1×1 drag.
    this.handleBuild(endX, endY);
  }

  private afterStructureChange(): void {
    this.refreshWorkstations();
    this.audio.play('ui-build');
    this.sceneMgr.buildTiles();
    this.sceneMgr.syncEntities();
    this.pathfinder.invalidateCache();
    this.pathfindSystem.invalidateCache();
    this.roomGraph.invalidate();
    this.updateHUD();
  }

  private designateRoom(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    roomDefinitionId: string,
  ): void {
    const def = DataManager.getRoom(roomDefinitionId);
    if (!def) {
      this.hud.logEvent('Unknown room type.', 'warning');
      return;
    }

    const width = Math.abs(endX - startX) + 1;
    const height = Math.abs(endY - startY) + 1;
    const area = width * height;
    if (area < def.minSize) {
      this.hud.logEvent(
        `${def.name} needs at least ${def.minSize} tiles; selected area is ${area}.`,
        'warning',
      );
      return;
    }

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

    const room = this.buildingSystem.designateRoomArea(
      startX,
      startY,
      endX,
      endY,
      typeMap[roomDefinitionId] ?? 'generic',
      roomDefinitionId,
    );

    if (!room) {
      this.hud.logEvent(`Could not designate ${def.name} in that area.`, 'warning');
      return;
    }

    this.refreshWorkstations();
    this.sceneMgr.buildTiles();
    this.selectedRoom = room.id;
    const status = this.getRoomRequirementStatus(room.id);
    if (status.missing.length > 0) {
      this.hud.logEvent(
        `${def.name} designated (${room.area} tiles). Add: ${status.missing.join(', ')}.`,
        'info',
      );
    } else {
      this.hud.logEvent(`${def.name} designated and complete.`, 'success');
    }
    this.updateHUD();
  }

  private getRoomRequirementStatus(roomId: number): { complete: boolean; missing: string[] } {
    return this.buildingSystem.getRoomStatus(roomId);
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

  private onTileClick(x: number, y: number): void {
    const tile = this.map.getTile(x, y);
    if (!tile) return;

    if (this.input.getMode() === 'build' && this.selectedBuildItem) {
      this.handleBuild(x, y);
    } else if (this.input.getMode() === 'demolish') {
      const result = this.buildingSystem.demolish(x, y);
      if (result.success) {
        this.refreshWorkstations();
        this.hud.logEvent(`Demolished at (${x}, ${y})`, 'info');
        this.audio.play('destroy');
        this.sceneMgr.buildTiles();
        this.sceneMgr.syncEntities();
        this.pathfinder.invalidateCache();
        this.pathfindSystem.invalidateCache();
        this.roomGraph.invalidate();
      }
    } else {
      // Select mode — check for follower at this tile
      const entity = this.findFollowerAt(x, y);
      if (entity !== null) {
        this.selectFollower(entity);
      } else {
        this.selectedEntity = null;
        this.selectedRoom = tile.roomId;
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
          this.hud.logEvent(
            `Tile (${x}, ${y}): ${tile.terrain}${tile.occupied ? ' [built]' : ''}`,
            'info',
          );
        }
      }
    }
  }

  private handleBuild(x: number, y: number): void {
    const item = this.selectedBuildItem!;
    if (item.startsWith('room:')) {
      this.onBuildDragEnd(x, y, x, y);
      return;
    }
    if (item !== 'floor' && this.findFollowerAt(x, y) !== null) {
      this.hud.logEvent('A follower is standing here. Leave a clear route.', 'warning');
      return;
    }

    const objDef = DataManager.getObject(item);

    // Determine cost
    let cost = 5;
    if (item === 'wall') cost = 5;
    else if (item === 'floor') cost = 2;
    else if (item === 'door') cost = 10;
    else if (objDef) cost = objDef.cost;
    else if (item.startsWith('decor_')) cost = DECOR_ITEMS[item.slice(6)]?.cost ?? 0;

    // Check wealth
    if (this.cultWealth < cost) {
      this.hud.logEvent(
        `Not enough wealth! Need ${cost}g, have ${Math.floor(this.cultWealth)}g`,
        'warning',
      );
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
      result = this.buildingSystem.placeObject(x, y, item, this.buildRotation);
    } else if (item.startsWith('decor_') && DECOR_ITEMS[item.slice(6)]) {
      result = this.buildingSystem.placeObject(x, y, item, this.buildRotation);
    } else {
      result = { success: false, message: 'Unknown build item' };
    }

    if (result.success) {
      this.cultWealth -= cost;
      const label =
        item === 'wall'
          ? 'Wall'
          : item === 'floor'
            ? 'Floor'
            : item === 'door'
              ? 'Door'
              : (objDef?.name ?? item);
      this.hud.logEvent(`${label} placed at (${x}, ${y}) for ${cost}g`, 'success');
      this.showFloatingText(`-${cost}g`, x, y, '#fbbf24');
      this.audio.play('ui-build');
      const offset = { x: -this.map.width / 2, z: -this.map.height / 2 };
      this.particles.spawnBuildDust(x + offset.x + 0.5, y + offset.z + 0.5);
      this.particles.spawnResourceGain(x + offset.x + 0.5, y + offset.z + 0.5, 0xfbbf24);
      this.sceneMgr.buildTiles();
      this.sceneMgr.syncEntities();
      this.pathfinder.invalidateCache();
      this.pathfindSystem.invalidateCache();

      // Invalidate room graph when structure changes
      if (item === 'wall' || item === 'door' || item === 'floor') {
        this.roomGraph.invalidate();
      }

      // Functional objects create persistent workstation jobs.
      if (objDef) {
        this.refreshWorkstations();
        this.refreshRoomRequirementAt(x, y);
      }

      this.refreshWorkstations();
      // Handle decor placement — attach to room's Prestige component
      if (item.startsWith('decor_')) {
        const decorId = item.replace('decor_', '');
        this.handleDecorPlacement(x, y, decorId);
      }

      this.updateHUD();
    } else {
      this.hud.logEvent(`Can't build: ${result.message}`, 'warning');
    }
  }

  private facilityValid(need: NeedKind, target: NeedFacilityTarget): boolean {
    const object = this.buildingSystem.getAllObjects().find((obj) => obj.id === target.id);
    if (!object || !this.map.isBuildable(target.x, target.y)) return false;
    const roomId = this.map.getTile(object.x, object.y)?.roomId;
    if (
      roomId !== null &&
      roomId !== undefined &&
      !this.buildingSystem.getRoomStatus(roomId).complete
    )
      return false;
    if (need === 'hunger' && this.gameInstanceState.resources.food <= 0) return false;
    return this.buildingSystem
      .getAdjacentTiles(object)
      .some((t) => t.x === target.x && t.y === target.y);
  }

  private findNeedFacility(
    need: NeedKind,
    from: { x: number; y: number },
    entity?: number,
  ): NeedFacilityTarget | null {
    const types: Record<NeedKind, string[]> = {
      hunger: ['cookpot', 'cauldron'],
      energy: ['bed', 'bunk_bed'],
      faith: ['altar', 'sacrificial_altar', 'offering_bowl', 'statue'],
      fun: ['bonfire', 'zen_garden', 'meditation_mat'],
      sanity: ['meditation_mat', 'zen_garden', 'bonfire'],
      bladder: ['toilet'],
      hygiene: ['shower'],
    };
    const reserved = new Set(
      this.world
        .query([FollowerAI])
        .filter((id) => id !== entity)
        .map((id) => this.world.getComponent(id, FollowerAI)!.needFacilityId),
    );
    const candidates = this.buildingSystem
      .getAllObjects()
      .filter((obj) => types[need].includes(obj.objectId) && !reserved.has(obj.id))
      .flatMap((obj) =>
        this.buildingSystem.getAdjacentTiles(obj).map((tile) => ({ ...tile, id: obj.id })),
      )
      .filter((tile) => this.facilityValid(need, tile))
      .sort(
        (a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y),
      );
    for (const target of candidates) {
      const path = this.pathfinder.findPath(
        Math.round(from.x),
        Math.round(from.y),
        target.x,
        target.y,
      );
      if (path.success) return target;
    }
    return null;
  }

  private refreshWorkstations(): void {
    const available = new Set<string>();
    for (const object of this.buildingSystem.getAllObjects()) {
      const roomId = this.map.getTile(object.x, object.y)?.roomId;
      if (
        roomId !== null &&
        roomId !== undefined &&
        !this.buildingSystem.getRoomStatus(roomId).complete
      )
        continue;
      // A research station and kitchen require a completed designated room.
      if (
        ['research_desk', 'library_shelf', 'cookpot', 'cauldron'].includes(object.objectId) &&
        roomId == null
      )
        continue;
      const key = `station:${object.x}:${object.y}`;
      available.add(key);
      if (!this.stationIds.has(key))
        this.registerWorkstationJob(object.x, object.y, object.objectId);
    }
    for (const key of this.stationIds)
      if (!available.has(key)) {
        this.jobSystem.cancelJob(key);
        this.stationIds.delete(key);
      }
  }

  private registerWorkstationJob(x: number, y: number, objectId: string): void {
    const types: Record<
      string,
      {
        type: 'cook' | 'research' | 'pray' | 'haul';
        skill: 'cooking' | 'research' | 'faith' | 'construction';
        priority: number;
      }
    > = {
      cookpot: { type: 'cook', skill: 'cooking', priority: 7 },
      cauldron: { type: 'cook', skill: 'cooking', priority: 8 },
      garden_plot: { type: 'cook', skill: 'cooking', priority: 5 },
      farm_plot: { type: 'cook', skill: 'cooking', priority: 6 },
      research_desk: { type: 'research', skill: 'research', priority: 7 },
      library_shelf: { type: 'research', skill: 'research', priority: 8 },
      altar: { type: 'pray', skill: 'faith', priority: 6 },
      sacrificial_altar: { type: 'pray', skill: 'faith', priority: 8 },
      offering_bowl: { type: 'pray', skill: 'faith', priority: 4 },
      storage_box: { type: 'haul', skill: 'construction', priority: 1 },
      warehouse: { type: 'haul', skill: 'construction', priority: 2 },
    };
    const station = types[objectId],
      object = this.buildingSystem.getObjectAt(x, y);
    if (!station || !object) return;
    const target = this.buildingSystem.getAdjacentTiles(object)[0];
    if (!target) return;
    const id = `station:${x}:${y}`;
    if (this.stationIds.has(id)) return;
    this.jobSystem.postJob({
      id,
      type: station.type,
      targetTile: target,
      priority: station.priority,
      duration: 8,
      repeat: true,
      requiredSkill: station.skill,
      minSkillLevel: 1,
    });
    this.stationIds.add(id);
  }

  private buildTilesFor(
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): { x: number; y: number }[] {
    const item = this.selectedBuildItem;
    if (!item) return [];
    if (item === 'wall') {
      if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y))
        return Array.from({ length: Math.abs(end.x - start.x) + 1 }, (_, i) => ({
          x: Math.min(start.x, end.x) + i,
          y: start.y,
        }));
      return Array.from({ length: Math.abs(end.y - start.y) + 1 }, (_, i) => ({
        x: start.x,
        y: Math.min(start.y, end.y) + i,
      }));
    }
    if (item === 'floor' || item.startsWith('room:')) {
      const tiles = [];
      for (let y = Math.min(start.y, end.y); y <= Math.max(start.y, end.y); y++)
        for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x++)
          tiles.push({ x, y });
      return tiles;
    }
    if (item === 'door') return [end];
    return this.buildingSystem.getFootprint(end.x, end.y, item, this.buildRotation);
  }
  private previewBuild(start: { x: number; y: number }, end: { x: number; y: number }): void {
    const item = this.selectedBuildItem;
    if (!item) return;
    const tiles = this.buildTilesFor(start, end);
    if (tiles.length > 4096) return;
    const room = item.startsWith('room:'),
      def = room ? DataManager.getRoom(item.slice(5)) : null;
    const validGround = tiles.every((t) => {
      const tile = this.map.getTile(t.x, t.y);
      return (
        !!tile && tile.buildable && (room || item === 'floor' || item === 'door' || !tile.occupied)
      );
    });
    const cost = room
      ? 0
      : item === 'wall'
        ? tiles.filter((t) => this.map.isBuildable(t.x, t.y)).length * 5
        : item === 'floor'
          ? tiles.filter(
              (t) =>
                !this.buildingSystem.floorTiles.has(`${t.x},${t.y}`) &&
                !this.map.isOccupied(t.x, t.y),
            ).length * 2
          : item === 'door'
            ? 10
            : (DataManager.getObject(item)?.cost ??
              DECOR_ITEMS[item.replace('decor_', '')]?.cost ??
              0);
    const valid = validGround && cost <= this.cultWealth && (!def || tiles.length >= def.minSize);
    this.sceneMgr.showBuildPreview(tiles, valid);
    this.hud.setBuildHint(
      `${def?.name ?? DataManager.getObject(item)?.name ?? item.replace('room:', '')}: ${tiles.length} tile${tiles.length === 1 ? '' : 's'} / ${cost} coins${!valid ? ' / Cannot place here' : ''}. Drag to build. F rotates objects; right-click cancels.`,
    );
  }
  private onTileHover(x: number, y: number): void {
    if (
      this.input.getMode() === 'build' &&
      this.selectedBuildItem &&
      !this.input.getState().isDragging
    )
      this.previewBuild({ x, y }, { x, y });
    else if (this.input.getMode() === 'demolish') this.sceneMgr.highlightTile(x, y);
  }

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
      (prestige as Prestige & { baseLevel?: number }).baseLevel = Math.min(
        3,
        Math.floor(room.area / 20),
      );
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

  private showFloatingText(
    text: string,
    tileX: number,
    tileY: number,
    color: string = '#fff',
  ): void {
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
    this.floatingTexts = this.floatingTexts.filter((ft) => {
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
    this.selectedRoom = null;
    this.selectedEntity = entity;
    const needs = this.world.getComponent(entity, Needs);
    const health = this.world.getComponent(entity, Health);
    const traits = this.world.getComponent(entity, Traits);
    const job = this.world.getComponent(entity, Job);
    const name = this.followerNames.get(entity) ?? 'Unknown';

    if (!needs) return;

    this.hud.showInspector({
      name,
      role: this.world.getComponent(entity, WorkPreferences)?.role ?? 'Follower',
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
      job: this.world.hasComponent(entity, OnMission)
        ? 'Away on mission'
        : (this.world.getComponent(entity, FollowerAI)?.activityReason ?? job?.type ?? 'idle'),
      traits: traits?.traits ?? [],
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
      wealth: Math.floor(this.cultWealth),
      notoriety: Math.floor(this.heatSystem.getHeat()),
      food: Math.floor(this.gameInstanceState.resources.food),
      faith: pop > 0 ? totalFaith / pop : 100,
      morale: pop > 0 ? (totalFun + totalSanity) / (2 * pop) : 100,
      population: pop,
      maxPopulation: 8 + maxPopBonus,
    };
    this.hud.updateTime(this.currentHour, this.currentDay);
    this.hud.updateResourceBar(data);
    this.hud.updateMinimap({
      width: this.map.width,
      height: this.map.height,
      tiles: this.map.getAllTiles().map((tile) => ({
        x: tile.x,
        y: tile.y,
        terrain: tile.terrain,
        explored: this.fogOfWar.isExplored(tile.x, tile.y),
      })),
      followers: this.world.query([Transform, FollowerAI]).map((entityId) => {
        const transform = this.world.getComponent(entityId, Transform)!;
        return { x: transform.x, y: transform.y };
      }),
      objects: this.buildingSystem.getAllObjects().map((obj) => ({ x: obj.x, y: obj.y })),
      rooms: this.buildingSystem.getAllRooms().map((room) => ({
        tiles: room.tiles.map((tile) => ({ ...tile })),
      })),
    });
    this.updateAlphaObjective();

    // Keep open management panels current while the simulation runs.
    this.hud.updateTechTreePanel({
      unlockedIds: this.techTree.getUnlocked().map((node) => node.id),
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
          },
          priorities: { ...prefs.priorities },
        };
      }),
    });

    if (this.selectedRoom !== null) {
      const room = this.buildingSystem.getRoom(this.selectedRoom);
      if (room) {
        const def = DataManager.getRoom(room.roomDefinitionId ?? '');
        this.hud.showRoomInspector(
          def?.name ?? 'Room',
          room.area,
          this.buildingSystem.getRoomStatus(room.id),
        );
      } else {
        this.selectedRoom = null;
        this.hud.hideInspector();
      }
    }
    // Update inspector if a follower is selected
    if (this.selectedEntity !== null) {
      this.selectFollower(this.selectedEntity);
    }
  }

  private updateAlphaObjective(): void {
    const rooms = this.buildingSystem.getAllRooms();
    const completeRoomIds = new Set(
      rooms
        .filter((room) => this.getRoomRequirementStatus(room.id).complete)
        .map((room) => room.roomDefinitionId)
        .filter((id): id is string => !!id),
    );
    const workPrefs = this.world
      .query([WorkPreferences])
      .map((entityId) => this.world.getComponent(entityId, WorkPreferences)!)
      .filter(Boolean);
    const hasSpecializedRole = workPrefs.some((pref) => pref.role !== 'generalist');
    const researched = this.techTree.getUnlocked().length;
    const activeMissions = this.missionSystem.getActiveMissions().length;
    const heat = this.heatSystem.getHeat();

    if (!rooms.some((room) => room.roomDefinitionId === 'dormitory')) {
      this.hud.setObjective(
        'Designate a Dormitory',
        'Open Build → Rooms → Dormitory, then drag a room area of at least 4 tiles near your starting clearing.',
      );
    } else if (!completeRoomIds.has('dormitory')) {
      this.hud.setObjective(
        'Complete the Dormitory',
        'Add floor tiles, surrounding walls, a door and a bed. Click the room to see its live requirements.',
      );
    } else if (!rooms.some((room) => room.roomDefinitionId === 'kitchen')) {
      this.hud.setObjective(
        'Designate a Kitchen',
        'Designate a Kitchen of at least 4 tiles; enclose it, add flooring, a cooking pot and a storage box.',
      );
    } else if (!completeRoomIds.has('kitchen')) {
      const kitchen = rooms.find((room) => room.roomDefinitionId === 'kitchen');
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
    } else if (activeMissions === 0 && this.missionSystem.completedCount === 0) {
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
        'Expand rooms, keep needs stable, improve work priorities, research, run missions and prepare for rising heat.',
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
    this.start();
  }
  start(): void {
    if (this.running) return;
    this.lastTime = performance.now();
    this.running = true;
    this.frameId = requestAnimationFrame(this.gameLoop);
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
    const loaded = await this.assets.loadAll(assetUrls);
    if (assetUrls.slice(0, 12).some((url) => !loaded.has(url)))
      throw new Error('Follower assets are incomplete');
    await this.preloadFollowerAnimationLibrary();
    console.log('[preloadAssets] All assets loaded. Cached:', this.assets.cachedCount);
    // Re-sync entities now that assets are loaded.
    this.sceneMgr.syncEntities();
    console.log('[preloadAssets] syncEntities done. Starting game...');
  }

  private async preloadFollowerAnimationLibrary(): Promise<void> {
    try {
      const manifest = animationManifest;
      if (!manifest.enabled || !manifest.source) {
        console.log('[animations] Shared follower animation library disabled.');
        return;
      }

      const asset = await this.assets.load(manifest.source);
      if (!asset || asset.animations.length === 0) {
        console.warn(
          '[animations] Shared follower animation library enabled but no clips were loaded.',
        );
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
    this.frameId = requestAnimationFrame(this.gameLoop);

    const now = performance.now();
    const frameTime = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    // Only simulate when playing
    if (this.gameState === 'playing') {
      // Fixed timestep simulation
      this.accumulator += frameTime * this.timeScale;
      while (this.accumulator >= this.tickDuration && this.timeScale > 0 && !this.gameEnded) {
        this.simulate(this.tickDuration);
        this.accumulator -= this.tickDuration;
      }
    }

    // Always render (even when paused, so the scene is visible behind pause overlay)
    const blocked =
      this.gameState !== 'playing' || this.hud.hasManagementPanel() || this.dialog.isVisible;
    this.input.setEnabled(!blocked);
    this.renderer.camera.setEnabled(!blocked);
    this.renderSystem.update(
      this.world,
      this.gameState === 'playing' ? frameTime * this.timeScale : 0,
    );
    this.hudElapsed += frameTime;
    if (this.hudElapsed >= 0.25) {
      this.hudElapsed = 0;
      this.updateHUD();
    }
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
    this.gameInstanceState.resources.funds = this.cultWealth;
    this.gameInstanceState.resources.influence = this.cultInfluence;
    this.gameInstanceState.resources.notoriety = this.cultNotoriety;

    for (const system of this.systems) {
      system.update(this.world, dt);
    }

    this.cultWealth = this.gameInstanceState.resources.funds;
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
    this.missionSystem.update(this.world, (dt * 24) / this.secondsPerDay);

    // Check for police raids
    if (this.heatSystem.isRaidReady()) {
      this.raidWarning += dt;
      if (this.raidWarning <= dt)
        this.hud.logEvent(
          'Raid warning: police arrive in 30 seconds unless heat falls below 100. Use a PR mission or reduce exposure.',
          'danger',
        );
    } else this.raidWarning = 0;
    if (this.heatSystem.isRaidReady() && this.raidWarning >= 30) {
      this.raidWarning = 0;
      const roster = this.world
        .query([Needs, FollowerAI])
        .filter((id) => !this.world.hasComponent(id, OnMission));
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

    this.tickCount += dt;
    const elapsedHours = this.startingHour + (this.tickCount * 24) / this.secondsPerDay;
    this.currentHour = elapsedHours % 24;
    this.schedulingSystem.setHour(this.currentHour);
    this.currentDay = 1 + Math.floor(elapsedHours / 24);
    this.eventSystem.setDay(this.currentDay);
    this.autosaveElapsed += dt;
    if (this.autosaveElapsed >= 300) {
      this.autosaveElapsed = 0; /* Manual save remains authoritative during Alpha. */
    }
    // Supporter donations scale with follower faith; critical needs lower income.
    const local = this.world
      .query([Needs, FollowerAI])
      .filter((id) => !this.world.hasComponent(id, OnMission));
    let donations = 0;
    for (const id of local) {
      const needs = this.world.getComponent(id, Needs)!;
      donations += (0.03 * needs.faith) / 100;
    }
    this.cultWealth += donations * dt;
    const reduction = this.techTree.getEffectBonus('heatReductionRate');
    if (reduction > 0) this.heatSystem.reduceHeat(reduction * dt);
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
    if (entities.length >= 6) {
      this.showWinOverlay();
    } else {
      this.hud.logEvent(
        `Ascension ritual complete! Need 6 followers to win (have ${entities.length}).`,
        'success',
      );
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
      this.setTimeMode('play');
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
      abandoned: {
        icon: '👻',
        title: 'Your cult has been abandoned',
        desc: 'All your followers have left. The cult is no more.',
      },
      bankruptcy: {
        icon: '💸',
        title: 'Your cult is bankrupt',
        desc: 'Wealth has dropped below -50g. The cult cannot sustain itself.',
      },
      busted: {
        icon: '🚨',
        title: 'Your cult has been busted',
        desc: 'Heat reached a critical level. Authorities overwhelmed the compound and shut the cult down.',
      },
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
      notoriety: Math.floor(this.heatSystem.getHeat()),
      food: Math.floor(this.gameInstanceState.resources.food),
    };
  }

  /**
   * Reset game state for a new game (from win/lose overlay).
   */
  private resetForNewGame(): void {
    this.closeBuildMenu();
    this.hud.closeManagementPanels();
    this.dialog.close();
    this.jobSystem.clear();
    this.sceneMgr.resetEntities();
    this.world.clear();
    this.gameEnded = false;
    this._popZeroTimer = 0;
    this.raidWarning = 0;
    this.autosaveElapsed = 0;
    this.tickCount = 0;
    this.currentDay = 1;
    this.currentHour = this.startingHour;
    this.accumulator = 0;
    this.cultWealth = 500;
    this.cultInfluence = 50;
    this.cultNotoriety = 5;
    this.selectedEntity = null;
    this.selectedRoom = null;
    this.followerNames.clear();
    this.stationIds.clear();
    this.hud.hideInspector();
    this.hud.clearEventLog();
    const generated = new WorldGen(12345).generate({
      width: this.map.width,
      height: this.map.height,
      waterPools: 8,
      stonePatches: 10,
      dirtPatches: 12,
    });
    this.map.clear();
    for (const tile of generated.getAllTiles())
      Object.assign(this.map.getTile(tile.x, tile.y)!, tile);
    this.prepareClearing();
    this.buildingSystem.restoreSnapshot(undefined);
    this.pathfinder.invalidateCache();
    this.pathfindSystem.invalidateCache();
    this.roomGraph.invalidate();
    this.aiSystem.reset();
    this.investigatorSystem.reset();
    this.combatSystem.reset();
    this.eventSystem.reset();
    this.resourceSystem.reset();
    this.heatSystem.reset();
    this.techTree.restore();
    this.ritualSystem.reset();
    this.missionSystem.restore({ missions: [], completedCount: 0 }, this.world);
    Object.assign(
      this.gameInstanceState.resources,
      new GameInstanceState({ funds: 500, influence: 50, food: 40, notoriety: 5 }).resources,
    );
    this.fogOfWar.restore({ explored: [], permanent: [] });
    this.fogOfWar.revealArea(Math.floor(this.map.width / 2), Math.floor(this.map.height / 2), 15);
    this.prestigeSystem = new PrestigeSystem();
    this.roomEntities.clear();
    this.factory = new FollowerFactory(42);
    this.spawnFollowers(6);
    this.renderer.camera.setTarget(0, 0);
    this.renderer.camera.setZoom(40);
    this.sceneMgr.buildTiles();
    this.setTimeMode('play');
    this.schedulingSystem.setHour(this.currentHour);
    this.updateHUD();
    this.hud.logEvent(
      'Welcome, Founder. A clear plot, six followers and 500 coins. Start with a Dormitory.',
      'success',
    );
    this.hud.logEvent(
      'Rooms are free to designate. Floors, walls, a door and furniture make them operational.',
      'info',
    );
  }

  private prepareClearing(): void {
    const cx = Math.floor(this.map.width / 2),
      cy = Math.floor(this.map.height / 2);
    for (let y = cy - 10; y <= cy + 10; y++)
      for (let x = cx - 10; x <= cx + 10; x++) {
        this.map.setTerrain(x, y, 'grass');
        const t = this.map.getTile(x, y);
        if (t) {
          t.decor = 'none';
          t.occupied = false;
        }
      }
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frameId);
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
    this.settingsMenu = new SettingsMenu(
      {
        onApply: (data) => this.applySettings(data),
        onClose: () => this.closeSettings(),
      },
      this.settingsData,
    );
    this.settingsMenu.mount();
    this.settingsMenu.hide();
  }

  /**
   * Start a new game from the start menu.
   */
  private startNewGame(): void {
    if (this.gameState === 'loading') return;
    this.startMenu?.hide();
    this.gameState = 'loading';
    this.hud.setLoading(true);
    this.preloadAssets()
      .then(() => {
        this.resetForNewGame();
        this.gameState = 'playing';
        this.hud.setLoading(false);
        this.start();
      })
      .catch((error) => {
        console.error(error);
        this.gameState = 'menu';
        this.hud.setLoading(false);
        this.startMenu?.show();
        this.dialog.alert(
          'Could not start the game',
          'Required assets could not be loaded. Restart the game or try a fresh installation.',
        );
      });
  }

  /**
   * Continue from a saved game.
   */
  private continueGame(): void {
    if (this.gameState === 'loading') return;
    const data = this.saveSystem.load();
    if (!data) {
      this.dialog.alert('No valid save', 'No valid manual save is available. Start a new game.');
      return;
    }
    if (data.tileMap.width !== this.map.width || data.tileMap.height !== this.map.height) {
      this.dialog.alert(
        'Incompatible map',
        'This save uses unsupported map dimensions. Your save has not been changed.',
      );
      return;
    }
    this.startMenu?.hide();
    this.gameState = 'loading';
    this.hud.setLoading(true);
    this.preloadAssets()
      .then(() => {
        this.restoreFromSave(data);
        this.gameState = 'playing';
        this.hud.setLoading(false);
        this.start();
        this.missionSystem.presentPendingEvents();
      })
      .catch((error) => {
        console.error(error);
        this.gameState = 'menu';
        this.hud.setLoading(false);
        this.startMenu?.show();
      });
  }

  /**
   * Restore all game state from a SaveData object.
   */
  private restoreFromSave(data: SaveData): void {
    this.resetForNewGame();
    this.jobSystem.clear();
    this.sceneMgr.resetEntities();
    this.stationIds.clear();
    this.saveSystem.deserializeWorld(data, this.world);
    for (let y = 0; y < this.map.height; y++)
      for (let x = 0; x < this.map.width; x++) {
        const saved = data.tileMap.tiles[y * this.map.width + x];
        const tile = this.map.getTile(x, y)!;
        this.map.setTerrain(x, y, saved.terrain as 'grass' | 'water' | 'stone' | 'dirt');
        Object.assign(tile, {
          occupied: saved.occupied,
          roomId: saved.roomId,
          buildable: saved.buildable,
          decor: saved.decor ?? 'none',
        });
      }
    this.buildingSystem.restoreSnapshot(data.building);
    this.cultWealth = data.cult.wealth;
    this.cultInfluence = data.cult.influence;
    this.cultNotoriety = data.cult.notoriety;
    this.currentDay = data.time.day;
    this.currentHour = data.time.hour;
    this.tickCount =
      data.session?.elapsed ??
      Math.max(
        0,
        (((data.time.day - 1) * 24 + data.time.hour - this.startingHour) * this.secondsPerDay) / 24,
      );
    if (data.session) {
      Object.assign(this.gameInstanceState.resources, data.session.resources);
      this.techTree.restore(data.session.tech);
      this.heatSystem.restore(data.session.heat);
      this.fogOfWar.restore(data.session.fog);
      if (data.session.rituals) this.ritualSystem.restore(data.session.rituals);
    }
    this.followerNames.clear();
    for (const id of this.world.query([FollowerAI])) {
      const ai = this.world.getComponent(id, FollowerAI)!;
      ai.path = [];
      ai.pathIndex = 0;
      ai.needTargetTile = null;
      ai.needFacilityId = null;
      ai.state = ai.needTarget ? 'needs' : 'idle';
      const job = this.world.getComponent(id, Job);
      if (job) {
        job.type = 'idle';
        job.jobId = null;
        job.targetTile = null;
        job.workProgress = 0;
      }
      if (!this.world.hasComponent(id, WorkPreferences))
        this.world.addComponent(id, new WorkPreferences(id));
      if (!this.world.hasComponent(id, Schedule)) this.world.addComponent(id, new Schedule(id));
      this.followerNames.set(
        id,
        data.session?.names.find(([key]) => key === id)?.[1] ?? `Cultist ${id + 1}`,
      );
    }
    this.missionSystem.restore(
      data.session?.missions ?? { missions: [], completedCount: 0 },
      this.world,
    );
    if (data.session?.camera) {
      this.renderer.camera.setTarget(data.session.camera.x, data.session.camera.y);
      this.renderer.camera.setZoom(data.session.camera.zoom);
    }
    this.schedulingSystem.setHour(this.currentHour);
    this.eventSystem.setDay(this.currentDay);
    this.pathfinder.invalidateCache();
    this.pathfindSystem.invalidateCache();
    this.refreshWorkstations();
    this.sceneMgr.buildTiles();
    this.updateHUD();
    this.setTimeMode('play');
    this.hud.logEvent(
      `Restored Day ${this.currentDay}. Rooms, resources, work priorities, research and missions loaded.`,
      'success',
    );
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
    const prevMode = (this.pauseMenu as any)._prevTimeMode as 'pause' | 'play' | 'fast' | undefined;
    if (prevMode) {
      this.setTimeMode(prevMode);
    } else {
      this.setTimeMode('play');
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
    };

    const data = this.saveSystem.serialize(
      this.world,
      this.map,
      cult,
      { hour: this.currentHour, day: this.currentDay },
      this.buildingSystem.getSnapshot(),
    );

    const target = this.renderer.camera.getTarget();
    data.session = {
      elapsed: this.tickCount,
      resources: {
        ...this.gameInstanceState.resources,
        funds: this.cultWealth,
        influence: this.cultInfluence,
        notoriety: this.cultNotoriety,
      },
      tech: this.techTree.getUnlocked().map((n) => n.id),
      names: [...this.followerNames],
      missions: this.missionSystem.snapshot(),
      rituals: this.ritualSystem.snapshot(),
      heat: this.heatSystem.snapshot(),
      fog: this.fogOfWar.snapshot(),
      camera: { x: target.x, y: target.z, zoom: this.renderer.camera.getZoom() },
    };
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

    // Keep the single render loop alive; menu state disables simulation.
    this.hud.closeManagementPanels();
    this.closeBuildMenu();
    this.startMenu?.setCanContinue(this.saveSystem.hasSave());

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
    const electronAPI = (
      window as unknown as {
        electronAPI?: { quitApp?: () => void };
      }
    ).electronAPI;

    if (electronAPI?.quitApp) {
      electronAPI.quitApp();
      return;
    }

    // Browser/dev fallback: return to the menu rather than attempting Node access.
    this.hud.logEvent('Quit is only available in the desktop build.', 'info');
  }
}

function init(): void {
  console.log('[init] Starting Cult Tycoon...');
  const game = new CultTycoonGame();
  // Show start menu first; game starts when "New Game" is clicked
  if (new window.URLSearchParams(window.location.search).has('qa'))
    (window as unknown as { __game: CultTycoonGame }).__game = game;
  game.showStartMenu();
  // Start the render loop immediately so the 3D scene renders behind the menu
  game.startRenderLoop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
