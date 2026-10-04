import type { Component } from '../ecs/Component';

export type Shift = 'morning' | 'afternoon' | 'night';
export type ScheduleActivity = 'anything' | 'work' | 'sleep' | 'recreation';

function defaultHours(): ScheduleActivity[] {
  const hours: ScheduleActivity[] = Array.from({ length: 24 }, () => 'anything');
  for (let h = 22; h < 24; h++) hours[h] = 'sleep';
  for (let h = 0; h < 6; h++) hours[h] = 'sleep';
  for (let h = 8; h < 12; h++) hours[h] = 'work';
  for (let h = 13; h < 17; h++) hours[h] = 'work';
  for (let h = 18; h < 21; h++) hours[h] = 'recreation';
  return hours;
}

export class Schedule implements Component {
  constructor(public readonly entity: number) {}

  /** Compatibility metadata only; hourly activities are authoritative. */
  shift: Shift = 'morning';
  sleepStartHour = 22;
  sleepDuration = 8;

  /** RimWorld-style 24-hour schedule. */
  hours: ScheduleActivity[] = defaultHours();

  getActivity(hour: number): ScheduleActivity {
    const index = ((Math.floor(hour) % 24) + 24) % 24;
    return this.hours[index] ?? 'anything';
  }

  setActivity(hour: number, activity: ScheduleActivity): void {
    const index = ((Math.floor(hour) % 24) + 24) % 24;
    this.hours[index] = activity;
  }

  resetDefault(): void {
    this.hours = defaultHours();
  }
}
