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
}