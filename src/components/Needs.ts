import type { Component } from '../ecs/Component';

export class Needs implements Component {
  constructor(public readonly entity: number) {}
  hunger = 100;   // 0-100, 0 = starving
  faith = 100;    // 0-100, 0 = doubting
  fun = 100;      // 0-100, 0 = miserable
  health = 100;   // 0-100, 0 = dead
  sanity = 100;   // 0-100, 0 = breakdown
}