/**
 * Game — Top-level orchestrator that wires together the GameLoop, Renderer, and ECS World.
 *
 * The Game class owns the lifecycle:
 *   1. Creates the GameLoop with simulation + render callbacks
 *   2. On each simulation tick: updates GameState and runs ECS systems
 *   3. On each render frame: syncs the render system and draws
 */

import { GameLoop } from './GameLoop';
import { GameState } from './GameState';
import { World } from '../ecs/World';
import { System } from '../ecs/System';

export class Game {
  private readonly gameLoop: GameLoop;
  private readonly state: GameState;
  private readonly world: World;
  private readonly systems: System[] = [];
  private readonly renderCallback: ((alpha: number) => void) | null;

  constructor(options?: {
    initialState?: Partial<GameState['resources'] & GameState['cult']>;
    renderCallback?: (alpha: number) => void;
  }) {
    this.state = new GameState(options?.initialState);
    this.world = new World();
    this.renderCallback = options?.renderCallback ?? null;

    this.gameLoop = new GameLoop(
      (fixedDt) => this.onSimulationTick(fixedDt),
      (_frameTime, alpha) => this.onRender(alpha),
    );
  }

  /** The current game state (mutable). */
  get gameState(): GameState {
    return this.state;
  }

  /** The ECS world. */
  get ecsWorld(): World {
    return this.world;
  }

  /** The underlying game loop. */
  get loop(): GameLoop {
    return this.gameLoop;
  }

  /** Register an ECS system to be updated each simulation tick. */
  addSystem(system: System): void {
    this.systems.push(system);
  }

  /** Start the game loop. */
  start(): void {
    this.gameLoop.start();
  }

  /** Stop the game loop. */
  stop(): void {
    this.gameLoop.stop();
  }

  /** Set the time scale (0 = paused, 1 = normal, 2 = fast, 3 = very fast). */
  setTimeScale(scale: number): void {
    this.gameLoop.timeScale = scale;
    this.state.timeScale = this.gameLoop.timeScale;
  }

  /** Pause the game. */
  pause(): void {
    this.gameLoop.pause();
    this.state.timeScale = 0;
  }

  /** Resume at normal speed. */
  resume(): void {
    this.gameLoop.resume();
    this.state.timeScale = 1;
  }

  /** Called at each fixed simulation step. */
  private onSimulationTick(fixedDt: number): void {
    // Update global state
    this.state.elapsedSimTime += fixedDt;
    this.state.tickCount++;

    // Advance day every 30 seconds of sim time (configurable later)
    const newDay = Math.floor(this.state.elapsedSimTime / 30) + 1;
    if (newDay > this.state.cult.day) {
      this.state.cult.day = newDay;
    }

    // Run all registered ECS systems
    for (const system of this.systems) {
      system.update(this.world, fixedDt);
    }
  }

  /** Called once per animation frame for rendering. */
  private onRender(alpha: number): void {
    if (this.renderCallback) {
      this.renderCallback(alpha);
    }
  }
}