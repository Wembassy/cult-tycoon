/**
 * RoomGraph — Room detection and graph system for the tile-based world.
 *
 * Uses flood-fill to detect enclosed areas (walls + doors create enclosure).
 * Tracks which tiles belong to which room, room properties (type, size),
 * and connectivity between rooms through doors.
 *
 * Results are cached and only recomputed when the dirty flag is set
 * via `invalidate()`.
 */

import { TileMap } from '../world/TileMap';

export type RoomType =
  | 'dormitory'
  | 'mess_hall'
  | 'prayer_room'
  | 'research_room'
  | 'kitchen'
  | 'ritual_room'
  | 'storage'
  | 'generic';

export interface RoomNode {
  id: number;
  type: RoomType;
  tiles: { x: number; y: number }[];
  area: number;
  /** IDs of rooms connected through doors */
  connectedRoomIds: number[];
}

/** Predicate to determine if a tile is walkable (floor, non-occupied) */
function isWalkable(tile: { occupied: boolean; buildable: boolean }): boolean {
  return !tile.occupied && tile.buildable;
}

export class RoomGraph {
  private map: TileMap;
  private rooms: Map<number, RoomNode> = new Map();
  private tileToRoom: Map<string, number> = new Map();
  private nextRoomId = 1;
  private dirty = true;

  /** Set of tile keys that are doors (passable for connectivity) */
  private doorSet: Set<string> = new Set();

  constructor(map: TileMap) {
    this.map = map;
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Mark the room graph as dirty. The next query will trigger a full recompute.
   * Call this whenever walls or doors are placed/demolished.
   */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * Register a door tile. Doors are passable for room connectivity
   * but still count as enclosure boundaries for flood-fill.
   * Call this when a door is placed; also call invalidate().
   */
  registerDoor(x: number, y: number): void {
    this.doorSet.add(`${x},${y}`);
    this.invalidate();
  }

  /**
   * Remove a door tile. Call when a door is demolished.
   * Also calls invalidate().
   */
  unregisterDoor(x: number, y: number): void {
    this.doorSet.delete(`${x},${y}`);
    this.invalidate();
  }

  /**
   * Get the room that a tile belongs to, or null if it's not part of a room.
   * Triggers recompute if dirty.
   */
  getRoomAt(x: number, y: number): RoomNode | null {
    this.ensureComputed();
    const roomId = this.tileToRoom.get(`${x},${y}`);
    if (roomId === undefined) return null;
    return this.rooms.get(roomId) ?? null;
  }

  /**
   * Get a room by its ID.
   * Triggers recompute if dirty.
   */
  getRoom(roomId: number): RoomNode | null {
    this.ensureComputed();
    return this.rooms.get(roomId) ?? null;
  }

  /**
   * Get all detected rooms.
   * Triggers recompute if dirty.
   */
  getAllRooms(): RoomNode[] {
    this.ensureComputed();
    return Array.from(this.rooms.values());
  }

  /**
   * Get all tiles belonging to a room.
   * Triggers recompute if dirty.
   */
  getRoomTiles(roomId: number): { x: number; y: number }[] {
    this.ensureComputed();
    const room = this.rooms.get(roomId);
    return room ? room.tiles : [];
  }

  /**
   * Set the type of a room (e.g., dormitory, mess_hall).
   * Does not require recompute — just updates the property.
   */
  setRoomType(roomId: number, type: RoomType): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.type = type;
    return true;
  }

  /**
   * Get the IDs of rooms connected to the given room through doors.
   * Triggers recompute if dirty.
   */
  getConnectedRooms(roomId: number): number[] {
    this.ensureComputed();
    const room = this.rooms.get(roomId);
    return room ? room.connectedRoomIds : [];
  }

  /**
   * Force a full recompute of all rooms. Called automatically on first query
   * after invalidate(), but can be called manually if needed.
   */
  recompute(): void {
    this.doRecompute();
    this.dirty = false;
  }

  // ─── Internal ─────────────────────────────────────────────────

  /** Recompute if dirty. */
  private ensureComputed(): void {
    if (this.dirty) {
      this.doRecompute();
      this.dirty = false;
    }
  }

  /**
   * Core recompute: scan the entire map, flood-fill enclosed areas,
   * build room nodes, and determine connectivity through doors.
   */
  private doRecompute(): void {
    this.rooms.clear();
    this.tileToRoom.clear();
    this.nextRoomId = 1;

    const visited = new Set<string>();
    const candidateRooms: { tiles: { x: number; y: number }[]; doors: { x: number; y: number }[] }[] = [];

    // Phase 1: Flood-fill from every walkable tile to find enclosed areas.
    // A "walkable" tile is one that is not occupied (not a wall/door/object).
    // We treat doors as boundaries for flood-fill (they separate rooms),
    // but we record them for connectivity analysis.
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        const tile = this.map.getTile(x, y);
        if (!tile || !isWalkable(tile)) continue;

        // Flood-fill this region
        const region = this.floodFillRoom(x, y, visited);

        // A region must be enclosed to be a room.
        // Enclosed = the region's boundary is formed by walls, doors,
        // or map edges with walls.
        if (this.isRegionEnclosed(region.tiles)) {
          candidateRooms.push(region);
        }
      }
    }

    // Phase 2: Assign room IDs and build RoomNode objects
    for (const candidate of candidateRooms) {
      const roomId = this.nextRoomId++;
      const tileCoords = candidate.tiles;
      for (const t of tileCoords) {
        this.tileToRoom.set(`${t.x},${t.y}`, roomId);
        // Also update the tile's roomId on the TileMap for compatibility
        this.map.setRoomId(t.x, t.y, roomId);
      }
      const roomNode: RoomNode = {
        id: roomId,
        type: 'generic',
        tiles: tileCoords,
        area: tileCoords.length,
        connectedRoomIds: [],
      };
      this.rooms.set(roomId, roomNode);
    }

    // Phase 3: Determine connectivity through doors.
    // For each door, check which rooms it connects.
    for (const candidate of candidateRooms) {
      for (const door of candidate.doors) {
        // Find rooms adjacent to this door
        const adjacentRoomIds = this.getRoomIdsAdjacentTo(door.x, door.y);
        // Connect all adjacent rooms to each other
        for (const rid of adjacentRoomIds) {
          const room = this.rooms.get(rid);
          if (!room) continue;
          for (const otherRid of adjacentRoomIds) {
            if (otherRid !== rid && !room.connectedRoomIds.includes(otherRid)) {
              room.connectedRoomIds.push(otherRid);
            }
          }
        }
      }
    }
  }

  /**
   * Flood-fill from a starting walkable tile, collecting all connected
   * walkable tiles. Also collects adjacent door tiles.
   * Stops at walls, doors, and map boundaries.
   */
  private floodFillRoom(
    startX: number,
    startY: number,
    globalVisited: Set<string>,
  ): { tiles: { x: number; y: number }[]; doors: { x: number; y: number }[] } {
    const tiles: { x: number; y: number }[] = [];
    const doors: { x: number; y: number }[] = [];
    const doorsSeen = new Set<string>();
    const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      const key = `${x},${y}`;
      if (globalVisited.has(key)) continue;
      globalVisited.add(key);

      const tile = this.map.getTile(x, y);
      if (!tile || !isWalkable(tile)) continue;

      tiles.push({ x, y });

      // Check 4 neighbors
      const neighbors = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];

      for (const n of neighbors) {
        const nKey = `${n.x},${n.y}`;
        const nTile = this.map.getTile(n.x, n.y);
        if (!nTile) continue; // map boundary

        if (isWalkable(nTile) && !globalVisited.has(nKey)) {
          queue.push(n);
        } else if (this.doorSet.has(nKey) && !doorsSeen.has(nKey)) {
          // This is a door — record it for connectivity
          doorsSeen.add(nKey);
          doors.push({ x: n.x, y: n.y });
        }
      }
    }

    return { tiles, doors };
  }

  /**
   * Check if a region of tiles is enclosed.
   * Enclosed means every boundary edge (neighbor not in region) is either:
   *   - An occupied tile (wall/door/object)
   *   - Unbuildable terrain (water)
   * Map edges do NOT count as enclosure — if a region touches the map
   * boundary without a wall, it is NOT enclosed.
   *
   * We require at least 4 tiles for a valid room.
   */
  private isRegionEnclosed(tiles: { x: number; y: number }[]): boolean {
    if (tiles.length < 4) return false;

    const tileSet = new Set(tiles.map(t => `${t.x},${t.y}`));

    for (const { x, y } of tiles) {
      const neighbors = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ];

      for (const n of neighbors) {
        const nKey = `${n.x},${n.y}`;
        if (tileSet.has(nKey)) continue; // interior tile

        // This is a boundary edge — check what's on the other side
        const nTile = this.map.getTile(n.x, n.y);
        if (!nTile) {
          // Map edge — NOT enclosure. The region is open.
          return false;
        } else if (nTile.occupied) {
          // Wall or door — counts as enclosure
          continue;
        } else if (!nTile.buildable) {
          // Unbuildable terrain (e.g., water) — counts as enclosure
          continue;
        } else {
          // There's an open walkable tile outside the region.
          // This means the region is not fully enclosed.
          return false;
        }
      }
    }

    // All boundary edges are walls/doors/unbuildable — fully enclosed
    return true;
  }

  /**
   * Get room IDs of all rooms that have a tile adjacent to (x, y),
   * traversing through chains of adjacent doors.
   * Used for door connectivity.
   */
  private getRoomIdsAdjacentTo(x: number, y: number): number[] {
    const roomIds = new Set<number>();
    const visitedDoors = new Set<string>();
    const doorQueue: { x: number; y: number }[] = [{ x, y }];

    while (doorQueue.length > 0) {
      const d = doorQueue.shift()!;
      const dKey = `${d.x},${d.y}`;
      if (visitedDoors.has(dKey)) continue;
      visitedDoors.add(dKey);

      const neighbors = [
        { x: d.x + 1, y: d.y },
        { x: d.x - 1, y: d.y },
        { x: d.x, y: d.y + 1 },
        { x: d.x, y: d.y - 1 },
      ];

      for (const n of neighbors) {
        const nKey = `${n.x},${n.y}`;
        const roomId = this.tileToRoom.get(nKey);
        if (roomId !== undefined) {
          roomIds.add(roomId);
        } else if (this.doorSet.has(nKey) && !visitedDoors.has(nKey)) {
          // Chain through adjacent doors
          doorQueue.push(n);
        }
      }
    }

    return Array.from(roomIds);
  }
}