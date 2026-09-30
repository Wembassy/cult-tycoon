import type { Component } from '../ecs/Component';

export type AIState =
  | 'idle'
  | 'moving'
  | 'working'
  | 'stuck'
  | 'needs'
  | 'done';

export class FollowerAI implements Component {
  constructor(public readonly entity: number) {}
  state: AIState = 'idle';
  path: { x: number; y: number }[] = [];
  pathIndex = 0;
  stateTimer = 0;  // time in current state
}