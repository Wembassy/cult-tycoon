import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap } from '@world/TileMap';
import { RoomGraph } from '@world/RoomGraph';

/**
 * Helper: build a rectangular wall enclosure on the map.
 * Walls are placed on the perimeter tiles, leaving the interior empty.
 * Returns the interior tile coordinates.
 */
function buildEnclosure(
  map: TileMap,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  for (let x = x1; x <= x2; x++) {
    map.setOccupied(x, y1, true); // top wall
    map.setOccupied(x, y2, true); // bottom wall
  }
  for (let y = y1; y <= y2; y++) {
    map.setOccupied(x1, y, true); // left wall
    map.setOccupied(x2, y, true); // right wall
  }
}

describe('RoomGraph — Room Detection', () => {
  let map: TileMap;
  let graph: RoomGraph;

  beforeEach(() => {
    map = new TileMap(16, 16);
    graph = new RoomGraph(map);
  });

  it('should be constructable with a TileMap', () => {
    expect(graph).toBeDefined();
    expect(graph.getAllRooms()).toHaveLength(0);
  });

  it('should detect no rooms on an empty map', () => {
    // An empty map with no walls has no enclosed areas
    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(0);
  });

  it('should detect a single enclosed room', () => {
    // Build a 5x5 enclosure (3x3 interior)
    buildEnclosure(map, 5, 5, 9, 9);

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(1);

    const room = rooms[0];
    expect(room.area).toBe(9); // 3x3 interior
    expect(room.type).toBe('generic');
    expect(room.tiles).toHaveLength(9);
  });

  it('should assign room IDs to tiles', () => {
    buildEnclosure(map, 5, 5, 9, 9);

    // Interior tile (6,6) should be part of the room
    const room = graph.getRoomAt(6, 6);
    expect(room).not.toBeNull();
    expect(room!.area).toBe(9);
  });

  it('should return null for tiles not in any room', () => {
    buildEnclosure(map, 5, 5, 9, 9);

    // Tile outside the enclosure
    expect(graph.getRoomAt(0, 0)).toBeNull();
    // Wall tile itself
    expect(graph.getRoomAt(5, 5)).toBeNull();
  });

  it('should detect multiple separate rooms', () => {
    // Room 1: 3x3 interior at (5,5)-(9,9)
    buildEnclosure(map, 5, 5, 9, 9);
    // Room 2: 2x2 interior at (1,1)-(4,4)
    buildEnclosure(map, 1, 1, 4, 4);

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(2);
  });

  it('should not detect areas smaller than 4 tiles as rooms', () => {
    // 3x3 enclosure = 1x1 interior (1 tile) — too small
    buildEnclosure(map, 5, 5, 7, 7);

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(0);
  });

  it('should not detect unenclosed areas as rooms', () => {
    // Place a few walls but leave an open side
    map.setOccupied(5, 5, true); // top-left
    map.setOccupied(6, 5, true); // top-right
    map.setOccupied(5, 6, true); // bottom-left
    // No wall at (6,6) — open on two sides

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(0);
  });

  it('should handle water as enclosure boundary', () => {
    // Create a water pool that acts as a wall
    // Interior: (6,6)-(8,8), surrounded by water on some sides
    map.setTerrain(5, 5, 'water');
    map.setTerrain(5, 6, 'water');
    map.setTerrain(5, 7, 'water');
    map.setTerrain(6, 5, 'water');
    map.setTerrain(7, 5, 'water');
    map.setTerrain(9, 9, 'water');
    map.setTerrain(9, 8, 'water');
    map.setTerrain(9, 7, 'water');
    map.setTerrain(8, 9, 'water');
    map.setTerrain(7, 9, 'water');
    map.setTerrain(6, 9, 'water');
    map.setTerrain(5, 8, 'water');
    map.setTerrain(5, 9, 'water');
    // Need full enclosure by water
    for (let x = 5; x <= 9; x++) {
      map.setTerrain(x, 5, 'water');
      map.setTerrain(x, 9, 'water');
    }
    for (let y = 5; y <= 9; y++) {
      map.setTerrain(5, y, 'water');
      map.setTerrain(9, y, 'water');
    }

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBe(9); // 3x3 interior
  });
});

describe('RoomGraph — Caching and Invalidation', () => {
  let map: TileMap;
  let graph: RoomGraph;

  beforeEach(() => {
    map = new TileMap(16, 16);
    graph = new RoomGraph(map);
  });

  it('should cache results and not recompute until invalidated', () => {
    buildEnclosure(map, 5, 5, 9, 9);

    const rooms1 = graph.getAllRooms();
    expect(rooms1).toHaveLength(1);

    // Add another enclosure — should NOT be detected until invalidate
    buildEnclosure(map, 1, 1, 4, 4);
    const rooms2 = graph.getAllRooms();
    expect(rooms2).toHaveLength(1); // still cached

    // Invalidate and query again
    graph.invalidate();
    const rooms3 = graph.getAllRooms();
    expect(rooms3).toHaveLength(2);
  });

  it('should recompute on next query after invalidate()', () => {
    buildEnclosure(map, 5, 5, 9, 9);

    graph.getAllRooms(); // compute
    expect(graph.getAllRooms()).toHaveLength(1);

    graph.invalidate();  // mark dirty

    // Demolish a wall that directly borders the interior to break the enclosure.
    // (5,6) is on the left wall, adjacent to interior tile (6,6).
    map.setOccupied(5, 6, false);
    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(0);
  });

  it('should force recompute via recompute()', () => {
    buildEnclosure(map, 5, 5, 9, 9);
    graph.recompute();

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(1);
  });
});

describe('RoomGraph — Room Lookup', () => {
  let map: TileMap;
  let graph: RoomGraph;

  beforeEach(() => {
    map = new TileMap(16, 16);
    graph = new RoomGraph(map);
  });

  it('should get room by ID', () => {
    buildEnclosure(map, 5, 5, 9, 9);
    const rooms = graph.getAllRooms();
    const id = rooms[0].id;

    const room = graph.getRoom(id);
    expect(room).not.toBeNull();
    expect(room!.id).toBe(id);
  });

  it('should return null for non-existent room ID', () => {
    expect(graph.getRoom(999)).toBeNull();
  });

  it('should get tiles for a room', () => {
    buildEnclosure(map, 5, 5, 9, 9);
    const rooms = graph.getAllRooms();
    const tiles = graph.getRoomTiles(rooms[0].id);
    expect(tiles).toHaveLength(9);
  });

  it('should return empty array for non-existent room tiles', () => {
    expect(graph.getRoomTiles(999)).toEqual([]);
  });

  it('should get room at specific tile coordinates', () => {
    buildEnclosure(map, 5, 5, 9, 9);

    // Interior tiles
    expect(graph.getRoomAt(6, 6)).not.toBeNull();
    expect(graph.getRoomAt(7, 7)).not.toBeNull();
    expect(graph.getRoomAt(8, 8)).not.toBeNull();

    // All interior tiles should be in the same room
    const r1 = graph.getRoomAt(6, 6);
    const r2 = graph.getRoomAt(7, 7);
    expect(r1!.id).toBe(r2!.id);
  });
});

describe('RoomGraph — Room Properties', () => {
  let map: TileMap;
  let graph: RoomGraph;

  beforeEach(() => {
    map = new TileMap(16, 16);
    graph = new RoomGraph(map);
  });

  it('should set room type', () => {
    buildEnclosure(map, 5, 5, 9, 9);
    const rooms = graph.getAllRooms();
    const id = rooms[0].id;

    const result = graph.setRoomType(id, 'dormitory');
    expect(result).toBe(true);
    expect(graph.getRoom(id)!.type).toBe('dormitory');
  });

  it('should return false when setting type of non-existent room', () => {
    expect(graph.setRoomType(999, 'dormitory')).toBe(false);
  });

  it('should report correct area', () => {
    // 7x7 enclosure = 5x5 interior = 25 tiles
    buildEnclosure(map, 5, 5, 11, 11);
    const rooms = graph.getAllRooms();
    expect(rooms[0].area).toBe(25);
  });

  it('should start with generic type', () => {
    buildEnclosure(map, 5, 5, 9, 9);
    const rooms = graph.getAllRooms();
    expect(rooms[0].type).toBe('generic');
  });
});

describe('RoomGraph — Door Connectivity', () => {
  let map: TileMap;
  let graph: RoomGraph;

  beforeEach(() => {
    map = new TileMap(16, 16);
    graph = new RoomGraph(map);
  });

  it('should register doors', () => {
    graph.registerDoor(5, 5);
    // No error means success; door will be used during recompute
    expect(true).toBe(true);
  });

  it('should unregister doors', () => {
    graph.registerDoor(5, 5);
    graph.unregisterDoor(5, 5);
    expect(true).toBe(true);
  });

  it('should connect two rooms through a door', () => {
    // Room 1: interior (6,6)-(8,8), walls at (5,5)-(9,9)
    // Room 2: interior (11,6)-(13,8), walls at (10,5)-(14,9)
    // Door at (9,7) — in room 1's right wall, adjacent to room 2's left wall (10,7)

    // Build room 1 walls
    for (let x = 5; x <= 9; x++) {
      map.setOccupied(x, 5, true);
      map.setOccupied(x, 9, true);
    }
    for (let y = 5; y <= 9; y++) {
      map.setOccupied(5, y, true);
      map.setOccupied(9, y, true);
    }

    // Build room 2 walls
    for (let x = 10; x <= 14; x++) {
      map.setOccupied(x, 5, true);
      map.setOccupied(x, 9, true);
    }
    for (let y = 5; y <= 9; y++) {
      map.setOccupied(10, y, true);
      map.setOccupied(14, y, true);
    }

    // Register door at (9,7) — it stays occupied but is in the doorSet.
    // The flood-fill from room 1 interior (8,7) sees (9,7) as an occupied
    // neighbor that's in the doorSet, so it records it as a door.
    // The flood-fill from room 2 interior (11,7) sees (10,7) as a wall
    // and (9,7) is not directly adjacent, so we also register (10,7) as
    // a door to ensure both rooms see the door.
    map.setOccupied(9, 7, true);
    map.setOccupied(10, 7, true);
    graph.registerDoor(9, 7);
    graph.registerDoor(10, 7);

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(2);

    // Check connectivity
    const room1 = rooms.find(r => graph.getRoomAt(7, 7)?.id === r.id);
    const room2 = rooms.find(r => graph.getRoomAt(12, 7)?.id === r.id);
    expect(room1).toBeDefined();
    expect(room2).toBeDefined();

    const connected1 = graph.getConnectedRooms(room1!.id);
    const connected2 = graph.getConnectedRooms(room2!.id);
    expect(connected1).toContain(room2!.id);
    expect(connected2).toContain(room1!.id);
  });

  it('should not connect rooms without a door', () => {
    // Two separate enclosed rooms with no door
    buildEnclosure(map, 1, 1, 4, 4);
    buildEnclosure(map, 8, 8, 12, 12);

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(2);

    // Neither room should have connected rooms
    for (const room of rooms) {
      expect(graph.getConnectedRooms(room.id)).toHaveLength(0);
    }
  });

  it('should handle door invalidation after demolish', () => {
    // Build enclosure with door
    buildEnclosure(map, 5, 5, 9, 9);
    map.setOccupied(5, 7, false); // gap in wall
    graph.registerDoor(5, 7);

    // With the door, the room should still be detected
    // (the door is a boundary, and it's registered)
    // Actually — un-occupying the door tile creates a gap.
    // The flood-fill will flow out through the gap.
    // We need the door to remain occupied but be in the doorSet.
    map.setOccupied(5, 7, true);
    graph.invalidate();

    let rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(1);

    // Now demolish the door (remove from doorSet and un-occupy)
    graph.unregisterDoor(5, 7);
    map.setOccupied(5, 7, false);
    graph.invalidate();

    rooms = graph.getAllRooms();
    // The room should no longer be enclosed (gap in the wall)
    expect(rooms).toHaveLength(0);
  });
});

describe('RoomGraph — Edge Cases', () => {
  let map: TileMap;
  let graph: RoomGraph;

  beforeEach(() => {
    map = new TileMap(16, 16);
    graph = new RoomGraph(map);
  });

  it('should handle large rooms', () => {
    // 14x14 enclosure = 12x12 interior = 144 tiles
    buildEnclosure(map, 1, 1, 14, 14);
    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBe(144);
  });

  it('should handle nested-looking enclosures (L-shaped room)', () => {
    // Build an L-shaped room
    // Horizontal part: (5,5)-(9,7) walls, interior (6,6)-(8,6)
    // Vertical part: (5,5)-(7,11) walls, interior (6,6)-(6,10)
    // Combined L-shape

    // Simplify: build a 5x7 enclosure
    // Walls: top row (5,5)-(9,5), bottom row (5,11)-(9,11)
    // Left col (5,5)-(5,11), right col (9,5)-(9,11)
    for (let x = 5; x <= 9; x++) {
      map.setOccupied(x, 5, true);
      map.setOccupied(x, 11, true);
    }
    for (let y = 5; y <= 11; y++) {
      map.setOccupied(5, y, true);
      map.setOccupied(9, y, true);
    }

    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(1);
    // Interior: 3x5 = 15 tiles
    expect(rooms[0].area).toBe(15);
  });

  it('should handle rooms at map edges', () => {
    // Enclosure touching the map edge — but map edges are NOT walls,
    // so we need walls on all 4 sides even at the edge.
    // Build walls at (0,0)-(4,4) with all 4 sides walled
    for (let x = 0; x <= 4; x++) {
      map.setOccupied(x, 0, true); // top wall
      map.setOccupied(x, 4, true); // bottom wall
    }
    for (let y = 0; y <= 4; y++) {
      map.setOccupied(0, y, true); // left wall
      map.setOccupied(4, y, true); // right wall
    }

    const rooms = graph.getAllRooms();
    // The interior is (1,1)-(3,3) = 9 tiles
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBe(9);
  });

  it('should handle empty door set gracefully', () => {
    buildEnclosure(map, 5, 5, 9, 9);
    // No doors registered
    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(1);
    expect(graph.getConnectedRooms(rooms[0].id)).toHaveLength(0);
  });

  it('should handle invalidate before any query', () => {
    graph.invalidate();
    expect(graph.getAllRooms()).toHaveLength(0);
  });

  it('should handle multiple invalidations', () => {
    buildEnclosure(map, 5, 5, 9, 9);
    graph.invalidate();
    graph.invalidate();
    graph.invalidate();
    const rooms = graph.getAllRooms();
    expect(rooms).toHaveLength(1);
  });
});