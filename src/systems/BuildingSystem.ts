/**
 * BuildingSystem — Wall placement, floor placement, door placement,
 * object placement, room detection, and demolition.
 */

import { TileMap } from '../world/TileMap';

export type BuildType = 'wall' | 'floor' | 'door' | 'object';
export type WallVariant = 'straight' | 'corner' | 'tjunction' | 'end';
export type FloorVariant = 'stone' | 'wood' | 'grass';
export type RoomType = 'dormitory' | 'mess_hall' | 'prayer_room' | 'research_room' | 'kitchen' | 'ritual_room' | 'storage' | 'generic';

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
  tiles: { x: number; y: number }[];
  area: number;
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

  constructor(map: TileMap) {
    this.map = map;
  }

  /**
   * Place a wall on a tile
   */
  placeWall(x: number, y: number, _variant: WallVariant = 'straight'): BuildResult {
    if (!this.map.isBuildable(x, y)) {
      return { success: false, message: 'Tile not buildable', tilesAffected: [], cost: 0 };
    }
    this.map.setOccupied(x, y, true);
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
    if (tile.occupied) {
      return { success: false, message: 'Tile occupied', tilesAffected: [], cost: 0 };
    }
    // Floor doesn't block the tile but marks it as having a floor
    return { success: true, message: 'Floor placed', tilesAffected: [{ x, y }], cost: COSTS.floor };
  }

  /**
   * Place a door on a tile (requires adjacent walls)
   */
  placeDoor(x: number, y: number): BuildResult {
    if (!this.map.isBuildable(x, y)) {
      return { success: false, message: 'Tile not buildable', tilesAffected: [], cost: 0 };
    }
    // Check for at least one adjacent wall
    const hasAdjacentWall = this.map.isOccupied(x + 1, y) || this.map.isOccupied(x - 1, y) ||
                            this.map.isOccupied(x, y + 1) || this.map.isOccupied(x, y - 1);
    if (!hasAdjacentWall) {
      return { success: false, message: 'Door requires adjacent wall', tilesAffected: [], cost: 0 };
    }
    this.map.setOccupied(x, y, true);
    return { success: true, message: 'Door placed', tilesAffected: [{ x, y }], cost: COSTS.door };
  }

  /**
   * Place an object on a tile
   */
  placeObject(x: number, y: number, objectId: string, rotation: number = 0): BuildResult {
    if (!this.map.isBuildable(x, y)) {
      return { success: false, message: 'Tile not buildable', tilesAffected: [], cost: 0 };
    }
    const id = `obj_${this.nextObjectId++}`;
    const obj: PlacedObject = { id, objectId, x, y, rotation };
    this.objects.set(id, obj);
    this.map.setOccupied(x, y, true);
    return { success: true, message: 'Object placed', tilesAffected: [{ x, y }], cost: COSTS.object };
  }

  /**
   * Demolish whatever is on a tile
   */
  demolish(x: number, y: number): BuildResult {
    const tile = this.map.getTile(x, y);
    if (!tile) {
      return { success: false, message: 'Out of bounds', tilesAffected: [], cost: 0 };
    }
    if (!tile.occupied) {
      return { success: false, message: 'Nothing to demolish', tilesAffected: [], cost: 0 };
    }

    // Remove any objects on this tile
    for (const [id, obj] of this.objects) {
      if (obj.x === x && obj.y === y) {
        this.objects.delete(id);
        break;
      }
    }

    this.map.setOccupied(x, y, false);

    // Clear room assignment if tile was part of a room
    if (tile.roomId !== null) {
      this.map.setRoomId(x, y, null);
      this.refreshRoom(tile.roomId);
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