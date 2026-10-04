import { describe, expect, it } from 'vitest';
import {
  ALPHA_SPATIAL_CONFIG,
  constructionCellCenterToWorld,
  constructionToTerrain,
  constructionToWorld,
  navigationToWorldCenter,
  worldToConstruction,
  worldToNavigation,
} from '@world/Spatial';

describe('Spatial coordinate conversions', () => {
  it('uses a 10x construction lattice for Alpha', () => {
    expect(ALPHA_SPATIAL_CONFIG.constructionSubdivisions).toBe(10);
  });

  it('converts Local World coordinates into fine Construction Space', () => {
    expect(worldToConstruction(2.34, 5.91)).toEqual({ x: 23, y: 59 });
    expect(constructionToTerrain(23, 59)).toEqual({ x: 2, y: 5 });
  });

  it('converts construction vertices and cell centers back to Local World Space', () => {
    expect(constructionToWorld(20, 50)).toEqual({ x: 2, z: 5 });
    expect(constructionCellCenterToWorld(20, 50)).toEqual({ x: 2.05, z: 5.05 });
  });

  it('uses an independently configured fine Navigation Space', () => {
    expect(ALPHA_SPATIAL_CONFIG.navigationSubdivisions).toBe(10);
    expect(worldToNavigation(2.34, 5.91)).toEqual({ x: 23, y: 59 });
    expect(navigationToWorldCenter(20, 50)).toEqual({ x: 2.05, z: 5.05 });
  });
});
