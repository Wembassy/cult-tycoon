/**
 * IsoCamera — Isometric camera with dramatic angle for 3D visibility.
 * 35° elevation (from horizontal) gives strong 3D perspective.
 *
 * Controls:
 * - WASD: screen-aligned pan (W=up, S=down, A=left, D=right on screen)
 * - Q/E: rotate 90° steps
 * - Middle-mouse drag: free pan (grab & drag the world)
 * - Right-mouse drag: free rotation (smooth, snaps to 90° on release)
 * - Wheel: zoom
 *
 * Tile picking uses THREE.Raycaster against a ground plane at y=0.
 */

import * as THREE from 'three';

export const TILE_SIZE = 1;
const MIN_ZOOM = 5;
const MAX_ZOOM = 100;
const LERP_FACTOR = 0.12;
const CAMERA_DISTANCE = 60;
// 30° from vertical = 60° from horizontal — very dramatic low angle
const ELEVATION = THREE.MathUtils.degToRad(30);
const ROTATION_DIRECTIONS = 4;
const PAN_SPEED = 25;
const MOUSE_PAN_SPEED = 1; // multiplier for mouse drag pan
const MOUSE_ROTATE_SPEED = 0.005; // radians per pixel
const RIGHT_CLICK_DRAG_THRESHOLD = 5; // pixels before right-drag is considered a rotate

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

  // Map offset for tile coordinate conversion (world position of tile (0,0) corner)
  private mapOffset = { x: 0, z: 0 };

  // Mouse controls
  private isMousePanning = false;
  private isMouseRotating = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private rightMouseDownX = 0;
  private rightMouseDownY = 0;
  private rightDragOccurred = false;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundContextMenu: (e: Event) => void;
  private boundBlur: () => void;

  // Callback for right-click without drag (for InputManager cancel/deselect)
  onRightClickWithoutDrag?: () => void;

  // Raycaster for tile picking
  private raycaster: THREE.Raycaster;
  private groundPlane: THREE.Plane;

  // Ground vectors for screen-aligned movement (computed from camera orientation)
  private groundForward: THREE.Vector3 = new THREE.Vector3();
  private groundRight: THREE.Vector3 = new THREE.Vector3();

  constructor(domElement: HTMLElement, viewWidth?: number, viewHeight?: number) {
    this.domElement = domElement;
    this.viewWidth = viewWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 800);
    this.viewHeight = viewHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 600);

    this.camera = new THREE.OrthographicCamera(
      -this.viewWidth / 2, this.viewWidth / 2,
      this.viewHeight / 2, -this.viewHeight / 2,
      0.1, 1000,
    );

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.updateCameraPosition();

    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundResize = this.onResize.bind(this);
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundContextMenu = (e: Event) => e.preventDefault();
    this.boundBlur = this.onBlur.bind(this);

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    domElement.addEventListener('wheel', this.boundWheel, { passive: false });
    domElement.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mouseup', this.boundMouseUp);
    domElement.addEventListener('contextmenu', this.boundContextMenu);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.boundResize);
      window.addEventListener('blur', this.boundBlur);
    }
  }

  update(dt: number): void {
    this.processKeyboardPan(dt);

    if (this.wheelDelta !== 0) {
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom - this.wheelDelta * 0.05, MIN_ZOOM, MAX_ZOOM);
      this.wheelDelta = 0;
    }

    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.targetZoom, LERP_FACTOR);

    // Only lerp rotation when not actively rotating with mouse
    if (!this.isMouseRotating) {
      const targetRotationRad = this.targetRotationStep * (Math.PI / 2);
      this.currentRotationRad = THREE.MathUtils.lerp(this.currentRotationRad, targetRotationRad, LERP_FACTOR);
    }

    this.currentOffset.lerp(this.targetOffset, LERP_FACTOR);
    this.updateCameraPosition();
  }

  setZoom(zoom: number): void { this.targetZoom = THREE.MathUtils.clamp(zoom, MIN_ZOOM, MAX_ZOOM); }
  getZoom(): number { return this.currentZoom; }
  rotateClockwise(): void { this.targetRotationStep = (this.targetRotationStep + 1) % ROTATION_DIRECTIONS; }
  rotateCounterClockwise(): void { this.targetRotationStep = (this.targetRotationStep - 1 + ROTATION_DIRECTIONS) % ROTATION_DIRECTIONS; }
  getRotationStep(): number { return this.targetRotationStep; }
  setRotationStep(step: number): void { this.targetRotationStep = ((step % ROTATION_DIRECTIONS) + ROTATION_DIRECTIONS) % ROTATION_DIRECTIONS; }

  /**
   * Set the map offset (world-space position of tile (0,0) corner).
   * Required for accurate raycaster-based tile picking.
   * Typically: (-map.width / 2, -map.height / 2)
   */
  setMapOffset(x: number, z: number): void {
    this.mapOffset.x = x;
    this.mapOffset.z = z;
  }

  /**
   * Screen-aligned pan. dx = right on screen, dy = up on screen.
   * Uses camera orientation to convert to world-space ground movement.
   */
  panScreen(dx: number, dy: number): void {
    this.targetOffset.addScaledVector(this.groundRight, dx);
    this.targetOffset.addScaledVector(this.groundForward, dy);
  }

  /** Legacy pan alias — now screen-aligned (dx=right, dz=up on screen). */
  pan(dx: number, dz: number): void { this.panScreen(dx, dz); }

  setTarget(x: number, z: number): void { this.targetOffset.set(x, 0, z); }
  getOffset(): THREE.Vector3 { return this.currentOffset.clone(); }

  /**
   * Cast a ray from screen coordinates through the camera and intersect
   * with the ground plane (y=0). Returns tile coordinates.
   */
  screenToTile(screenX: number, screenY: number): TileCoord {
    // Convert screen pixels to NDC (-1 to 1)
    const ndcX = (screenX / this.viewWidth) * 2 - 1;
    const ndcY = -(screenY / this.viewHeight) * 2 + 1;

    // Set ray from camera through the screen point
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    // Intersect with ground plane (y=0)
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      // Convert world coordinates to tile coordinates
      // Tile (tx, ty) occupies world space [mapOffset.x + tx, mapOffset.x + tx + 1]
      const tileX = Math.floor(hit.x - this.mapOffset.x);
      const tileY = Math.floor(hit.z - this.mapOffset.z);
      return { x: tileX, y: tileY };
    }

    // Fallback if ray is parallel to plane (shouldn't happen with isometric camera)
    return { x: 0, y: 0 };
  }

  /**
   * Project a tile coordinate to screen pixel position.
   */
  tileToScreen(tileX: number, tileY: number): { x: number; y: number } {
    // Tile center in world space
    const worldX = tileX + this.mapOffset.x + 0.5;
    const worldZ = tileY + this.mapOffset.z + 0.5;
    const worldPos = new THREE.Vector3(worldX, 0, worldZ);

    // Project to NDC using camera
    const projected = worldPos.project(this.camera);

    // Convert NDC to screen pixels
    const screenX = (projected.x + 1) / 2 * this.viewWidth;
    const screenY = (1 - projected.y) / 2 * this.viewHeight;
    return { x: screenX, y: screenY };
  }

  dispose(): void {
    this.domElement.removeEventListener('wheel', this.boundWheel);
    this.domElement.removeEventListener('mousedown', this.boundMouseDown);
    this.domElement.removeEventListener('contextmenu', this.boundContextMenu);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mouseup', this.boundMouseUp);
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('blur', this.boundBlur);
    }
  }

  // ─── Private ────────────────────────────────────────────────

  private updateCameraPosition(): void {
    const azimuth = THREE.MathUtils.degToRad(45) + this.currentRotationRad;
    const x = CAMERA_DISTANCE * Math.cos(ELEVATION) * Math.cos(azimuth);
    const y = CAMERA_DISTANCE * Math.sin(ELEVATION);
    const z = CAMERA_DISTANCE * Math.cos(ELEVATION) * Math.sin(azimuth);

    this.camera.position.set(
      this.currentOffset.x + x,
      this.currentOffset.y + y,
      this.currentOffset.z + z,
    );
    this.camera.lookAt(this.currentOffset.x, 0, this.currentOffset.z);

    const halfW = this.viewWidth / 2 / this.currentZoom;
    const halfH = this.viewHeight / 2 / this.currentZoom;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();

    // Compute ground-space forward and right vectors from camera orientation.
    // Forward = direction camera looks, projected on XZ plane (then normalized).
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    this.groundForward.copy(forward);

    // Right = forward × up (right-handed coordinate system)
    this.groundRight.crossVectors(this.groundForward, new THREE.Vector3(0, 1, 0)).normalize();
  }

  /**
   * WASD pan — screen-aligned.
   * W = up on screen (+groundForward), D = right on screen (+groundRight)
   */
  private processKeyboardPan(dt: number): void {
    let dx = 0, dy = 0;
    const speed = PAN_SPEED * dt;
    if (this.keysPressed.has('w') || this.keysPressed.has('W')) dy += speed;
    if (this.keysPressed.has('s') || this.keysPressed.has('S')) dy -= speed;
    if (this.keysPressed.has('a') || this.keysPressed.has('A')) dx -= speed;
    if (this.keysPressed.has('d') || this.keysPressed.has('D')) dx += speed;
    if (dx !== 0 || dy !== 0) this.panScreen(dx, dy);
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.keysPressed.add(e.key);
    if (e.key === 'q' || e.key === 'Q') this.rotateCounterClockwise();
    else if (e.key === 'e' || e.key === 'E') this.rotateClockwise();
  }

  private onKeyUp(e: KeyboardEvent): void { this.keysPressed.delete(e.key); }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    // 30% more zoom per scroll step for faster zoom-in
    this.wheelDelta += e.deltaY * 1.3;
  }

  // ─── Mouse Controls ──────────────────────────────────────────

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 1) {
      // Middle mouse — start panning
      e.preventDefault();
      this.isMousePanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    } else if (e.button === 2) {
      // Right mouse — start tracking for potential rotation
      e.preventDefault();
      this.isMouseRotating = true;
      this.rightMouseDownX = e.clientX;
      this.rightMouseDownY = e.clientY;
      this.rightDragOccurred = false;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isMousePanning) {
      const deltaX = e.clientX - this.lastMouseX;
      const deltaY = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // Grab & drag: world follows mouse direction.
      // Mouse right → world moves right → target moves left (-groundRight)
      // Mouse down  → world moves down  → target moves up   (-groundForward)
      const worldDx = -deltaX / this.currentZoom * MOUSE_PAN_SPEED;
      const worldDy = -deltaY / this.currentZoom * MOUSE_PAN_SPEED;
      this.targetOffset.addScaledVector(this.groundRight, worldDx);
      this.targetOffset.addScaledVector(this.groundForward, worldDy);
    }

    if (this.isMouseRotating) {
      // Check if this qualifies as a drag
      const totalDx = Math.abs(e.clientX - this.rightMouseDownX);
      const totalDy = Math.abs(e.clientY - this.rightMouseDownY);
      if (totalDx > RIGHT_CLICK_DRAG_THRESHOLD || totalDy > RIGHT_CLICK_DRAG_THRESHOLD) {
        this.rightDragOccurred = true;
      }

      if (this.rightDragOccurred) {
        const deltaX = e.clientX - this.lastMouseX;
        this.lastMouseX = e.clientX;

        // Horizontal mouse movement = rotation
        this.currentRotationRad += deltaX * MOUSE_ROTATE_SPEED;

        // Update camera immediately for smooth feedback
        this.updateCameraPosition();
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 1) {
      this.isMousePanning = false;
    } else if (e.button === 2) {
      const wasRotating = this.isMouseRotating;
      const wasDrag = this.rightDragOccurred;
      this.isMouseRotating = false;

      if (wasRotating && wasDrag) {
        // Snap to nearest 90° step
        const stepRad = Math.PI / 2;
        this.targetRotationStep = Math.round(this.currentRotationRad / stepRad) % ROTATION_DIRECTIONS;
        if (this.targetRotationStep < 0) this.targetRotationStep += ROTATION_DIRECTIONS;
      } else if (wasRotating && !wasDrag) {
        // Right-click without drag — fire callback for cancel/deselect
        this.onRightClickWithoutDrag?.();
      }
    }
  }

  private onBlur(): void {
    // Cancel any active drags if window loses focus
    this.isMousePanning = false;
    this.isMouseRotating = false;
    this.keysPressed.clear();
  }

  private onResize(): void {
    if (typeof window === 'undefined') return;
    this.viewWidth = window.innerWidth;
    this.viewHeight = window.innerHeight;
    this.updateCameraPosition();
  }
}