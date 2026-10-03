/**
 * InputManager — Handles mouse picking, drag selection, and keyboard shortcuts.
 * Camera controls (pan, rotate, zoom, wheel) are handled by IsoCamera.
 * Right-click cancel/deselect is handled by IsoCamera (via onRightClickWithoutDrag)
 * so that right-drag can be used for camera rotation without triggering cancel.
 */

export interface TileCoord { x: number; y: number }

export type InputMode = 'select' | 'build' | 'demolish';

export interface InputState {
  mode: InputMode;
  hoveredTile: TileCoord | null;
  selectedTile: TileCoord | null;
  dragStart: TileCoord | null;
  dragEnd: TileCoord | null;
  isDragging: boolean;
}

type KeyHandler = (key: string) => void;
type MouseHandler = (tile: TileCoord, event: MouseEvent) => void;
type DragHandler = (start: TileCoord, end: TileCoord) => void;

export class InputManager {
  private canvas: HTMLCanvasElement;
  private screenToTile: (x: number, y: number) => TileCoord;
  private state: InputState;
  private disposed = false;

  // Callbacks
  onTileHover?: MouseHandler;
  onTileClick?: MouseHandler;
  onTileRightClick?: MouseHandler;
  onDragStart?: MouseHandler;
  onDragEnd?: DragHandler;
  onDragUpdate?: DragHandler;
  onKeyPressed?: KeyHandler;

  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundContextMenu: (e: Event) => void;

  constructor(canvas: HTMLCanvasElement, screenToTile: (x: number, y: number) => TileCoord) {
    this.canvas = canvas;
    this.screenToTile = screenToTile;
    this.state = {
      mode: 'select',
      hoveredTile: null,
      selectedTile: null,
      dragStart: null,
      dragEnd: null,
      isDragging: false,
    };

    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundContextMenu = (e: Event) => e.preventDefault();

    // Only listen for left-click (button 0) on canvas.
    // Right-click (button 2) and middle-click (button 1) are handled by IsoCamera.
    this.canvas.addEventListener('mousemove', this.boundMouseMove);
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('keydown', this.boundKeyDown);
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
  }

  getMode(): InputMode { return this.state.mode; }
  setMode(mode: InputMode): void { this.state.mode = mode; }
  getState(): InputState { return { ...this.state }; }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    this.state.hoveredTile = tile;
    this.onTileHover?.(tile, e);

    if (this.state.isDragging && this.state.dragStart) {
      this.state.dragEnd = tile;
      this.onDragUpdate?.(this.state.dragStart, tile);
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    // Only handle left-click; right-click is handled by IsoCamera for rotation
    if (e.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);

    // Left click
    this.state.selectedTile = tile;
    if (this.state.mode === 'build' || this.state.mode === 'demolish') {
      this.state.isDragging = true;
      this.state.dragStart = tile;
      this.state.dragEnd = tile;
      this.onDragStart?.(tile, e);
    } else {
      this.onTileClick?.(tile, e);
    }
  }

  private handleMouseUp(_e: MouseEvent): void {
    if (this.state.isDragging && this.state.dragStart && this.state.dragEnd) {
      this.onDragEnd?.(this.state.dragStart, this.state.dragEnd);
    }
    this.state.isDragging = false;
    this.state.dragStart = null;
    this.state.dragEnd = null;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.onKeyPressed?.(key);

    // Built-in shortcuts
    switch (key) {
      case 'escape':
        this.state.mode = 'select';
        this.state.selectedTile = null;
        this.state.isDragging = false;
        break;
      case ' ':
        e.preventDefault();
        break;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('mousemove', this.boundMouseMove);
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('keydown', this.boundKeyDown);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
  }
}