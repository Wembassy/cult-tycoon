/**
 * BuildingSystem — Wall placement, floor placement, door placement,
 * object placement, room detection, and demolition.
 */

import { TileMap } from '../world/TileMap';
import { DataManager } from '../data/DataManager';

export type BuildType = 'wall' | 'floor' | 'door' | 'object';
export type WallVariant = 'straight' | 'corner' | 'tjunction' | 'end';
export type FloorVariant = 'stone' | 'wood' | 'grass';
export type RoomType =
  | 'lobby'
  | 'temple'
  | 'kitchen'
  | 'canteen'
  | 'bedroom'
  | 'bathroom'
  | 'research_office'
  | 'recreation_room'
  | 'generic';

export interface BuildResult {
  success: boolean;
  message: string;
  tilesAffected: { x: number; y: number }[];
  cost: number;
}

export interface PlacedObject {
  id: string;
  objectId: string;
  x: number;
  y: number;
  rotation: number;
  width?: number;
  height?: number;
}

export interface Room {
  id: number;
  type: RoomType;
  roomDefinitionId?: string;
  tiles: { x: number; y: number }[];
  area: number;
}

export interface BuildingSnapshot {
  objects: PlacedObject[];
  rooms: Room[];
  wallTiles: string[];
  doorTiles: string[];
  floorTiles: string[];
  nextRoomId: number;
  nextObjectId: number;
}

// Cost table
const COSTS: Record<BuildType, number> = {
  wall: 5,
  floor: 2,
  door: 10,
  object: 3,
};

export class BuildingSystem {
  private map: TileMap;
  private objects: Map<string, PlacedObject> = new Map();
  private rooms: Map<number, Room> = new Map();
  private nextRoomId = 1;
  private nextObjectId = 1;
  private _wallTiles: Set<string> = new Set();
  private _doorTiles: Set<string> = new Set();
  private _floorTiles: Set<string> = new Set();
  private _dirty = false;

  constructor(map: TileMap) {
    this.map = map;
  }

  /**
   * Place a wall on a tile
   */
  placeWall(x: number, y: number, _variant: WallVariant = 'straight'): BuildResult {
    if (!this.map.isBuildable(x, y) || this._doorTiles.has(`${x},${y}`)) {
      return { success: false, message: 'Tile not buildable', tilesAffected: [], cost: 0 };
    }
    this.map.setOccupied(x, y, true);
    this._wallTiles.add(`${x},${y}`);
    this._floorTiles.delete(`${x},${y}`);
    this._doorTiles.delete(`${x},${y}`);
    this._dirty = true;
    return { success: true, message: 'Wall placed', tilesAffected: [{ x, y }], cost: COSTS.wall };
  }

  /**
   * Place a floor on a tile
   */
  placeFloor(x: number, y: number, _variant: FloorVariant = 'stone'): BuildResult {
    const tile = this.map.getTile(x, y);
    if (!tile) {
      return { success: false, message: 'Out of bounds', tilesAffected: [], cost: 0 };
    }
    if (!tile.buildable || this._wallTiles.has(`${x},${y}`)) {
      return {
        success: false,
        message: 'Floor requires dry ground without a wall',
        tilesAffected: [],
        cost: 0,
      };
    }
    if (this._floorTiles.has(`${x},${y}`))
      return { success: false, message: 'Floor already placed', tilesAffected: [], cost: 0 };
    this._floorTiles.add(`${x},${y}`);
    this._dirty = true;
    return { success: true, message: 'Floor placed', tilesAffected: [{ x, y }], cost: COSTS.floor };
  }

  /**
   * Place a door on a tile (requires adjacent walls)
   */
  placeDoor(x: number, y: number): BuildResult {
    const key = `${x},${y}`,
      tile = this.map.getTile(x, y);
    if (!tile?.buildable || this._doorTiles.has(key) || this.getObjectAt(x, y))
      return {
        success: false,
        message: 'Door location is unavailable',
        tilesAffected: [],
        cost: 0,
      };
    const hasWall =
      this._wallTiles.has(key) ||
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => this._wallTiles.has(`${x + dx},${y + dy}`));
    if (!hasWall)
      return { success: false, message: 'Door requires adjacent wall', tilesAffected: [], cost: 0 };
    this._wallTiles.delete(key);
    this._doorTiles.add(key);
    // A door reserves a construction tile, but is passable for NPC navigation.
    this.map.setOccupied(x, y, false);
    this._dirty = true;
    return { success: true, message: 'Door placed', tilesAffected: [{ x, y }], cost: COSTS.door };
  }

  /**
   * Place an object on a tile
   */
  getFootprint(x: number, y: number, objectId: string, rotation = 0): { x: number; y: number }[] {
    const def = DataManager.getObject(objectId),
      size = def?.size ?? { w: 1, h: 1 };
    const swap = Math.abs(Math.round(rotation / (Math.PI / 2))) % 2 === 1;
    const width = swap ? size.h : size.w,
      height = swap ? size.w : size.h;
    const cells: { x: number; y: number }[] = [];
    for (let yy = 0; yy < height; yy++)
      for (let xx = 0; xx < width; xx++) cells.push({ x: x + xx, y: y + yy });
    return cells;
  }
  getObjectAt(x: number, y: number): PlacedObject | undefined {
    return this.getAllObjects().find((obj) =>
      this.getFootprint(obj.x, obj.y, obj.objectId, obj.rotation).some(
        (t) => t.x === x && t.y === y,
      ),
    );
  }
  canPlaceObject(x: number, y: number, objectId: string, rotation = 0): boolean {
    return this.getFootprint(x, y, objectId, rotation).every(
      (t) => this.map.isBuildable(t.x, t.y) && !this._doorTiles.has(`${t.x},${t.y}`),
    );
  }
  placeObject(x: number, y: number, objectId: string, rotation = 0): BuildResult {
    if (!this.canPlaceObject(x, y, objectId, rotation))
      return {
        success: false,
        message: 'Full object footprint must be clear and on dry land',
        tilesAffected: [],
        cost: 0,
      };
    const id = `obj_${this.nextObjectId++}`,
      tiles = this.getFootprint(x, y, objectId, rotation);
    this.objects.set(id, { id, objectId, x, y, rotation });
    for (const t of tiles) this.map.setOccupied(t.x, t.y, true);
    this._dirty = true;
    return {
      success: true,
      message: 'Object placed',
      tilesAffected: tiles,
      cost: DataManager.getObject(objectId)?.cost ?? COSTS.object,
    };
  }

  /**
   * Demolish whatever is on a tile
   */
  demolish(x: number, y: number): BuildResult {
    const key = `${x},${y}`,
      tile = this.map.getTile(x, y);
    if (!tile) return { success: false, message: 'Out of bounds', tilesAffected: [], cost: 0 };
    const obj = this.getObjectAt(x, y);
    let tiles = [{ x, y }];
    if (obj) {
      tiles = this.getFootprint(obj.x, obj.y, obj.objectId, obj.rotation);
      this.objects.delete(obj.id);
      for (const t of tiles) this.map.setOccupied(t.x, t.y, false);
    } else if (this._wallTiles.delete(key) || this._doorTiles.delete(key))
      this.map.setOccupied(x, y, false);
    else if (!this._floorTiles.delete(key))
      return { success: false, message: 'Nothing to demolish', tilesAffected: [], cost: 0 };
    // Room paint and the floor underneath furniture survive demolition.
    this._dirty = true;
    return { success: true, message: 'Demolished', tilesAffected: tiles, cost: 0 };
  }

  /**
   * Place walls in a line (drag placement)
   */
  placeWallLine(startX: number, startY: number, endX: number, endY: number): BuildResult {
    const tiles: { x: number; y: number }[] = [];
    let totalCost = 0;
    let failed = 0;

    const dx = Math.sign(endX - startX);
    const dy = Math.sign(endY - startY);

    if (dx !== 0 && dy !== 0) {
      // Diagonal not supported — pick the longer axis
      if (Math.abs(endX - startX) > Math.abs(endY - startY)) {
        // Horizontal
        for (let x = startX; x !== endX + dx; x += dx) {
          const result = this.placeWall(x, startY);
          if (result.success) {
            tiles.push({ x, y: startY });
            totalCost += result.cost;
          } else {
            failed++;
          }
        }
      } else {
        // Vertical
        for (let y = startY; y !== endY + dy; y += dy) {
          const result = this.placeWall(startX, y);
          if (result.success) {
            tiles.push({ x: startX, y });
            totalCost += result.cost;
          } else {
            failed++;
          }
        }
      }
    } else if (dx !== 0) {
      for (let x = startX; x !== endX + dx; x += dx) {
        const result = this.placeWall(x, startY);
        if (result.success) {
          tiles.push({ x, y: startY });
          totalCost += result.cost;
        } else {
          failed++;
        }
      }
    } else if (dy !== 0) {
      for (let y = startY; y !== endY + dy; y += dy) {
        const result = this.placeWall(startX, y);
        if (result.success) {
          tiles.push({ x: startX, y });
          totalCost += result.cost;
        } else {
          failed++;
        }
      }
    } else {
      // Single tile
      const result = this.placeWall(startX, startY);
      if (result.success) {
        tiles.push({ x: startX, y: startY });
        totalCost += result.cost;
      }
    }

    return {
      success: tiles.length > 0,
      message: `Placed ${tiles.length} walls${failed > 0 ? `, ${failed} failed` : ''}`,
      tilesAffected: tiles,
      cost: totalCost,
    };
  }

  /**
   * Place floors in a rectangular area (drag fill)
   */
  placeFloorArea(startX: number, startY: number, endX: number, endY: number): BuildResult {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const tiles: { x: number; y: number }[] = [];
    let totalCost = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const result = this.placeFloor(x, y);
        if (result.success) {
          tiles.push({ x, y });
          totalCost += result.cost;
        }
      }
    }

    return {
      success: tiles.length > 0,
      message: `Placed ${tiles.length} floor tiles`,
      tilesAffected: tiles,
      cost: totalCost,
    };
  }

  /**
   * Designate a room rectangle, Prison Architect-style.
   * Walls are not required at designation time; the designation defines intended use.
   */
  designateRoomArea(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    type: RoomType,
    roomDefinitionId: string,
  ): Room | null {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    if (
      ![startX, startY, endX, endY].every(Number.isInteger) ||
      !this.map.getTile(minX, minY) ||
      !this.map.getTile(maxX, maxY)
    )
      return null;
    const tiles: { x: number; y: number }[] = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.map.getTile(x, y);
        if (!tile || !tile.buildable) return null;
        if (this._wallTiles.has(`${x},${y}`)) continue;
        tiles.push({ x, y });
      }
    }

    if (tiles.length < (DataManager.getRoom(roomDefinitionId)?.minSize ?? 1)) return null;

    // Remove overwritten tiles from any prior designation.
    const touchedRooms = new Set<number>();
    for (const { x, y } of tiles) {
      const tile = this.map.getTile(x, y);
      if (tile?.roomId !== null && tile?.roomId !== undefined) {
        touchedRooms.add(tile.roomId);
      }
    }

    const roomId = this.nextRoomId++;
    for (const { x, y } of tiles) {
      this.map.setRoomId(x, y, roomId);
    }

    const room: Room = {
      id: roomId,
      type,
      roomDefinitionId,
      tiles,
      area: tiles.length,
    };
    this.rooms.set(roomId, room);

    for (const oldRoomId of touchedRooms) {
      if (oldRoomId !== roomId) this.refreshRoom(oldRoomId);
    }

    this._dirty = true;
    return room;
  }

  clearRoomArea(startX: number, startY: number, endX: number, endY: number): number {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const touchedRooms = new Set<number>();
    let cleared = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.map.getTile(x, y);
        if (!tile || tile.roomId === null) continue;
        const room = this.rooms.get(tile.roomId);
        if (!room?.roomDefinitionId) continue;
        touchedRooms.add(tile.roomId);
        this.map.setRoomId(x, y, null);
        cleared++;
      }
    }

    for (const roomId of touchedRooms) this.refreshRoom(roomId);
    if (cleared > 0) this._dirty = true;
    return cleared;
  }

  /**
   * Detect enclosed rooms using flood fill.
   * A room is an area of non-occupied, buildable tiles surrounded by occupied tiles.
   */
  detectRoom(startX: number, startY: number): Room | null {
    const tile = this.map.getTile(startX, startY);
    if (!tile || tile.occupied) return null;

    const filled = this.map.floodFill(startX, startY, (t) => !t.occupied && t.buildable);

    if (filled.length < 4) return null; // too small to be a room

    // Check if the area is enclosed (has occupied tiles on the boundary)
    const filledSet = new Set(filled.map((f) => `${f.x},${f.y}`));
    let enclosed = false;
    for (const { x, y } of filled) {
      const neighbors = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];
      for (const n of neighbors) {
        if (!filledSet.has(`${n.x},${n.y}`)) {
          const nTile = this.map.getTile(n.x, n.y);
          if (nTile && nTile.occupied) {
            enclosed = true;
          }
        }
      }
    }

    if (!enclosed) return null;

    const roomId = this.nextRoomId++;
    for (const { x, y } of filled) {
      this.map.setRoomId(x, y, roomId);
    }

    const room: Room = {
      id: roomId,
      type: 'generic',
      tiles: filled,
      area: filled.length,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * Assign a room type
   */
  setRoomType(roomId: number, type: RoomType): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.type = type;
    return true;
  }

  /**
   * Get a room by ID
   */
  getRoom(roomId: number): Room | null {
    return this.rooms.get(roomId) ?? null;
  }

  /**
   * Get all rooms
   */
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get all placed objects
   */
  getAllObjects(): PlacedObject[] {
    return Array.from(this.objects.values());
  }

  getRoomStatus(roomId: number): {
    complete: boolean;
    checks: { label: string; met: boolean; objectId?: string }[];
    missing: string[];
  } {
    const room = this.rooms.get(roomId),
      def = room?.roomDefinitionId ? DataManager.getRoom(room.roomDefinitionId) : undefined;
    if (!room || !def) return { complete: false, checks: [], missing: ['Designate a room type'] };
    const keys = new Set(room.tiles.map((t) => `${t.x},${t.y}`));
    const checks: { label: string; met: boolean; objectId?: string }[] = [
      { label: `At least ${def.minSize} tiles (${room.area})`, met: room.area >= def.minSize },
    ];
    for (const id of def.requiredObjects) {
      const met = this.getAllObjects().some(
        (obj) =>
          obj.objectId === id &&
          this.getFootprint(obj.x, obj.y, obj.objectId, obj.rotation).every((t) =>
            keys.has(`${t.x},${t.y}`),
          ),
      );
      checks.push({ label: DataManager.getObject(id)?.name ?? id, met, objectId: id });
    }
    if (def.requiresFloor)
      checks.push({
        label: 'Flooring throughout the room',
        met: room.tiles.every((t) => this._floorTiles.has(`${t.x},${t.y}`)),
      });
    if (def.requiresEnclosure)
      checks.push({ label: 'Enclosed by walls and doors', met: this.roomEnclosed(room) });
    return {
      complete: checks.every((c) => c.met),
      checks,
      missing: checks.filter((c) => !c.met).map((c) => c.label),
    };
  }
  private roomEnclosed(room: Room): boolean {
    const start = room.tiles[0];
    if (!start) return false;
    const seen = new Set<string>(),
      queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i],
        key = `${t.x},${t.y}`;
      if (seen.has(key) || this._wallTiles.has(key) || this._doorTiles.has(key)) continue;
      seen.add(key);
      if (t.x <= 0 || t.y <= 0 || t.x >= this.map.width - 1 || t.y >= this.map.height - 1)
        return false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        queue.push({ x: t.x + dx, y: t.y + dy });
    }
    return true;
  }
  getAdjacentTiles(obj: PlacedObject): { x: number; y: number }[] {
    const footprint = this.getFootprint(obj.x, obj.y, obj.objectId, obj.rotation),
      own = new Set(footprint.map((t) => `${t.x},${t.y}`));
    const result = new Map<string, { x: number; y: number }>();
    for (const t of footprint)
      for (const [dx, dy] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ]) {
        const p = { x: t.x + dx, y: t.y + dy },
          key = `${p.x},${p.y}`;
        if (!own.has(key) && this.map.isBuildable(p.x, p.y)) result.set(key, p);
      }
    return [...result.values()];
  }

  /** Set of "x,y" strings for wall tiles. */
  get wallTiles(): Set<string> {
    return this._wallTiles;
  }

  /** Set of "x,y" strings for door tiles. */
  get doorTiles(): Set<string> {
    return this._doorTiles;
  }

  /** Set of "x,y" strings for floor tiles. */
  get floorTiles(): Set<string> {
    return this._floorTiles;
  }

  /** True when building state has changed since last sync. */
  get isDirty(): boolean {
    return this._dirty;
  }

  /** Clear the dirty flag after rendering sync. */
  clearDirty(): void {
    this._dirty = false;
  }

  getSnapshot(): BuildingSnapshot {
    return {
      objects: this.getAllObjects().map((obj) => ({ ...obj })),
      rooms: this.getAllRooms().map((room) => ({
        ...room,
        tiles: room.tiles.map((tile) => ({ ...tile })),
      })),
      wallTiles: [...this._wallTiles],
      doorTiles: [...this._doorTiles],
      floorTiles: [...this._floorTiles],
      nextRoomId: this.nextRoomId,
      nextObjectId: this.nextObjectId,
    };
  }

  restoreSnapshot(snapshot: BuildingSnapshot | undefined): void {
    this.objects.clear();
    this.rooms.clear();
    this._wallTiles.clear();
    this._doorTiles.clear();
    this._floorTiles.clear();

    if (!snapshot) {
      this.nextRoomId = 1;
      this.nextObjectId = 1;
      this._dirty = true;
      return;
    }

    for (const obj of snapshot.objects ?? []) {
      this.objects.set(obj.id, { ...obj });
    }
    for (const room of snapshot.rooms ?? []) {
      this.rooms.set(room.id, {
        ...room,
        tiles: room.tiles.map((tile) => ({ ...tile })),
      });
    }
    for (const tile of snapshot.wallTiles ?? []) this._wallTiles.add(tile);
    for (const tile of snapshot.doorTiles ?? []) this._doorTiles.add(tile);
    for (const tile of snapshot.floorTiles ?? []) this._floorTiles.add(tile);

    this.nextRoomId = snapshot.nextRoomId ?? 1;
    this.nextObjectId = snapshot.nextObjectId ?? 1;
    for (const t of this.map.getAllTiles()) {
      this.map.setOccupied(t.x, t.y, false);
      this.map.setRoomId(t.x, t.y, null);
    }
    for (const key of this._wallTiles) {
      const [x, y] = key.split(',').map(Number);
      this.map.setOccupied(x, y, true);
    }
    for (const obj of this.objects.values())
      for (const t of this.getFootprint(obj.x, obj.y, obj.objectId, obj.rotation))
        this.map.setOccupied(t.x, t.y, true);
    for (const room of this.rooms.values())
      for (const t of room.tiles) this.map.setRoomId(t.x, t.y, room.id);
    this.nextObjectId = Math.max(
      this.nextObjectId,
      ...this.getAllObjects().map((obj) => Number(obj.id.replace('obj_', '')) + 1),
    );
    this.nextRoomId = Math.max(this.nextRoomId, ...this.getAllRooms().map((room) => room.id + 1));
    this._dirty = true;
  }

  /**
   * Refresh a room after tile changes (re-check enclosure)
   */
  private refreshRoom(roomId: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Check if any tiles still belong to this room
    const remaining = room.tiles.filter((t) => {
      const tile = this.map.getTile(t.x, t.y);
      return tile && tile.roomId === roomId;
    });

    if (remaining.length === 0) {
      this.rooms.delete(roomId);
    } else {
      room.tiles = remaining;
      room.area = remaining.length;
    }
  }
}
