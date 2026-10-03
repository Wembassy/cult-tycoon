/**
 * TileMap — Grid-based tile system for the game world.
 * Each tile stores terrain type, buildability, occupancy, and room assignment.
 */

export type TerrainType = 'grass' | 'dirt' | 'stone' | 'water';
export type DecorType = 'none' | 'tree' | 'rock' | 'bush' | 'flower';

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainType;
  buildable: boolean;
  occupied: boolean;
  roomId: number | null;
  decor: DecorType;
}

const TERRAIN_BUILDABLE: Record<TerrainType, boolean> = {
  grass: true,
  dirt: true,
  stone: true,
  water: false,
};

export class TileMap {
  private tiles: Tile[][] = [];
  revision = 0;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.initialize();
  }

  private initialize() {
    for (let y = 0; y < this.height; y++) {
      const row: Tile[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push({
          x,
          y,
          terrain: 'grass',
          buildable: true,
          occupied: false,
          roomId: null,
          decor: 'none',
        });
      }
      this.tiles.push(row);
    }
  }

  getTile(x: number, y: number): Tile | null {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x >= this.width ||
      y < 0 ||
      y >= this.height
    )
      return null;
    return this.tiles[y][x];
  }

  setTerrain(x: number, y: number, terrain: TerrainType): void {
    const tile = this.getTile(x, y);
    if (!tile) return;
    if (tile.terrain !== terrain) this.revision++;
    tile.terrain = terrain;
    tile.buildable = TERRAIN_BUILDABLE[terrain];
  }

  isBuildable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile ? tile.buildable && !tile.occupied : false;
  }

  isOccupied(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile ? tile.occupied : false;
  }

  setOccupied(x: number, y: number, occupied: boolean): void {
    const tile = this.getTile(x, y);
    if (tile && tile.occupied !== occupied) {
      tile.occupied = occupied;
      this.revision++;
    }
  }

  setRoomId(x: number, y: number, roomId: number | null): void {
    const tile = this.getTile(x, y);
    if (tile) tile.roomId = roomId;
  }

  getRoomTiles(roomId: number): Tile[] {
    const result: Tile[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.tiles[y][x].roomId === roomId) {
          result.push(this.tiles[y][x]);
        }
      }
    }
    return result;
  }

  /**
   * Flood-fill from a starting tile to find all connected tiles
   * that share the same properties (for room detection).
   * Returns array of {x, y} coordinates.
   */
  floodFill(
    startX: number,
    startY: number,
    predicate: (tile: Tile) => boolean,
  ): { x: number; y: number }[] {
    const visited = new Set<string>();
    const result: { x: number; y: number }[] = [];
    const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const tile = this.getTile(x, y);
      if (!tile || !predicate(tile)) continue;

      result.push({ x, y });
      queue.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
    }

    return result;
  }

  /**
   * Check if a tile is enclosed by walls/obstacles on all 4 sides
   * (used for room detection).
   */
  isEnclosed(x: number, y: number): boolean {
    const directions = [
      { dx: 0, dy: -1 }, // north
      { dx: 1, dy: 0 }, // east
      { dx: 0, dy: 1 }, // south
      { dx: -1, dy: 0 }, // west
    ];
    let blockedSides = 0;
    for (const { dx, dy } of directions) {
      const tile = this.getTile(x + dx, y + dy);
      if (!tile || tile.terrain === 'water' || (tile.occupied && tile.buildable === false)) {
        blockedSides++;
      }
    }
    return blockedSides >= 3;
  }

  clear(): void {
    this.tiles = [];
    this.revision++;
    this.initialize();
  }

  /**
   * Get all tiles as a flat array
   */
  getAllTiles(): Tile[] {
    const result: Tile[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        result.push(this.tiles[y][x]);
      }
    }
    return result;
  }
}
