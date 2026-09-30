import type { Component } from '../ecs/Component';

export class Renderable implements Component {
  constructor(public readonly entity: number) {}
  meshId: string = '';
  visible = true;
  /** Optional tint color */
  tint: string | null = null;
}