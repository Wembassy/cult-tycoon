/**
 * BuildingModels — Maps room types to 3D model configurations.
 * Used by RenderSystem/SceneManager to render building visuals.
 */

export interface BuildingModelConfig {
  roomType: string;
  floorMesh: string; // Synty asset name or geometry type
  wallMesh: string;
  doorMesh: string;
  color: number;
  scale: number;
}

// ─── Building Model Definitions ───────────────────────────────

export const BUILDING_MODELS: Record<string, BuildingModelConfig> = {
  lobby: {
    roomType: 'lobby',
    floorMesh: 'floor_wood',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x8a7a6a,
    scale: 1.0,
  },
  temple: {
    roomType: 'temple',
    floorMesh: 'floor_tile',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x6b4e8e,
    scale: 1.0,
  },
  kitchen: {
    roomType: 'kitchen',
    floorMesh: 'floor_tile',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x8a6a4a,
    scale: 1.0,
  },
  canteen: {
    roomType: 'canteen',
    floorMesh: 'floor_wood',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x7a6a5a,
    scale: 1.0,
  },
  bedroom: {
    roomType: 'bedroom',
    floorMesh: 'floor_wood',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x5a6a8a,
    scale: 1.0,
  },
  bathroom: {
    roomType: 'bathroom',
    floorMesh: 'floor_tile',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x4a8a8a,
    scale: 1.0,
  },
  research_office: {
    roomType: 'research_office',
    floorMesh: 'floor_tile',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x4a6a9a,
    scale: 1.0,
  },
  recreation_room: {
    roomType: 'recreation_room',
    floorMesh: 'floor_wood',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x8a5a5a,
    scale: 1.0,
  },
  generic: {
    roomType: 'generic',
    floorMesh: 'floor_stone',
    wallMesh: 'wall_straight',
    doorMesh: 'door',
    color: 0x8a8a7a,
    scale: 1.0,
  },
};

// ─── Work Station Configurations ──────────────────────────────

export interface WorkStationConfig {
  roomType: string;
  meshId: string;
  color: number;
  geometry: 'box' | 'cylinder' | 'sphere' | 'cone';
  dimensions: [number, number, number]; // width, height, depth (radius, height for cylinder/sphere)
  yOffset: number;
}

export const WORK_STATIONS: Record<string, WorkStationConfig> = {
  temple: {
    roomType: 'temple',
    meshId: 'altar',
    color: 0x6b4e8e,
    geometry: 'box',
    dimensions: [0.7, 0.5, 0.4],
    yOffset: 0.25,
  },
  kitchen: {
    roomType: 'kitchen',
    meshId: 'stove',
    color: 0x3a3a3a,
    geometry: 'box',
    dimensions: [0.6, 0.5, 0.5],
    yOffset: 0.25,
  },
  bedroom: {
    roomType: 'bedroom',
    meshId: 'bed',
    color: 0x8b6c5a,
    geometry: 'box',
    dimensions: [0.75, 0.35, 0.5],
    yOffset: 0.18,
  },
  bathroom: {
    roomType: 'bathroom',
    meshId: 'toilet',
    color: 0xdddddd,
    geometry: 'cylinder',
    dimensions: [0.2, 0.35, 0.2],
    yOffset: 0.18,
  },
  research_office: {
    roomType: 'research_office',
    meshId: 'desk',
    color: 0x6a5a3a,
    geometry: 'box',
    dimensions: [0.65, 0.45, 0.4],
    yOffset: 0.23,
  },
  recreation_room: {
    roomType: 'recreation_room',
    meshId: 'games',
    color: 0x4a8a6a,
    geometry: 'box',
    dimensions: [0.6, 0.4, 0.4],
    yOffset: 0.2,
  },
  canteen: {
    roomType: 'canteen',
    meshId: 'table',
    color: 0x7a5a3a,
    geometry: 'box',
    dimensions: [0.7, 0.35, 0.4],
    yOffset: 0.18,
  },
  lobby: {
    roomType: 'lobby',
    meshId: 'reception',
    color: 0x5a7a6a,
    geometry: 'box',
    dimensions: [0.6, 0.4, 0.3],
    yOffset: 0.2,
  },
};

// ─── Follower Tier Colors ─────────────────────────────────────

export const TIER_COLORS: Record<string, number> = {
  very_poor: 0x888888, // grey
  poor: 0x8b6914, // brown
  average: 0x4a7fc1, // blue
  good: 0x4caf50, // green
  very_good: 0x9c27b0, // purple
  incredible: 0xffd700, // gold
};

// ─── Helper Functions ─────────────────────────────────────────

export function getBuildingModel(roomType: string): BuildingModelConfig {
  return BUILDING_MODELS[roomType] ?? BUILDING_MODELS['generic'];
}

export function getWorkStation(roomType: string): WorkStationConfig | null {
  return WORK_STATIONS[roomType] ?? null;
}