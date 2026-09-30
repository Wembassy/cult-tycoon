import type { Component } from '../ecs/Component';

export class Skills implements Component {
  constructor(public readonly entity: number) {}
  cooking = 1;      // 1-10
  research = 1;     // 1-10
  construction = 1; // 1-10
  faith = 1;        // 1-10
  combat = 1;       // 1-10
  social = 1;       // 1-10
}