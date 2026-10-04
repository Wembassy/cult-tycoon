import { describe, it, expect, beforeEach } from 'vitest';
import { TileMap } from '@world/TileMap';
import { BuildingSystem } from '@systems/BuildingSystem';

describe('BuildingSystem — Wall Placement', () => {
  let map: TileMap;
  let bs: BuildingSystem;

  beforeEach(() => {
    map = new TileMap(16, 16);
    bs = new BuildingSystem(map);
  });

  it('should place a wall on buildable tile', () => {
    const result = bs.placeWall(5, 5);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(5);
    expect(map.isOccupied(5, 5)).toBe(true);
  });

  it('should not place wall on occupied tile', () => {
    bs.placeWall(5, 5);
    const result = bs.placeWall(5, 5);
    expect(result.success).toBe(false);
  });

  it('should not place wall on water', () => {
    map.setTerrain(5, 5, 'water');
    const result = bs.placeWall(5, 5);
    expect(result.success).toBe(false);
  });

  it('should place wall line horizontally', () => {
    const result = bs.placeWallLine(0, 5, 4, 5);
    expect(result.success).toBe(true);
    expect(result.tilesAffected).toHaveLength(5);
    expect(result.cost).toBe(25);
  });

  it('should place wall line vertically', () => {
    const result = bs.placeWallLine(5, 0, 5, 4);
    expect(result.success).toBe(true);
    expect(result.tilesAffected).toHaveLength(5);
  });
});

describe('BuildingSystem — Floor Placement', () => {
  let map: TileMap;
  let bs: BuildingSystem;

  beforeEach(() => {
    map = new TileMap(16, 16);
    bs = new BuildingSystem(map);
  });

  it('should place a floor tile', () => {
    const result = bs.placeFloor(3, 3);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(2);
  });

  it('should place floor area (drag fill)', () => {
    const result = bs.placeFloorArea(2, 2, 5, 5);
    expect(result.success).toBe(true);
    expect(result.tilesAffected).toHaveLength(16);
    expect(result.cost).toBe(32);
  });

  it('should not place floor on occupied tile', () => {
    bs.placeWall(3, 3);
    const result = bs.placeFloor(3, 3);
    expect(result.success).toBe(false);
  });
});

describe('BuildingSystem — Door Placement', () => {
  let map: TileMap;
  let bs: BuildingSystem;

  beforeEach(() => {
    map = new TileMap(16, 16);
    bs = new BuildingSystem(map);
  });

  it('should place door next to wall', () => {
    bs.placeWall(4, 5);
    const result = bs.placeDoor(5, 5);
    expect(result.success).toBe(true);
    expect(result.cost).toBe(10);
  });

  it('should not place door without adjacent wall', () => {
    const result = bs.placeDoor(5, 5);
    expect(result.success).toBe(false);
    expect(result.message).toContain('adjacent wall');
  });
});

describe('BuildingSystem — Object Placement', () => {
  let map: TileMap;
  let bs: BuildingSystem;

  beforeEach(() => {
    map = new TileMap(16, 16);
    bs = new BuildingSystem(map);
  });

  it('should place an object', () => {
    const result = bs.placeObject(3, 3, 'bed');
    expect(result.success).toBe(true);
    expect(map.isOccupied(3, 3)).toBe(true);
    expect(bs.getAllObjects()).toHaveLength(1);
  });

  it('should not place object on occupied tile', () => {
    bs.placeWall(3, 3);
    const result = bs.placeObject(3, 3, 'bed');
    expect(result.success).toBe(false);
  });
});

describe('BuildingSystem — Demolish', () => {
  let map: TileMap;
  let bs: BuildingSystem;

  beforeEach(() => {
    map = new TileMap(16, 16);
    bs = new BuildingSystem(map);
  });

  it('should demolish a wall', () => {
    bs.placeWall(5, 5);
    expect(map.isOccupied(5, 5)).toBe(true);
    const result = bs.demolish(5, 5);
    expect(result.success).toBe(true);
    expect(map.isOccupied(5, 5)).toBe(false);
  });

  it('should demolish an object', () => {
    bs.placeObject(3, 3, 'bed');
    const result = bs.demolish(3, 3);
    expect(result.success).toBe(true);
    expect(bs.getAllObjects()).toHaveLength(0);
  });

  it('should not demolish empty tile', () => {
    const result = bs.demolish(5, 5);
    expect(result.success).toBe(false);
  });
});

describe('BuildingSystem — Room Detection', () => {
  let map: TileMap;
  let bs: BuildingSystem;

  beforeEach(() => {
    map = new TileMap(16, 16);
    bs = new BuildingSystem(map);
  });

  it('should detect an enclosed room', () => {
    // Build a 3x3 room with walls around it
    // Walls: (2,2) to (6,2), (2,6) to (6,6), (2,2) to (2,6), (6,2) to (6,6)
    bs.placeWallLine(2, 2, 6, 2); // top wall
    bs.placeWallLine(2, 6, 6, 6); // bottom wall
    bs.placeWallLine(2, 2, 2, 6); // left wall
    bs.placeWallLine(6, 2, 6, 6); // right wall

    const room = bs.detectRoom(4, 4);
    expect(room).not.toBeNull();
    expect(room!.area).toBeGreaterThanOrEqual(4);
  });

  it('should not detect room in open area', () => {
    const room = bs.detectRoom(5, 5);
    // Open area without walls — should not be enclosed
    // Actually with 16x16 all grass, flood fill reaches edges
    // The check is whether boundary has occupied tiles
    expect(room).toBeNull();
  });

  it('should assign room type', () => {
    // Build enclosed room
    bs.placeWallLine(2, 2, 6, 2);
    bs.placeWallLine(2, 6, 6, 6);
    bs.placeWallLine(2, 2, 2, 6);
    bs.placeWallLine(6, 2, 6, 6);

    const room = bs.detectRoom(4, 4);
    expect(room).not.toBeNull();
    const success = bs.setRoomType(room!.id, 'bedroom');
    expect(success).toBe(true);
    expect(bs.getRoom(room!.id)!.type).toBe('bedroom');
  });

  it('should list all rooms', () => {
    // Build two rooms
    bs.placeWallLine(1, 1, 4, 1);
    bs.placeWallLine(1, 4, 4, 4);
    bs.placeWallLine(1, 1, 1, 4);
    bs.placeWallLine(4, 1, 4, 4);
    bs.detectRoom(2, 2);

    bs.placeWallLine(8, 1, 11, 1);
    bs.placeWallLine(8, 4, 11, 4);
    bs.placeWallLine(8, 1, 8, 4);
    bs.placeWallLine(11, 1, 11, 4);
    bs.detectRoom(9, 2);

    expect(bs.getAllRooms()).toHaveLength(2);
  });
});

describe('BuildingSystem — Room Designation', () => {
  let map: TileMap;
  let bs: BuildingSystem;

  beforeEach(() => {
    map = new TileMap(16, 16);
    bs = new BuildingSystem(map);
  });

  it('should designate a rectangular room without requiring walls', () => {
    const room = bs.designateRoomArea(2, 2, 4, 4, 'bedroom', 'dormitory');

    expect(room).not.toBeNull();
    expect(room!.area).toBe(9);
    expect(room!.roomDefinitionId).toBe('dormitory');
    expect(room!.type).toBe('bedroom');
    expect(map.getTile(3, 3)?.roomId).toBe(room!.id);
  });

  it('should replace overlapping designation tiles with the new room', () => {
    const first = bs.designateRoomArea(2, 2, 4, 4, 'bedroom', 'dormitory')!;
    const second = bs.designateRoomArea(3, 3, 5, 5, 'kitchen', 'kitchen')!;

    expect(map.getTile(3, 3)?.roomId).toBe(second.id);
    expect(bs.getRoom(first.id)?.area).toBe(5);
    expect(bs.getRoom(second.id)?.area).toBe(9);
  });

  it('should demolish floor tiles even though floors are not occupied', () => {
    expect(bs.placeFloor(3, 3).success).toBe(true);
    expect(bs.floorTiles.has('3,3')).toBe(true);
    expect(map.isOccupied(3, 3)).toBe(false);

    const result = bs.demolish(3, 3);

    expect(result.success).toBe(true);
    expect(bs.floorTiles.has('3,3')).toBe(false);
  });

  it('should preserve a designated room when furniture is demolished', () => {
    const room = bs.designateRoomArea(2, 2, 4, 4, 'bedroom', 'dormitory')!;
    bs.placeObject(3, 3, 'bed');

    expect(bs.demolish(3, 3).success).toBe(true);
    expect(map.getTile(3, 3)?.roomId).toBe(room.id);
    expect(bs.getRoom(room.id)?.area).toBe(9);
  });

  it('should clear room designations without demolishing furniture', () => {
    const room = bs.designateRoomArea(2, 2, 4, 4, 'bedroom', 'dormitory')!;
    bs.placeObject(3, 3, 'bed');

    const cleared = bs.clearRoomArea(2, 2, 3, 3);

    expect(cleared).toBe(4);
    expect(map.getTile(3, 3)?.roomId).toBeNull();
    expect(map.isOccupied(3, 3)).toBe(true);
    expect(bs.getAllObjects()).toHaveLength(1);
    expect(bs.getRoom(room.id)?.area).toBe(5);
  });

  it('should persist room definition IDs in building snapshots', () => {
    const room = bs.designateRoomArea(2, 2, 4, 4, 'bedroom', 'dormitory')!;
    const snapshot = bs.getSnapshot();

    const restoredMap = new TileMap(16, 16);
    for (const tile of room.tiles) restoredMap.setRoomId(tile.x, tile.y, room.id);
    const restored = new BuildingSystem(restoredMap);
    restored.restoreSnapshot(snapshot);

    expect(restored.getRoom(room.id)?.roomDefinitionId).toBe('dormitory');
    expect(restored.getRoom(room.id)?.area).toBe(9);
  });
});


describe('BuildingSystem — Edge Architecture', () => {
  it('stores walls on edges without occupying their adjacent floor cell', () => {
    const map = new TileMap(8, 8);
    const bs = new BuildingSystem(map, 10);

    const result = bs.placeWallEdge(20, 30, 'horizontal');

    expect(result.success).toBe(true);
    expect(bs.hasWallEdge(20, 30, 'horizontal')).toBe(true);
    expect(bs.floorTiles.has('20,30')).toBe(false);
    expect(map.getTile(2, 3)?.occupied).toBe(false);
  });

  it('replaces an existing wall edge with a door edge', () => {
    const map = new TileMap(8, 8);
    const bs = new BuildingSystem(map, 10);

    expect(bs.placeWallEdge(20, 30, 'vertical').success).toBe(true);
    expect(bs.placeDoorEdge(20, 30, 'vertical').success).toBe(true);

    expect(bs.hasWallEdge(20, 30, 'vertical')).toBe(false);
    expect(bs.hasDoorEdge(20, 30, 'vertical')).toBe(true);
  });

  it('does not place a door where no wall edge exists', () => {
    const map = new TileMap(8, 8);
    const bs = new BuildingSystem(map, 10);

    const result = bs.placeDoorEdge(20, 30, 'horizontal');

    expect(result.success).toBe(false);
    expect(bs.hasDoorEdge(20, 30, 'horizontal')).toBe(false);
  });

  it('round-trips edge architecture through snapshots', () => {
    const map = new TileMap(8, 8);
    const source = new BuildingSystem(map, 10);
    source.placeWallEdge(20, 30, 'horizontal');
    source.placeWallEdge(21, 30, 'horizontal');
    source.placeWallEdge(25, 30, 'vertical');
    source.placeDoorEdge(25, 30, 'vertical');

    const restored = new BuildingSystem(new TileMap(8, 8), 10);
    restored.restoreSnapshot(source.getSnapshot());

    expect(restored.hasWallEdge(20, 30, 'horizontal')).toBe(true);
    expect(restored.hasWallEdge(21, 30, 'horizontal')).toBe(true);
    expect(restored.hasDoorEdge(25, 30, 'vertical')).toBe(true);
  });
});


describe('BuildingSystem — Automatic Fine Rooms', () => {
  function encloseTwoByTwoRoom(bs: BuildingSystem): void {
    // Fine-grid rectangle from local-world boundary (1,1) to (3,3).
    for (let x = 10; x < 30; x++) {
      bs.placeWallEdge(x, 10, 'horizontal');
      bs.placeWallEdge(x, 30, 'horizontal');
    }
    for (let y = 10; y < 30; y++) {
      bs.placeWallEdge(10, y, 'vertical');
      bs.placeWallEdge(30, y, 'vertical');
    }
  }

  it('detects an enclosed fine-grid room and derives a coarse footprint', () => {
    const bs = new BuildingSystem(new TileMap(6, 6), 10);
    encloseTwoByTwoRoom(bs);

    const rooms = bs.getAllRooms();

    expect(rooms).toHaveLength(1);
    expect(rooms[0].source).toBe('automatic');
    expect(rooms[0].roofed).toBe(true);
    expect(rooms[0].area).toBeCloseTo(4, 5);
    expect(rooms[0].constructionCells).toHaveLength(400);
    expect(rooms[0].tiles.length).toBeGreaterThanOrEqual(4);
  });

  it('treats a door edge as a room boundary', () => {
    const bs = new BuildingSystem(new TileMap(6, 6), 10);
    encloseTwoByTwoRoom(bs);
    expect(bs.placeDoorEdge(20, 30, 'horizontal').success).toBe(true);

    const rooms = bs.getAllRooms();

    expect(rooms).toHaveLength(1);
    expect(rooms[0].roofed).toBe(true);
  });

  it('removes the automatic room when a wall opens to exterior', () => {
    const bs = new BuildingSystem(new TileMap(6, 6), 10);
    encloseTwoByTwoRoom(bs);
    expect(bs.getAllRooms()).toHaveLength(1);

    bs.demolishEdge(15, 10, 'horizontal');

    expect(bs.getAllRooms()).toHaveLength(0);
  });
});
