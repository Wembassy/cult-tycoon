import type { Component } from '../ecs/Component';

export type StatusEffect =
  | 'healthy'
  | 'sick'
  | 'injured'
  | 'blessed'
  | 'cursed'
  | 'inspired'
  | 'exhausted';

export class Health implements Component {
  constructor(public readonly entity: number) {}
  hp = 100;
  maxHp = 100;
  statusEffects: StatusEffect[] = ['healthy'];
}