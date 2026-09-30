/**
 * InputManager — Handles mouse picking, drag selection, camera controls,
 * and keyboard shortcuts for the game.
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
  onCameraZoom?: (delta: number) => void;

  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundWheel: (e: WheelEvent) => void;
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
    this.boundWheel = this.handleWheel.bind(this);
    this.boundContextMenu = (e: Event) => e.preventDefault();

    this.canvas.addEventListener('mousemove', this.boundMouseMove);
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('keydown', this.boundKeyDown);
    this.canvas.addEventListener('wheel', this.boundWheel, { passive: false });
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
    const rect = this.canvas.getBoundingClientRect();
    const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);

    if (e.button === 0) {
      // Left click
      this.state.selectedTile = tile;
      if (this.state.mode === 'build') {
        this.state.isDragging = true;
        this.state.dragStart = tile;
        this.state.dragEnd = tile;
        this.onDragStart?.(tile, e);
      } else {
        this.onTileClick?.(tile, e);
      }
    } else if (e.button === 2) {
      // Right click — cancel/deselect
      this.state.isDragging = false;
      this.state.dragStart = null;
      this.state.dragEnd = null;
      this.state.selectedTile = null;
      this.onTileRightClick?.(tile, e);
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
      case 'b':
        this.state.mode = 'build';
        break;
      case 'd':
        this.state.mode = 'demolish';
        break;
      case ' ':
        e.preventDefault();
        break;
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    this.onCameraZoom?.(-e.deltaY * 0.001);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('mousemove', this.boundMouseMove);
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('keydown', this.boundKeyDown);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
  }
}