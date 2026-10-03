import type { Component } from '../ecs/Component';

export type Shift = 'morning' | 'afternoon' | 'night';

export class Schedule implements Component {
  constructor(public readonly entity: number) {}
  shift: Shift = 'morning';
  activity: 'working' | 'eating' | 'free' | 'sleeping' = 'working';
  // Sleep hours within shift (default 6 hours after shift ends)
  sleepStartHour: number = 22; // 10pm
  sleepDuration: number = 6;
}
