import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameLoop } from '../../src/game/GameLoop';

describe('GameLoop', () => {
  let originalRAF: typeof requestAnimationFrame;
  let originalCAF: typeof cancelAnimationFrame;
  let originalPerformanceNow: typeof performance.now;
  let rafCallbacks: ((t: number) => void)[];
  let currentTime: number;

  beforeEach(() => {
    // Mock requestAnimationFrame / cancelAnimationFrame
    rafCallbacks = [];
    currentTime = 0;

    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    originalPerformanceNow = performance.now;

    globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }) as typeof requestAnimationFrame;

    globalThis.cancelAnimationFrame = (() => {
      // no-op for tests
    }) as typeof cancelAnimationFrame;

    // Mock performance.now to return our controlled currentTime
    performance.now = (() => currentTime) as typeof performance.now;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
    performance.now = originalPerformanceNow;
    vi.restoreAllMocks();
  });

  /** Advance one animation frame by `ms` milliseconds. */
  function advanceFrame(ms: number): void {
    currentTime += ms;
    const callbacks = rafCallbacks.splice(0);
    for (const cb of callbacks) {
      cb(currentTime);
    }
  }

  describe('Construction', () => {
    it('has a fixed dt of 1/30 seconds', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      expect(loop.FIXED_DT).toBeCloseTo(1 / 30, 10);
    });

    it('starts with time scale 1 (normal)', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      expect(loop.timeScale).toBe(1);
    });

    it('is not running before start()', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      expect(loop.isRunning).toBe(false);
    });
  });

  describe('Time Scale', () => {
    it('clamps time scale to 0–3', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      loop.timeScale = 5;
      expect(loop.timeScale).toBe(3);
      loop.timeScale = -1;
      expect(loop.timeScale).toBe(0);
    });

    it('reports isPaused when timeScale is 0', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      loop.timeScale = 0;
      expect(loop.isPaused).toBe(true);
      loop.timeScale = 1;
      expect(loop.isPaused).toBe(false);
    });

    it('pause() sets timeScale to 0', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      loop.pause();
      expect(loop.timeScale).toBe(0);
      expect(loop.isPaused).toBe(true);
    });

    it('resume() sets timeScale to 1', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      loop.pause();
      loop.resume();
      expect(loop.timeScale).toBe(1);
      expect(loop.isPaused).toBe(false);
    });
  });

  describe('Fixed Timestep Simulation', () => {
    it('calls simulationTick at fixed 1/30s intervals', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      // First frame establishes baseline (currentTime = 0)
      advanceFrame(0);

      // Advance 100ms ≈ 3 ticks at 1/30s (33.33ms each)
      advanceFrame(100);

      const expectedTicks = Math.floor((100 / 1000) / (1 / 30));
      expect(simTick).toHaveBeenCalledTimes(expectedTicks);
      // Each call should receive the fixed dt
      for (const call of simTick.mock.calls) {
        expect(call[0]).toBeCloseTo(1 / 30, 10);
      }

      loop.stop();
    });

    it('accumulates fractional frame time across multiple frames', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0); // baseline

      // 40ms per frame: 1 tick per frame with 6.67ms leftover
      advanceFrame(40); // ~1 tick, accumulator leftover ~6.67ms
      advanceFrame(40); // ~1 tick + leftover → 1 tick, accumulator ~13.33ms
      advanceFrame(40); // ~1 tick + leftover → 1 tick, accumulator ~20ms

      // After 3 frames of 40ms = 120ms total → floor(120/33.33) = 3 ticks
      expect(simTick).toHaveBeenCalledTimes(3);

      loop.stop();
    });

    it('does not call simulationTick when paused', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0); // baseline

      loop.pause();
      advanceFrame(100);
      advanceFrame(100);

      expect(simTick).not.toHaveBeenCalled();

      loop.stop();
    });

    it('runs 2x as many ticks at timeScale 2', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0); // baseline

      loop.timeScale = 2;
      advanceFrame(100); // 100ms * 2 = 200ms effective → floor(200/33.33) = 6 ticks

      const ticksAt2x = simTick.mock.calls.length;
      expect(ticksAt2x).toBe(6);

      loop.stop();
    });

    it('runs 3x as many ticks at timeScale 3', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0);

      loop.timeScale = 3;
      advanceFrame(100); // 100ms * 3 = 300ms → floor(300/33.33) = 9 ticks

      expect(simTick).toHaveBeenCalledTimes(9);

      loop.stop();
    });
  });

  describe('Frame Time Clamping', () => {
    it('clamps frame time to 0.25s to prevent spiral of death', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0); // baseline

      // Simulate a huge frame delay (e.g., tab was backgrounded)
      advanceFrame(10000); // 10 seconds

      // At timeScale 1, max effective accumulator = 0.25s → floor(0.25/(1/30)) = 7 ticks
      expect(simTick.mock.calls.length).toBeLessThanOrEqual(8);

      loop.stop();
    });
  });

  describe('Rendering', () => {
    it('calls render handler once per frame', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0);
      advanceFrame(16);
      advanceFrame(16);

      // render is called once per frame (3 frames after start: 0, 16, 16)
      expect(render.mock.calls.length).toBeGreaterThanOrEqual(2);

      loop.stop();
    });

    it('passes interpolation alpha to render handler', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0);
      advanceFrame(20); // 20ms → < 1 tick at 33.33ms, so alpha = 20/33.33 ≈ 0.6

      const lastCall = render.mock.calls[render.mock.calls.length - 1];
      const alpha = lastCall[1] as number;
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);

      loop.stop();
    });
  });

  describe('Elapsed Time & Tick Count', () => {
    it('tracks elapsed simulation time', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0);
      advanceFrame(100); // ~3 ticks

      expect(loop.elapsedSimTime).toBeCloseTo(
        simTick.mock.calls.length * (1 / 30),
        5,
      );

      loop.stop();
    });

    it('tracks total tick count', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0);
      advanceFrame(100);

      expect(loop.tickCount).toBe(simTick.mock.calls.length);

      loop.stop();
    });

    it('does not advance sim time when paused', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      advanceFrame(0);

      loop.pause();
      advanceFrame(500);

      expect(loop.elapsedSimTime).toBe(0);
      expect(loop.tickCount).toBe(0);

      loop.stop();
    });
  });

  describe('Start / Stop', () => {
    it('sets isRunning to true after start()', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      loop.start();
      expect(loop.isRunning).toBe(true);
      loop.stop();
    });

    it('sets isRunning to false after stop()', () => {
      const loop = new GameLoop(vi.fn(), vi.fn());
      loop.start();
      loop.stop();
      expect(loop.isRunning).toBe(false);
    });

    it('does not start twice', () => {
      const simTick = vi.fn();
      const render = vi.fn();
      const loop = new GameLoop(simTick, render);

      loop.start();
      const firstRafCount = rafCallbacks.length;
      loop.start(); // should be no-op
      expect(rafCallbacks.length).toBe(firstRafCount);

      loop.stop();
    });
  });
});