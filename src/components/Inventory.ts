import type { Component } from '../ecs/Component';

export class Inventory implements Component {
  constructor(public readonly entity: number) {}
  items: { id: string; quantity: number }[] = [];
  capacity = 10;
}