import type { Component } from '../ecs/Component';

export class Transform implements Component {
  constructor(public readonly entity: number) {}
  x = 0;
  y = 0;
  z = 0;
  rotation = 0;
  scale = 1;
}