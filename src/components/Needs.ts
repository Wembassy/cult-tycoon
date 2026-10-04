import type { Component } from '../ecs/Component';

export class Needs implements Component {
  constructor(public readonly entity: number) {}
  hunger = 100;   // 0-100, 0 = starving
  faith = 100;    // 0-100, 0 = doubting
  fun = 100;      // 0-100, 0 = miserable
  health = 100;   // 0-100, 0 = dead
  sanity = 100;   // 0-100, 0 = breakdown
  energy = 100;   // 0-100, 0 = exhausted (restored by sleep in bedroom)
  bladder = 100;  // 0-100, 0 = desperate (restored by bathroom/toilet)
  hygiene = 100;  // 0-100, 0 = filthy (restored by bathroom/shower)
  comfort = 100;  // 0-100, affected by beds/rooms/furnishings
  social = 100;   // 0-100, restored by social interactions (#67)
}