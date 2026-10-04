import type { Component } from '../ecs/Component';

export type OutsiderVisitState = 'arriving' | 'visiting' | 'leaving';

export class Outsider implements Component {
  constructor(public readonly entity: number) {}

  name = 'Outsider';
  state: OutsiderVisitState = 'arriving';
  stayRemaining = 45;
  recruitmentProgress = 0;
  recruitmentCooldown = 0;
  path: { x: number; y: number }[] = [];
  pathIndex = 0;
  exitTarget: { x: number; y: number } | null = null;
}
