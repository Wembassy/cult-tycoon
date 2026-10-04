/**
 * BuildingSystem — Wall placement, floor placement, door placement,
 * object placement, room detection, and demolition.
 */

import { TileMap } from '../world/TileMap';
import { NavigationGrid } from '../world/NavigationGrid';

export type BuildType = 'wall' | 'floor' | 'door' | 'object';
export type WallVariant = 'straight' | 'corner' | 'tjunction' | 'end';
export type FloorVariant = 'stone' | 'wood' | 'grass';
export type ConstructionOrientation = 'horizontal' | 'vertical';

export interface ConstructionEdge {
  x: number;
  y: number;
  orientation: ConstructionOrientation;
}
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
  /** Legacy cell-based architecture retained for save migration. */
  wallTiles: string[];
  doorTiles: string[];
  /** Alpha edge-based architecture. */
  wallEdges?: ConstructionEdge[];
  doorEdges?: ConstructionEdge[];
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
  private _wallEdges: Map<string, ConstructionEdge> = new Map();
  private _doorEdges: Map<string, ConstructionEdge> = new Map();
  private _floorTiles: Set<string> = new Set();
  private _dirty = false;
  private readonly constructionSubdivisions: number;
  private readonly navigation: NavigationGrid | null;

  constructor(map: TileMap, constructionSubdivisions: number = 1, navigation: NavigationGrid | null = null) {
    this.map = map;
    this.constructionSubdivisions = Math.max(1, Math.floor(constructionSubdivisions));
    this.navigation = navigation;
  }

  get subdivisions(): number { return this.constructionSubdivisions; }
  get cellSize(): number { return 1 / this.constructionSubdivisions; }

  toTerrainTile(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.floor(x / this.constructionSubdivisions),
      y: Math.floor(y / this.constructionSubdivisions),
    };
  }

  getTerrainTileForBuild(x: number, y: number) {
    const terrain = this.toTerrainTile(x, y);
    return this.map.getTile(terrain.x, terrain.y);
  }

  private edgeKey(x: number, y: number, orientation: ConstructionOrientation): string {
    return `${x},${y},${orientation}`;
  }

  private edgeNavigationSource(x: number, y: number, orientation: ConstructionOrientation): string {
    return `building-edge:${this.edgeKey(x, y, orientation)}`;
  }

  hasWallEdge(x: number, y: number, orientation: ConstructionOrientation): boolean {
    return this._wallEdges.has(this.edgeKey(x, y, orientation));
  }

  hasDoorEdge(x: number, y: number, orientation: ConstructionOrientation): boolean {
    return this._doorEdges.has(this.edgeKey(x, y, orientation));
  }

  private isEdgeInBounds(x: number, y: number, orientation: ConstructionOrientation): boolean {
    const maxX = this.map.width * this.constructionSubdivisions;
    const maxY = this.map.height * this.constructionSubdivisions;
    if (orientation === 'horizontal') {
      return x >= 0 && x < maxX && y >= 0 && y <= maxY;
    }
    return x >= 0 && x <= maxX && y >= 0 && y < maxY;
  }

  private edgeTouchesBuildableTerrain(x: number, y: number, orientation: ConstructionOrientation): boolean {
    const candidates = orientation === 'horizontal'
      ? [{ x, y: y - 1 }, { x, y }]
      : [{ x: x - 1, y }, { x, y }];

    return candidates.some(cell => {
      if (cell.x < 0 || cell.y < 0) return false;
      const tile = this.getTerrainTileForBuild(cell.x, cell.y);
      return !!tile?.buildable;
    });
  }

  placeWallEdge(x: number, y: number, orientation: ConstructionOrientation): BuildResult {
    if (!this.isEdgeInBounds(x, y, orientation) || !this.edgeTouchesBuildableTerrain(x, y, orientation)) {
      return { success: false, message: 'Edge not buildable', tilesAffected: [], cost: 0 };
    }

    const key = this.edgeKey(x, y, orientation);
    if (this._wallEdges.has(key) || this._doorEdges.has(key)) {
      return { success: false, message: 'Edge already occupied', tilesAffected: [], cost: 0 };
    }

    this._wallEdges.set(key, { x, y, orientation });
    this.navigation?.addConstructionEdge(
      x,
      y,
      orientation,
      this.constructionSubdivisions,
      this.edgeNavigationSource(x, y, orientation),
    );
    this._dirty = true;
    return { success: true, message: 'Wall edge placed', tilesAffected: [{ x, y }], cost: COSTS.wall };
  }

  placeDoorEdge(x: number, y: number, orientation: ConstructionOrientation): BuildResult {
    const key = this.edgeKey(x, y, orientation);
    if (!this._wallEdges.has(key)) {
      return { success: false, message: 'Door requires an existing wall edge', tilesAffected: [], cost: 0 };
    }

    this._wallEdges.delete(key);
    this.navigation?.removeConstructionEdge(
      x,
      y,
      orientation,
      this.constructionSubdivisions,
      this.edgeNavigationSource(x, y, orientation),
    );
    this._doorEdges.set(key, { x, y, orientation });
    this._dirty = true;
    return { success: true, message: 'Door edge placed', tilesAffected: [{ x, y }], cost: COSTS.door };
  }

  demolishEdge(x: number, y: number, orientation: ConstructionOrientation): BuildResult {
    const key = this.edgeKey(x, y, orientation);
    const removedWall = this._wallEdges.delete(key);
    const removedDoor = this._doorEdges.delete(key);
    const removed = removedWall || removedDoor;
    if (!removed) {
      return { success: false, message: 'Nothing to demolish on edge', tilesAffected: [], cost: 0 };
    }
    if (removedWall) {
      this.navigation?.removeConstructionEdge(
        x,
        y,
        orientation,
        this.constructionSubdivisions,
        this.edgeNavigationSource(x, y, orientation),
      );
    }
    this._dirty = true;
    return { success: true, message: 'Edge demolished', tilesAffected: [{ x, y }], cost: 1 };
  }

  hasBlockingElementAt(x: number, y: number): boolean {
    const key = `${x},${y}`;
    return this._wallTiles.has(key) ||
      this._doorTiles.has(key) ||
      Array.from(this.objects.values()).some(obj => obj.x === x && obj.y === y);
  }

  /**
   * Legacy TileMap occupancy is retained only for old 1:1 systems that still
   * inspect it. Navigation no longer reads TileMap.occupied.
   */
  private refreshTerrainOccupancyForBuildCell(x: number, y: number): void {
    const terrain = this.toTerrainTile(x, y);
    const occupied =
      Array.from(this._wallTiles).some(key => {
        const [gx, gy] = key.split(',').map(Number);
        const t = this.toTerrainTile(gx, gy);
        return t.x === terrain.x && t.y === terrain.y;
      }) ||
      Array.from(this._doorTiles).some(key => {
        const [gx, gy] = key.split(',').map(Number);
        const t = this.toTerrainTile(gx, gy);
        return t.x === terrain.x && t.y === terrain.y;
      }) ||
      Array.from(this.objects.values()).some(obj => {
        const t = this.toTerrainTile(obj.x, obj.y);
        return t.x === terrain.x && t.y === terrain.y;
      });
    this.map.setOccupied(terrain.x, terrain.y, occupied);
  }

  /**
   * Until edge-based walls land, mirror 1:1 architecture into NavigationGrid.
   * Fine construction cells intentionally never block an entire terrain cell.
   */
  private refreshLegacyNavigationForBuildCell(x: number, y: number): void {
    if (!this.navigation || this.constructionSubdivisions !== 1) return;

    const terrain = this.toTerrainTile(x, y);
    const key = `${x},${y}`;
    const hasWall = this._wallTiles.has(key);
    const hasBlockingObject = Array.from(this.objects.values()).some(obj => obj.x === x && obj.y === y);

    this.navigation.removeBlocker(terrain.x, terrain.y, 'legacy-building');
    if (hasWall || hasBlockingObject) {
      this.navigation.addBlocker(terrain.x, terrain.y, 'legacy-building');
    }
    // Doors are deliberately passable; their open/close animation and edge
    // traversal rules are implemented by the edge-wall ticket.
  }

  /**
   * Place a wall on a tile
   */
  placeWall(x: number, y: number, _variant: WallVariant = 'straight'): BuildResult {
    const tile = this.getTerrainTileForBuild(x, y);
    if (!tile || !tile.buildable || this.hasBlockingElementAt(x, y)) {
      return { success: false, message: 'Cell not buildable', tilesAffected: [], cost: 0 };
    }
    this._wallTiles.add(`${x},${y}`);
    this._floorTiles.delete(`${x},${y}`);
    this._doorTiles.delete(`${x},${y}`);
    this.refreshTerrainOccupancyForBuildCell(x, y);
    this.refreshLegacyNavigationForBuildCell(x, y);
    this._dirty = true;
    return { success: true, message: 'Wall placed', tilesAffected: [{ x, y }], cost: COSTS.wall };
  }

  /**
   * Place a floor on a tile
   */
  placeFloor(x: number, y: number, _variant: FloorVariant = 'stone'): BuildResult {
    const tile = this.getTerrainTileForBuild(x, y);
    if (!tile) {
      return { success: false, message: 'Out of bounds', tilesAffected: [], cost: 0 };
    }
    if (!tile.buildable || this._wallTiles.has(`${x},${y}`) || this._doorTiles.has(`${x},${y}`)) {
      return { success: false, message: 'Cell occupied', tilesAffected: [], cost: 0 };
    }
    this._floorTiles.add(`${x},${y}`);
    this._dirty = true;
    return { success: true, message: 'Floor placed', tilesAffected: [{ x, y }], cost: COSTS.floor };
  }

  /**
   * Place a door on a tile (requires adjacent walls)
   */
  placeDoor(x: number, y: number): BuildResult {
    const tile = this.getTerrainTileForBuild(x, y);
    if (!tile || !tile.buildable || this.hasBlockingElementAt(x, y)) {
      return { success: false, message: 'Cell not buildable', tilesAffected: [], cost: 0 };
    }
    const hasAdjacentWall =
      this._wallTiles.has(`${x + 1},${y}`) || this._wallTiles.has(`${x - 1},${y}`) ||
      this._wallTiles.has(`${x},${y + 1}`) || this._wallTiles.has(`${x},${y - 1}`);
    if (!hasAdjacentWall) {
      return { success: false, message: 'Door requires adjacent wall', tilesAffected: [], cost: 0 };
    }
    this._doorTiles.add(`${x},${y}`);
    this._wallTiles.delete(`${x},${y}`);
    this.refreshTerrainOccupancyForBuildCell(x, y);
    this.refreshLegacyNavigationForBuildCell(x, y);
    this._dirty = true;
    return { success: true, message: 'Door placed', tilesAffected: [{ x, y }], cost: COSTS.door };
  }

  /**
   * Place an object on a tile
   */
  placeObject(x: number, y: number, objectId: string, rotation: number = 0): BuildResult {
    const tile = this.getTerrainTileForBuild(x, y);
    if (!tile || !tile.buildable || this.hasBlockingElementAt(x, y)) {
      return { success: false, message: 'Cell not buildable', tilesAffected: [], cost: 0 };
    }
    const id = `obj_${this.nextObjectId++}`;
    const obj: PlacedObject = { id, objectId, x, y, rotation };
    this.objects.set(id, obj);
    this.refreshTerrainOccupancyForBuildCell(x, y);
    this.refreshLegacyNavigationForBuildCell(x, y);
    this._dirty = true;
    return { success: true, message: 'Object placed', tilesAffected: [{ x, y }], cost: COSTS.object };
  }

  /**
   * Demolish whatever is on a tile
   */
  demolish(x: number, y: number): BuildResult {
    const tile = this.getTerrainTileForBuild(x, y);
    if (!tile) {
      return { success: false, message: 'Out of bounds', tilesAffected: [], cost: 0 };
    }
    const key = `${x},${y}`;
    const hasBuiltElement =
      this._wallTiles.has(key) ||
      this._doorTiles.has(key) ||
      this._floorTiles.has(key) ||
      Array.from(this.objects.values()).some(obj => obj.x === x && obj.y === y);
    if (!hasBuiltElement) {
      return { success: false, message: 'Nothing to demolish', tilesAffected: [], cost: 0 };
    }

    for (const [id, obj] of this.objects) {
      if (obj.x === x && obj.y === y) this.objects.delete(id);
    }

    this._wallTiles.delete(key);
    this._doorTiles.delete(key);
    this._floorTiles.delete(key);
    this.refreshTerrainOccupancyForBuildCell(x, y);
    this.refreshLegacyNavigationForBuildCell(x, y);
    this._dirty = true;

    // Legacy 1:1 grids used building cells as room tiles. Fine construction grids
    // keep room zoning on the coarse terrain map, so demolition must not erase it.
    if (this.constructionSubdivisions === 1 && tile.roomId !== null) {
      const room = this.rooms.get(tile.roomId);
      if (!room?.roomDefinitionId) {
        this.map.setRoomId(x, y, null);
        this.refreshRoom(tile.roomId);
      }
    }

    return { success: true, message: 'Demolished', tilesAffected: [{ x, y }], cost: 1 };
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
        } else { failed++; }
      }
    } else if (dy !== 0) {
      for (let y = startY; y !== endY + dy; y += dy) {
        const result = this.placeWall(startX, y);
        if (result.success) {
          tiles.push({ x: startX, y });
          totalCost += result.cost;
        } else { failed++; }
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

    const tiles: { x: number; y: number }[] = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.map.getTile(x, y);
        if (!tile || !tile.buildable) continue;
        tiles.push({ x, y });
      }
    }

    if (tiles.length === 0) return null;

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
    const filledSet = new Set(filled.map(f => `${f.x},${f.y}`));
    let enclosed = false;
    for (const { x, y } of filled) {
      const neighbors = [
        { x: x + 1, y }, { x: x - 1, y },
        { x, y: y + 1 }, { x, y: y - 1 },
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

  /** Set of "x,y" strings for wall tiles. */
  get wallTiles(): Set<string> { return this._wallTiles; }

  /** Set of "x,y" strings for door tiles. */
  get doorTiles(): Set<string> { return this._doorTiles; }

  /** Edge-based Alpha walls. */
  get wallEdges(): ConstructionEdge[] { return Array.from(this._wallEdges.values()); }

  /** Edge-based Alpha doors. */
  get doorEdges(): ConstructionEdge[] { return Array.from(this._doorEdges.values()); }

  /** Set of "x,y" strings for floor tiles. */
  get floorTiles(): Set<string> { return this._floorTiles; }

  /** True when building state has changed since last sync. */
  get isDirty(): boolean { return this._dirty; }

  /** Clear the dirty flag after rendering sync. */
  clearDirty(): void { this._dirty = false; }

  getSnapshot(): BuildingSnapshot {
    return {
      objects: this.getAllObjects().map(obj => ({ ...obj })),
      rooms: this.getAllRooms().map(room => ({
        ...room,
        tiles: room.tiles.map(tile => ({ ...tile })),
      })),
      wallTiles: [...this._wallTiles],
      doorTiles: [...this._doorTiles],
      wallEdges: this.wallEdges.map(edge => ({ ...edge })),
      doorEdges: this.doorEdges.map(edge => ({ ...edge })),
      floorTiles: [...this._floorTiles],
      nextRoomId: this.nextRoomId,
      nextObjectId: this.nextObjectId,
    };
  }

  restoreSnapshot(snapshot: BuildingSnapshot | undefined): void {
    this.objects.clear();
    this.rooms.clear();
    this.navigation?.clearDynamicBlockers();
    this._wallTiles.clear();
    this._doorTiles.clear();
    this._wallEdges.clear();
    this._doorEdges.clear();
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
        tiles: room.tiles.map(tile => ({ ...tile })),
      });
    }
    for (const tile of snapshot.wallTiles ?? []) this._wallTiles.add(tile);
    for (const tile of snapshot.doorTiles ?? []) this._doorTiles.add(tile);
    for (const edge of snapshot.wallEdges ?? []) {
      this._wallEdges.set(this.edgeKey(edge.x, edge.y, edge.orientation), { ...edge });
      this.navigation?.addConstructionEdge(
        edge.x,
        edge.y,
        edge.orientation,
        this.constructionSubdivisions,
        this.edgeNavigationSource(edge.x, edge.y, edge.orientation),
      );
    }
    for (const edge of snapshot.doorEdges ?? []) this._doorEdges.set(this.edgeKey(edge.x, edge.y, edge.orientation), { ...edge });
    for (const tile of snapshot.floorTiles ?? []) this._floorTiles.add(tile);

    if (this.constructionSubdivisions > 1) {
      for (const tile of this.map.getAllTiles()) tile.occupied = false;
      for (const key of [...this._wallTiles, ...this._doorTiles]) {
        const [x, y] = key.split(',').map(Number);
        this.refreshTerrainOccupancyForBuildCell(x, y);
      }
      for (const obj of this.objects.values()) this.refreshTerrainOccupancyForBuildCell(obj.x, obj.y);
    }

    if (this.navigation && this.constructionSubdivisions === 1) {
      for (const key of this._wallTiles) {
        const [x, y] = key.split(',').map(Number);
        this.refreshLegacyNavigationForBuildCell(x, y);
      }
      for (const obj of this.objects.values()) {
        this.refreshLegacyNavigationForBuildCell(obj.x, obj.y);
      }
    }

    this.nextRoomId = snapshot.nextRoomId ?? 1;
    this.nextObjectId = snapshot.nextObjectId ?? 1;
    this._dirty = true;
  }

  /**
   * Refresh a room after tile changes (re-check enclosure)
   */
  private refreshRoom(roomId: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Check if any tiles still belong to this room
    const remaining = room.tiles.filter(t => {
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