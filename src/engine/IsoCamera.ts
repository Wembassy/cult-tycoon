/**
 * IsoCamera — Isometric camera with dramatic angle for 3D visibility.
 * 35° elevation (from horizontal) gives strong 3D perspective.
 * WASD pan, Q/E rotate, wheel zoom — all on window (no focus needed).
 */

import * as THREE from 'three';

export const TILE_SIZE = 1;
const MIN_ZOOM = 15;
const MAX_ZOOM = 100;
const LERP_FACTOR = 0.12;
const CAMERA_DISTANCE = 60;
// 30° from vertical = 60° from horizontal — very dramatic low angle
const ELEVATION = THREE.MathUtils.degToRad(30);
const ROTATION_DIRECTIONS = 4;
const PAN_SPEED = 25;

export interface TileCoord { x: number; y: number; }

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;

  private targetZoom = 50;
  private currentZoom = 50;
  private targetRotationStep = 0;
  private currentRotationRad = 0;
  private targetOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private currentOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private keysPressed: Set<string> = new Set();
  private wheelDelta = 0;
  private domElement: HTMLElement;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
  private boundResize: () => void;
  private viewWidth: number;
  private viewHeight: number;

  constructor(domElement: HTMLElement, viewWidth?: number, viewHeight?: number) {
    this.domElement = domElement;
    this.viewWidth = viewWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 800);
    this.viewHeight = viewHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 600);

    this.camera = new THREE.OrthographicCamera(
      -this.viewWidth / 2, this.viewWidth / 2,
      this.viewHeight / 2, -this.viewHeight / 2,
      0.1, 1000,
    );

    this.updateCameraPosition();

    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundResize = this.onResize.bind(this);

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    domElement.addEventListener('wheel', this.boundWheel, { passive: false });
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundResize);
    }
  }

  update(dt: number): void {
    this.processPan(dt);
    if (this.wheelDelta !== 0) {
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom - this.wheelDelta * 0.05, MIN_ZOOM, MAX_ZOOM);
      this.wheelDelta = 0;
    }
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.targetZoom, LERP_FACTOR);
    const targetRotationRad = this.targetRotationStep * (Math.PI / 2);
    this.currentRotationRad = THREE.MathUtils.lerp(this.currentRotationRad, targetRotationRad, LERP_FACTOR);
    this.currentOffset.lerp(this.targetOffset, LERP_FACTOR);
    this.updateCameraPosition();
  }

  setZoom(zoom: number): void { this.targetZoom = THREE.MathUtils.clamp(zoom, MIN_ZOOM, MAX_ZOOM); }
  getZoom(): number { return this.currentZoom; }
  rotateClockwise(): void { this.targetRotationStep = (this.targetRotationStep + 1) % ROTATION_DIRECTIONS; }
  rotateCounterClockwise(): void { this.targetRotationStep = (this.targetRotationStep - 1 + ROTATION_DIRECTIONS) % ROTATION_DIRECTIONS; }
  getRotationStep(): number { return this.targetRotationStep; }
  setRotationStep(step: number): void { this.targetRotationStep = ((step % ROTATION_DIRECTIONS) + ROTATION_DIRECTIONS) % ROTATION_DIRECTIONS; }

  pan(dx: number, dz: number): void {
    const cos = Math.cos(this.currentRotationRad);
    const sin = Math.sin(this.currentRotationRad);
    this.targetOffset.x += dx * cos - dz * sin;
    this.targetOffset.z += dx * sin + dz * cos;
  }

  setTarget(x: number, z: number): void { this.targetOffset.set(x, 0, z); }
  getOffset(): THREE.Vector3 { return this.currentOffset.clone(); }

  screenToTile(screenX: number, screenY: number): TileCoord {
    // Use the actual camera azimuth (45° + rotationRad) to match updateCameraPosition
    const azimuth = this.currentRotationRad + THREE.MathUtils.degToRad(45);
    const sinA = Math.sin(azimuth);
    const cosA = Math.cos(azimuth);
    const sinE = Math.sin(ELEVATION);
    // Convert screen pixels to camera-space NDC
    const ndcX = (screenX - this.viewWidth / 2) / this.currentZoom;
    const ndcY = -(screenY - this.viewHeight / 2) / this.currentZoom;
    // Invert the camera projection:
    //   ndcX = worldX * sin(az) - worldZ * cos(az)
    //   ndcY = -(worldX * cos(az) + worldZ * sin(az)) * sin(elev)
    // Solving for worldX, worldZ:
    const worldX = ndcX * sinA - ndcY * cosA / sinE;
    const worldZ = -ndcX * cosA - ndcY * sinA / sinE;
    const tileX = Math.floor(worldX / TILE_SIZE + this.currentOffset.x);
    const tileY = Math.floor(worldZ / TILE_SIZE + this.currentOffset.z);
    return { x: tileX, y: tileY };
  }

  tileToScreen(tileX: number, tileY: number): { x: number; y: number } {
    // Use the actual camera azimuth (45° + rotationRad) to match updateCameraPosition
    const azimuth = this.currentRotationRad + THREE.MathUtils.degToRad(45);
    const sinA = Math.sin(azimuth);
    const cosA = Math.cos(azimuth);
    const sinE = Math.sin(ELEVATION);
    const worldX = (tileX - this.currentOffset.x) * TILE_SIZE;
    const worldZ = (tileY - this.currentOffset.z) * TILE_SIZE;
    // Forward camera projection on the ground plane (y=0):
    //   screenX = (worldX * sin(az) - worldZ * cos(az)) * zoom + cx
    //   screenY = (worldX * cos(az) + worldZ * sin(az)) * sin(elev) * zoom + cy
    const screenX = (worldX * sinA - worldZ * cosA) * this.currentZoom + this.viewWidth / 2;
    const screenY = (worldX * cosA + worldZ * sinA) * sinE * this.currentZoom + this.viewHeight / 2;
    return { x: screenX, y: screenY };
  }

  dispose(): void {
    this.domElement.removeEventListener('wheel', this.boundWheel);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
    }
  }

  private updateCameraPosition(): void {
    const azimuth = THREE.MathUtils.degToRad(45) + this.currentRotationRad;
    const x = CAMERA_DISTANCE * Math.cos(ELEVATION) * Math.cos(azimuth);
    const y = CAMERA_DISTANCE * Math.sin(ELEVATION);
    const z = CAMERA_DISTANCE * Math.cos(ELEVATION) * Math.sin(azimuth);
    this.camera.position.set(this.currentOffset.x + x, this.currentOffset.y + y, this.currentOffset.z + z);
    this.camera.lookAt(this.currentOffset.x, 0, this.currentOffset.z);
    const halfW = this.viewWidth / 2 / this.currentZoom;
    const halfH = this.viewHeight / 2 / this.currentZoom;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  private processPan(dt: number): void {
    let dx = 0, dz = 0;
    const speed = PAN_SPEED * dt;
    if (this.keysPressed.has('w') || this.keysPressed.has('W')) dz -= speed;
    if (this.keysPressed.has('s') || this.keysPressed.has('S')) dz += speed;
    if (this.keysPressed.has('a') || this.keysPressed.has('A')) dx -= speed;
    if (this.keysPressed.has('d') || this.keysPressed.has('D')) dx += speed;
    if (dx !== 0 || dz !== 0) this.pan(dx, dz);
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.keysPressed.add(e.key);
    if (e.key === 'q' || e.key === 'Q') this.rotateCounterClockwise();
    else if (e.key === 'e' || e.key === 'E') this.rotateClockwise();
  }

  private onKeyUp(e: KeyboardEvent): void { this.keysPressed.delete(e.key); }
  private onWheel(e: WheelEvent): void { e.preventDefault(); this.wheelDelta += e.deltaY; }
  private onResize(): void {
    if (typeof window === 'undefined') return;
    this.viewWidth = window.innerWidth;
    this.viewHeight = window.innerHeight;
    this.updateCameraPosition();
  }
}