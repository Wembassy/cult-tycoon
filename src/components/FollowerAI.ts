import type { Component } from '../ecs/Component';
import type { QualityTier } from './CultistTier';

export type AIState =
  | 'idle'
  | 'moving'
  | 'working'
  | 'stuck'
  | 'needs'
  | 'done'
  | 'sleeping';

export class FollowerAI implements Component {
  constructor(public readonly entity: number) {}
  state: AIState = 'idle';
  path: { x: number; y: number }[] = [];
  pathIndex = 0;
  stateTimer = 0;  // time in current state
  tier: QualityTier = 'very_poor';
  /** Entity ID of the room the cultist currently occupies (-1 = none). */
  roomEntityId: number = -1;
  /** Need currently being satisfied at a facility. */
  needTarget: 'hunger' | 'faith' | 'fun' | 'sanity' | 'energy' | 'bladder' | 'hygiene' | null = null;
  /** Walkable tile adjacent to the selected need facility. */
  needTargetTile: { x: number; y: number } | null = null;
}