// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { IsoCamera } from '../../src/engine/IsoCamera';

function createMockElement(): HTMLElement & { _dispatch: (event: string, payload: any) => void } {
  const listeners: Record<string, Array<(e: any) => void>> = {};
  const element = {
    addEventListener: vi.fn((event: string, handler: (e: any) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: (e: any) => void) => {
      if (listeners[event]) listeners[event] = listeners[event].filter((h) => h !== handler);
    }),
    _dispatch(event: string, payload: any) { (listeners[event] || []).forEach((h) => h(payload)); },
    tabIndex: 0, style: {} as CSSStyleDeclaration, focus: vi.fn(),
  } as unknown as HTMLElement & { _dispatch: (event: string, payload: any) => void };
  return element;
}

describe('IsoCamera', () => {
  let element: HTMLElement & { _dispatch: (event: string, payload: any) => void };
  let camera: IsoCamera;
  beforeEach(() => { element = createMockElement(); camera = new IsoCamera(element, 800, 600); });
  afterEach(() => { camera.dispose(); });

  describe('Construction', () => {
    it('creates an OrthographicCamera', () => { expect(camera.camera).toBeInstanceOf(THREE.OrthographicCamera); });
    it('initializes with zoom of 50', () => { expect(camera.getZoom()).toBeCloseTo(50, 5); });
    it('initializes at rotation step 0', () => { expect(camera.getRotationStep()).toBe(0); });
    it('registers event listeners on the DOM element', () => {
      expect(element.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    });
  });

  describe('Zoom', () => {
    it('setZoom clamps to minimum 5', () => { camera.setZoom(1); for (let i = 0; i < 100; i++) camera.update(0.016); expect(camera.getZoom()).toBeGreaterThanOrEqual(5); });
    it('setZoom clamps to maximum 100', () => { camera.setZoom(200); for (let i = 0; i < 100; i++) camera.update(0.016); expect(camera.getZoom()).toBeLessThanOrEqual(100); });
    it('setZoom accepts valid values', () => { camera.setZoom(70); for (let i = 0; i < 100; i++) camera.update(0.016); expect(camera.getZoom()).toBeCloseTo(70, 1); });
    it('wheel events adjust zoom target', () => { element._dispatch('wheel', { deltaY: 100, preventDefault: vi.fn() }); camera.update(0.016); for (let i = 0; i < 100; i++) camera.update(0.016); expect(camera.getZoom()).toBeLessThan(50); });
    it('wheel up increases zoom', () => { element._dispatch('wheel', { deltaY: -200, preventDefault: vi.fn() }); for (let i = 0; i < 100; i++) camera.update(0.016); expect(camera.getZoom()).toBeGreaterThan(50); });
  });

  describe('Rotation', () => {
    it('rotateClockwise increments rotation step', () => { camera.rotateClockwise(); expect(camera.getRotationStep()).toBe(1); });
    it('rotateClockwise wraps at 4', () => { camera.setRotationStep(3); camera.rotateClockwise(); expect(camera.getRotationStep()).toBe(0); });
    it('rotateCounterClockwise decrements rotation step', () => { camera.rotateCounterClockwise(); expect(camera.getRotationStep()).toBe(3); });
    it('rotateCounterClockwise wraps below 0', () => { camera.setRotationStep(0); camera.rotateCounterClockwise(); expect(camera.getRotationStep()).toBe(3); });
    it('setRotationStep sets valid step', () => { camera.setRotationStep(2); expect(camera.getRotationStep()).toBe(2); });
    it('setRotationStep wraps out-of-range values', () => { camera.setRotationStep(5); expect(camera.getRotationStep()).toBe(1); });
    it('setRotationStep handles negative values', () => { camera.setRotationStep(-1); expect(camera.getRotationStep()).toBe(3); });
    it('Q key triggers counter-clockwise rotation', () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' })); expect(camera.getRotationStep()).toBe(3); });
    it('E key triggers clockwise rotation', () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); expect(camera.getRotationStep()).toBe(1); });
  });

  describe('Pan', () => {
    it('pan moves the target offset', () => { const init = camera.getOffset(); camera.pan(5, 0); for (let i = 0; i < 100; i++) camera.update(0.016); expect(camera.getOffset().x).not.toBeCloseTo(init.x, 1); });
    it('WASD keys set pan direction', () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); const initZ = camera.getOffset().z; camera.update(0.1); camera.update(0.1); camera.update(0.1); expect(camera.getOffset().z).toBeLessThan(initZ); });
    it('setTarget sets the pan target', () => { camera.setTarget(10, 20); for (let i = 0; i < 200; i++) camera.update(0.016); const o = camera.getOffset(); expect(o.x).toBeCloseTo(10, 0); expect(o.z).toBeCloseTo(20, 0); });
  });

  describe('screenToTile', () => {
    it('returns integer tile coordinates', () => { const t = camera.screenToTile(400, 300); expect(Number.isInteger(t.x)).toBe(true); expect(Number.isInteger(t.y)).toBe(true); });
    it('center of screen maps to camera offset tile', () => { camera.setTarget(5, 5); for (let i = 0; i < 200; i++) camera.update(0.016); const t = camera.screenToTile(400, 300); expect(Math.abs(t.x - 5)).toBeLessThanOrEqual(1); expect(Math.abs(t.y - 5)).toBeLessThanOrEqual(1); });
    it('moving mouse changes tile coordinates', () => { const t1 = camera.screenToTile(400, 300); const t2 = camera.screenToTile(450, 350); expect(t1).not.toEqual(t2); });
  });

  describe('tileToScreen', () => {
    it('returns screen pixel coordinates', () => { const s = camera.tileToScreen(0, 0); expect(typeof s.x).toBe('number'); expect(typeof s.y).toBe('number'); });
    it('round-trip: tile → screen → tile returns the same tile', () => { const t = { x: 3, y: 7 }; const s = camera.tileToScreen(t.x, t.y); const r = camera.screenToTile(s.x, s.y); expect(Math.abs(r.x - t.x)).toBeLessThanOrEqual(1); expect(Math.abs(r.y - t.y)).toBeLessThanOrEqual(1); });
    it('round-trip at non-zero offset', () => { camera.setTarget(10, -5); for (let i = 0; i < 200; i++) camera.update(0.016); const t = { x: 10, y: -5 }; const s = camera.tileToScreen(t.x, t.y); const r = camera.screenToTile(s.x, s.y); expect(Math.abs(r.x - t.x)).toBeLessThanOrEqual(1); expect(Math.abs(r.y - t.y)).toBeLessThanOrEqual(1); });
  });

  describe('Smooth Lerp Transitions', () => {
    it('zoom transitions smoothly (not instant)', () => { camera.setZoom(70); camera.update(0.016); const z = camera.getZoom(); expect(z).toBeGreaterThan(40); expect(z).toBeLessThan(70); });
    it('rotation transitions smoothly', () => { camera.setRotationStep(1); camera.update(0.016); const pos = camera.camera.position; const targetAz = THREE.MathUtils.degToRad(45) + Math.PI / 2; const expectedX = 50 * Math.cos(THREE.MathUtils.degToRad(60)) * Math.cos(targetAz); expect(Math.abs(pos.x - expectedX)).toBeGreaterThan(0.1); });
    it('pan transitions smoothly', () => { camera.setTarget(20, 20); camera.update(0.016); const o = camera.getOffset(); expect(o.x).toBeGreaterThan(0); expect(o.x).toBeLessThan(20); expect(o.z).toBeGreaterThan(0); expect(o.z).toBeLessThan(20); });
  });

  describe('Dispose', () => {
    it('removes event listeners', () => { camera.dispose(); expect(element.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function)); });
  });
});
