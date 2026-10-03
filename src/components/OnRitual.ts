import type { Component } from '../ecs/Component';
/** A participant travels to a reserved room tile and remains until the rite ends. */
export class OnRitual implements Component {
  constructor(public readonly entity: number) {}
  ritualId = '';
  target = { x: 0, y: 0 };
}
