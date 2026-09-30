import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputManager } from '@engine/InputManager';

// Mock window for node environment
const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
(vi as any).stubGlobal('window', mockWindow);

// Mock canvas element
function createMockCanvas(): HTMLCanvasElement {
  const canvas = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
  } as unknown as HTMLCanvasElement;
  return canvas;
}

// Simple screen-to-tile for testing (identity: 1 pixel = 1 tile)
const screenToTile = (x: number, y: number) => ({ x: Math.floor(x / 32), y: Math.floor(y / 32) });

describe('InputManager — Initialization', () => {
  it('should initialize in select mode', () => {
    const canvas = createMockCanvas();
    const im = new InputManager(canvas, screenToTile);
    expect(im.getMode()).toBe('select');
    im.dispose();
  });

  it('should register event listeners on canvas', () => {
    const canvas = createMockCanvas();
    const im = new InputManager(canvas, screenToTile);
    expect(canvas.addEventListener).toHaveBeenCalled();
    im.dispose();
  });
});

describe('InputManager — Mode Switching', () => {
  let im: InputManager;

  beforeEach(() => {
    im = new InputManager(createMockCanvas(), screenToTile);
  });

  it('should switch to build mode', () => {
    im.setMode('build');
    expect(im.getMode()).toBe('build');
  });

  it('should switch to demolish mode', () => {
    im.setMode('demolish');
    expect(im.getMode()).toBe('demolish');
  });

  it('should return to select mode', () => {
    im.setMode('build');
    im.setMode('select');
    expect(im.getMode()).toBe('select');
  });
});

describe('InputManager — State', () => {
  it('should track hovered tile', () => {
    const im = new InputManager(createMockCanvas(), screenToTile);
    const state = im.getState();
    expect(state.hoveredTile).toBeNull();
    expect(state.selectedTile).toBeNull();
    expect(state.isDragging).toBe(false);
    im.dispose();
  });

  it('should expose immutable state copy', () => {
    const im = new InputManager(createMockCanvas(), screenToTile);
    const state1 = im.getState();
    const state2 = im.getState();
    expect(state1).not.toBe(state2);
    expect(state1).toEqual(state2);
    im.dispose();
  });
});

describe('InputManager — Dispose', () => {
  it('should remove all event listeners', () => {
    const canvas = createMockCanvas();
    const im = new InputManager(canvas, screenToTile);
    im.dispose();
    expect(canvas.removeEventListener).toHaveBeenCalled();
  });

  it('should be safe to dispose twice', () => {
    const canvas = createMockCanvas();
    const im = new InputManager(canvas, screenToTile);
    im.dispose();
    im.dispose(); // should not throw
  });
});