# Cult Tycoon — Technical Implementation Document

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│                 Electron/Tauri               │
│            (Steamworks SDK wrapper)          │
├─────────────────────────────────────────────┤
│                  UI Layer                     │
│   (HTML/CSS overlay — React or vanilla DOM)  │
├─────────────────────────────────────────────┤
│              Game Engine Layer                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Renderer │ │  Input   │ │   Audio      │ │
│  │ (Three.js)│ │ Manager  │ │ (Howler.js)  │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
├─────────────────────────────────────────────┤
│              Simulation Layer                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │   ECS    │ │  World   │ │   Pathfind   │ │
│  │  Core    │ │  System  │ │   (A*)       │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Needs AI │ │  Jobs    │ │  Rituals     │ │
│  │ System   │ │  System  │ │  System      │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Combat   │ │  Tech    │ │   Save       │ │
│  │ System   │ │  Tree    │ │   System     │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
├─────────────────────────────────────────────┤
│              Data Layer                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Content  │ │  Config  │ │   State      │ │
│  │ (JSON)   │ │ (JSON)   │ │  (Stores)    │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└─────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Rendering | Three.js r170+ | Mature WebGL renderer, instancing, custom shaders |
| Language | TypeScript 5.x | Type safety, better refactoring, IDE support |
| Bundler | Vite 5.x | Fast HMR, ES modules, tree shaking |
| ECS | Custom (bitECS or miniplex) | Lightweight entity management |
| Audio | Howler.js 2.x | Web audio abstraction, spatial audio |
| Pathfinding | pathfinding-js (A*) | Tile-based pathfinding, well-tested |
| State Mgmt | Zustand or custom stores | Lightweight, no boilerplate |
| UI | Vanilla DOM + CSS | Minimal overhead, no framework dependency |
| Desktop | Electron 30+ / Tauri 2.x | Steam wrapper, filesystem access |
| Steam | steamworks.js | Node.js Steamworks bindings |
| Testing | Vitest + Playwright | Unit + E2E browser testing |
| Assets | Blender → glTF | 3D modeling → web-ready format |

## Project Structure

```
cult-tycoon/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.ts                  # Entry point
│   ├── game/
│   │   ├── Game.ts              # Main game class, loop orchestration
│   │   ├── GameLoop.ts          # Fixed timestep + render loop
│   │   └── GameState.ts         # Global game state store
│   ├── engine/
│   │   ├── Renderer.ts          # Three.js renderer setup
│   │   ├── SceneManager.ts      # Scene/camera management
│   │   ├── InputManager.ts      # Mouse/keyboard/touch input
│   │   ├── AssetLoader.ts       # glTF/texture/audio loading
│   │   └── IsoCamera.ts         # Isometric camera controller
│   ├── ecs/
│   │   ├── World.ts             # ECS world (entity registry)
│   │   ├── Entity.ts            # Entity factory
│   │   ├── Component.ts         # Component definitions
│   │   └── System.ts            # System base class
│   ├── components/
│   │   ├── Transform.ts         # Position, rotation, scale
│   │   ├── Renderable.ts        # Three.js mesh ref
│   │   ├── Needs.ts             # Hunger, faith, fun, health, sanity
│   │   ├── Job.ts               # Current job assignment
│   │   ├── Skills.ts            # Skill levels
│   │   ├── Traits.ts            # Personality traits
│   │   ├── Health.ts            # HP, status effects
│   │   ├── Inventory.ts         # Carried items
│   │   └── FollowerAI.ts        # AI state machine ref
│   ├── systems/
│   │   ├── RenderSystem.ts      # Syncs ECS → Three.js
│   │   ├── NeedsSystem.ts       # Degrade/fulfill needs over time
│   │   ├── AISystem.ts          # Follower decision making
│   │   ├── JobSystem.ts         # Task assignment & dispatch
│   │   ├── PathfindSystem.ts    # A* pathfinding
│   │   ├── BuildingSystem.ts    # Room/placement logic
│   │   ├── RitualSystem.ts      # Ritual execution
│   │   ├── CombatSystem.ts      # Crusade combat
│   │   ├── ResourceSystem.ts    # Faith/funds/materials flow
│   │   ├── TechSystem.ts        # Research & unlocks
│   │   ├── EventSystem.ts       # Random events
│   │   └── SaveSystem.ts        # Serialization
│   ├── world/
│   │   ├── TileMap.ts           # Grid-based tile system
│   │   ├── RoomGraph.ts         # Room detection & management
│   │   ├── Pathfinder.ts        # A* implementation
│   │   └── WorldGen.ts          # Terrain/biome generation
│   ├── ui/
│   │   ├── HUD.ts               # Top bar resources
│   │   ├── BuildPanel.ts        # Bottom build menu
│   │   ├── InspectorPanel.ts    # Follower/building inspector
│   │   ├── EventLog.ts          # Notification feed
│   │   ├── TimeControls.ts      # Pause/speed
│   │   └── DialogSystem.ts      # Modals, choices, tutorial
│   ├── data/
│   │   ├── rooms.json           # Room definitions
│   │   ├── objects.json         # Placeable objects
│   │   ├── rituals.json         # Ritual definitions
│   │   ├── tech.json            # Tech tree data
│   │   ├── traits.json          # Follower traits
│   │   ├── patrons.json         # Dark Patron definitions
│   │   └── events.json          # Random event definitions
│   ├── utils/
│   │   ├── math.ts              # Vector/isometric math
│   │   ├── rng.ts               # Seeded random
│   │   └── save.ts              # Save/load helpers
│   └── types/
│       └── index.d.ts           # Shared types
├── assets/
│   ├── models/                  # Blender → glTF exports
│   │   ├── followers/
│   │   ├── buildings/
│   │   ├── props/
│   │   ├── terrain/
│   │   └── effects/
│   ├── textures/
│   ├── audio/
│   │   ├── music/
│   │   ├── sfx/
│   │   └── ambient/
│   └── ui/
│       ├── icons/
│       └── fonts/
├── tests/
│   ├── unit/
│   └── e2e/
├── docs/
│   ├── FEATURE_ROADMAP.md
│   ├── TECHNICAL_IMPLEMENTATION.md
│   └── ARCHITECTURE.md
└── .github/
    ├── ISSUE_TEMPLATE/
    └── workflows/
        └── ci.yml
```

## ECS Architecture

### Components (data only, no logic)

```typescript
// Components are plain data objects tagged with an entity ID
interface TransformComponent {
  x: number; y: number; z: number;
  rotation: number;
  scale: number;
}

interface NeedsComponent {
  hunger: number;    // 0-100, 0 = starving
  faith: number;     // 0-100, 0 = doubting
  fun: number;       // 0-100, 0 = miserable
  health: number;    // 0-100, 0 = dead
  sanity: number;    // 0-100, 0 = breakdown
}

interface JobComponent {
  jobId: string | null;
  priority: number;
  targetTile: { x: number; y: number } | null;
  workProgress: number;
}
```

### Systems (logic only, process entities with matching components)

```typescript
class NeedsSystem extends System {
  // Runs in fixed update (simulation tick)
  update(dt: number, world: World) {
    for (const entity of world.query(NeedsComponent)) {
      const needs = world.getComponent(entity, NeedsComponent);
      needs.hunger -= dt * HUNGER_RATE;
      needs.faith -= dt * FAITH_RATE;
      // Trigger low-need events
      if (needs.hunger < 20) world.addComponent(entity, HungryTag);
    }
  }
}
```

## Game Loop

```typescript
class GameLoop {
  private accumulator = 0;
  private readonly FIXED_DT = 1/30; // 30 ticks/sec simulation
  private lastTime = performance.now();

  loop() {
    const now = performance.now();
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    frameTime = Math.min(frameTime, 0.25); // Clamp spiral of death

    this.accumulator += frameTime * timeScale; // pause = 0, 1x/2x/3x

    while (this.accumulator >= this.FIXED_DT) {
      this.simulationTick(this.FIXED_DT);
      this.accumulator -= this.FIXED_DT;
    }

    this.render(frameTime);
    requestAnimationFrame(() => this.loop());
  }

  simulationTick(dt: number) {
    needsSystem.update(dt, world);
    aiSystem.update(dt, world);
    jobSystem.update(dt, world);
    pathfindSystem.update(dt, world);
    resourceSystem.update(dt, world);
    eventSystem.update(dt, world);
  }

  render(frameTime: number) {
    renderSystem.sync(world); // ECS → Three.js
    renderer.render(scene, camera);
    uiSystem.update();
  }
}
```

## Isometric Camera

```typescript
class IsoCamera {
  // 45° azimuth, 60° elevation, orthographic projection
  private camera: THREE.OrthographicCamera;
  private offset = new THREE.Vector3(0, 0, 0);
  private zoom = 1;
  private rotation = 0; // 0, 90, 180, 270 degrees

  constructor() {
    this.camera = new THREE.OrthographicCamera(
      -window.innerWidth / 2, window.innerWidth / 2,
      window.innerHeight / 2, -window.innerHeight / 2,
      0.1, 1000
    );
    this.updatePosition();
  }

  // Convert screen coords to tile coords
  screenToTile(screenX: number, screenY: number): { x: number; y: number } {
    // Inverse isometric projection
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const isoX = (screenX - this.offset.x) / (TILE_SIZE * this.zoom);
    const isoY = (screenY - this.offset.y) / (TILE_SIZE * this.zoom);
    const tileX = (isoX + isoY) / 2;
    const tileY = (isoY - isoX) / 2;
    return { x: Math.floor(tileX), y: Math.floor(tileY) };
  }
}
```

## Tile & Building System

Tiles are a 2D grid. Each tile has:
- **Terrain type** (grass, dirt, stone, water)
- **Buildable flag** (can place structures here?)
- **Occupied flag** (is something here?)
- **Room ID** (which room does this tile belong to?)

Rooms are detected by flood-fill of enclosed tiles (walls + doors create boundaries). Room type is assigned by the player after enclosure.

## Pathfinding

A* on the tile grid with:
- 4-directional movement (no diagonals for simplicity)
- Cost: 1 per tile, 2 for doors, impassable for walls
- Recalculation on job target change or path interruption
- Cached paths with invalidation on building changes

## Follower AI (State Machine)

```
┌─────────┐
│  IDLE   │ ←──────────────────────────────────────┐
└────┬────┘                                         │
     │ Job assigned                                 │
     ▼                                              │
┌─────────┐    Path blocked    ┌──────────┐         │
│ MOVING  │──────────────────→│ STUCK    │─────────┤
└────┬────┘                    └──────────┘         │
     │ Arrived                                      │
     ▼                                              │
┌─────────┐    Need critical    ┌──────────┐         │
│ WORKING │──────────────────→│ NEEDS    │─────────┤
└────┬────┘                    └──────────┘         │
     │ Work complete                                │
     ▼                                              │
┌─────────┐                                         │
│  DONE   │─────────────────────────────────────────┘
└─────────┘
```

## Save System

```typescript
interface SaveData {
  version: string;
  timestamp: number;
  world: {
    tiles: number[][];      // terrain types
    buildings: BuildingData[];
    rooms: RoomData[];
  };
  entities: EntityData[];
  cult: {
    name: string;
    leader: EntityData;
    stats: CultStats;
    techUnlocked: string[];
    patronId: string;
    patronFavor: number;
  };
  time: {
    day: number;
    hour: number;
    speed: number;
  };
  rngSeed: number;
}
```

## Steam Publishing Path

### Can we sell this on Steam? **Yes.**

1. **Steam Direct ($100 one-time)** — Register as a developer at partner.steamgames.com
2. **Desktop Wrapper** — Use Electron or Tauri to package the web game as a desktop app
   - **Tauri recommended** — smaller binary (~10MB vs ~150MB Electron), Rust backend
   - Electron more mature for game integration though
3. **Steamworks SDK** — Use `steamworks.js` (Node.js bindings) for:
   - Achievements
   - Cloud saves
   - Workshop support (modding)
   - Leaderboards
4. **Build Pipeline:**
   ```
   Vite build → dist/ → Tauri/Electron package → .app/.exe → Steam upload tool
   ```
5. **Requirements:**
   - Steam partner account
   - App ID from Steam
   - Store page assets (capsule images, screenshots, trailer)
   - ESRB/PEGI rating (or fill out Steam's content questionnaire)
   - $100 Steam Direct fee

### Tauri vs Electron for Game Wrapper

| Factor | Tauri | Electron |
|--------|-------|----------|
| Binary size | ~10MB | ~150MB |
| Memory usage | Lower | Higher |
| Steamworks support | Rust bindings (greenworks) | Node bindings (steamworks.js) |
| WebGL support | Native WebView (WebKit on macOS, WebView2 on Windows) | Chromium (consistent across platforms) |
| Maturity for games | Newer, less battle-tested | Used by many shipped games |
| **Recommendation** | Monitor, but use Electron for launch** | **Use this for v1** |

Electron is the safer choice for a first Steam launch — consistent rendering across platforms, mature Steamworks integration, and many indie games have shipped with it.

## Testing Strategy

- **Unit tests (Vitest):** ECS, pathfinding, needs system, resource math, save/load
- **Integration tests:** Building system, job assignment, ritual execution
- **E2E tests (Playwright):** Launch game in browser, perform core loops (build room, assign follower, complete ritual)
- **Visual regression:** Screenshot comparison of key UI states
- **Sub-agent testing:** Automated playthrough via browser automation (as per workflow step d)

## Performance Targets

- **60 FPS** on mid-range hardware
- **1000+ entities** (followers + objects) without frame drops
- **Instanced rendering** for repeated objects (tiles, walls, props)
- **Frustum culling** for off-screen entities
- **Web Workers** for pathfinding (offload from main thread)
- **Object pooling** for frequently created/destroyed entities (particles, projectiles)

## Asset Pipeline

```
Blender (source .blend files)
  → glTF export (optimized, draco compressed)
  → assets/models/ folder
  → AssetLoader caches in Three.js
```

### Asset Specifications

| Asset Type | Poly Budget | Texture | Format |
|-----------|-------------|---------|--------|
| Follower | 200-400 tris | 256x256 | glTF + Draco |
| Building tile | 50-100 tris | 128x128 | glTF + Draco |
| Props (small) | 50-200 tris | 128x128 | glTF + Draco |
| Props (large) | 200-500 tris | 256x256 | glTF + Draco |
| Effects (particles) | Billboard sprites | 64x64 | PNG spritesheet |
| UI icons | N/A | 64x64 | SVG/PNG |

### Art Direction (Prison Architect Aesthetic)

- **Flat shading** — no smooth normals, hard edge definition
- **Bold outlines** — black outline shader on models (inverted hull or post-process)
- **Desaturated palette** — muted greens, browns, grays for terrain
- **Accent colors** — teal (faith), gold (funds), blood red (rituals), purple (dark patron)
- **Simple silhouettes** — readable from isometric distance, no fine detail
- **Consistent scale** — all models use the same unit scale (1 tile = 1m)