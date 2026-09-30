/**
 * GameLoop — Fixed timestep simulation with variable rate rendering.
 *
 * Uses the accumulator pattern:
 *   - Simulation runs at a fixed 1/30s timestep (30 ticks/sec)
 *   - Rendering runs via requestAnimationFrame (variable, typically 60fps)
 *   - Frame time is clamped to 0.25s to prevent the spiral of death
 *   - Time scale supports pause (0), normal (1), fast (2), very fast (3)
 */

export interface SimulationTickHandler {
  /** Called at a fixed dt for each simulation step. */
  (fixedDt: number): void;
}

export interface RenderHandler {
  /** Called once per frame with the real (clamped) frame delta and interpolation alpha. */
  (frameTime: number, alpha: number): void;
}

export class GameLoop {
  /** Fixed simulation timestep in seconds (30 ticks/sec). */
  public readonly FIXED_DT: number = 1 / 30;

  /** Maximum frame time in seconds before clamping (prevents spiral of death). */
  public readonly MAX_FRAME_TIME: number = 0.25;

  private accumulator: number = 0;
  private lastTime: number = 0;
  private rafId: number | null = null;
  private running: boolean = false;

  /** Time scale: 0 = paused, 1 = normal, 2 = fast, 3 = very fast. */
  private _timeScale: number = 1;

  /** Total elapsed simulation time in seconds. */
  private _elapsedSimTime: number = 0;

  /** Total number of simulation ticks executed. */
  private _tickCount: number = 0;

  private readonly simulationTick: SimulationTickHandler;
  private readonly renderHandler: RenderHandler;

  constructor(simulationTick: SimulationTickHandler, renderHandler: RenderHandler) {
    this.simulationTick = simulationTick;
    this.renderHandler = renderHandler;
  }

  /** Current time scale (0 = paused, 1 = normal, 2 = fast, 3 = very fast). */
  get timeScale(): number {
    return this._timeScale;
  }

  /** Set the time scale. Values are clamped to 0–3. */
  set timeScale(value: number) {
    this._timeScale = Math.max(0, Math.min(3, value));
  }

  /** Whether the simulation is paused (timeScale === 0). */
  get isPaused(): boolean {
    return this._timeScale === 0;
  }

  /** Total elapsed simulation time in seconds. */
  get elapsedSimTime(): number {
    return this._elapsedSimTime;
  }

  /** Total number of fixed simulation ticks executed. */
  get tickCount(): number {
    return this._tickCount;
  }

  /** Whether the loop is currently running. */
  get isRunning(): boolean {
    return this.running;
  }

  /** Start the game loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }

  /** Stop the game loop. */
  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Pause the simulation by setting time scale to 0. */
  pause(): void {
    this.timeScale = 0;
  }

  /** Resume the simulation at normal speed (time scale 1). */
  resume(): void {
    this.timeScale = 1;
  }

  /**
   * Internal: one animation frame.
   * Exposed as public for testing purposes (to drive frames deterministically).
   */
  tick(timestamp: number): void {
    if (!this.running) return;

    // Calculate real frame time
    let frameTime = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Clamp to prevent spiral of death
    frameTime = Math.min(frameTime, this.MAX_FRAME_TIME);

    // Apply time scale to the accumulator
    this.accumulator += frameTime * this._timeScale;

    // Run fixed simulation steps
    let ticks = 0;
    const maxTicksPerFrame = 240; // safety cap
    while (this.accumulator >= this.FIXED_DT && ticks < maxTicksPerFrame) {
      this.simulationTick(this.FIXED_DT);
      this._elapsedSimTime += this.FIXED_DT;
      this._tickCount++;
      this.accumulator -= this.FIXED_DT;
      ticks++;
    }

    // If we hit the safety cap, discard remaining accumulator to avoid lockup
    if (ticks >= maxTicksPerFrame) {
      this.accumulator = 0;
    }

    // Interpolation alpha for smooth rendering between fixed steps
    const alpha = this.accumulator / this.FIXED_DT;

    // Render
    this.renderHandler(frameTime, alpha);

    // Schedule next frame
    this.rafId = requestAnimationFrame((t) => this.tick(t));
  }
}