import { OnRitual } from '../components/OnRitual';
/** Schedules express availability; AI owns movement and self-care. */
import type { World } from '../ecs/World';
import { System } from '../ecs/System';
import { Schedule, Shift } from '../components/Schedule';
import { FollowerAI } from '../components/FollowerAI';
import { Needs } from '../components/Needs';
import { OnMission } from '../components/OnMission';
export type ScheduledActivity = 'working' | 'eating' | 'free' | 'sleeping';
export function getScheduledActivity(shift: Shift, hour: number): ScheduledActivity {
  const h = ((hour % 24) + 24) % 24;
  const offset: Record<Shift, number> = { morning: 0, afternoon: 8, night: 16 };
  const local = (h - offset[shift] + 24) % 24;
  if (local >= 22 || local < 6) return 'sleeping';
  if (local >= 6 && local < 12) return 'working';
  if (local >= 12 && local < 13) return 'eating';
  if (local >= 14 && local < 18) return 'working';
  return 'free';
}
export class SchedulingSystem implements System {
  private currentHour = 8;
  setHour(hour: number): void {
    this.currentHour = ((hour % 24) + 24) % 24;
  }
  autoAssignShifts(world: World): void {
    const counts: Record<Shift, number> = { morning: 0, afternoon: 0, night: 0 };
    for (const id of world.query([FollowerAI])) {
      const schedule = world.getComponent(id, Schedule);
      if (schedule) counts[schedule.shift]++;
    }
    for (const id of world.query([FollowerAI]))
      if (!world.hasComponent(id, Schedule)) {
        const shift = (Object.keys(counts) as Shift[]).reduce((a, b) =>
          counts[a] <= counts[b] ? a : b,
        );
        this.assignShift(world, id, shift);
        counts[shift]++;
      }
  }
  assignShift(world: World, entityId: number, shift: Shift): void {
    let schedule = world.getComponent(entityId, Schedule);
    if (!schedule) {
      schedule = new Schedule(entityId);
      world.addComponent(entityId, schedule);
    }
    schedule.shift = shift;
    schedule.sleepStartHour = ({ morning: 22, afternoon: 6, night: 14 } as const)[shift];
    schedule.activity = getScheduledActivity(shift, this.currentHour);
  }
  update(world: World, _dt: number): void {
    for (const id of world.query([FollowerAI, Schedule])) {
      const ai = world.getComponent(id, FollowerAI)!;
      const schedule = world.getComponent(id, Schedule)!;
      schedule.activity = getScheduledActivity(schedule.shift, this.currentHour);
      if (world.hasComponent(id, OnMission) || world.hasComponent(id, OnRitual) || ai.needTarget)
        continue;
      const needs = world.getComponent(id, Needs);
      const target =
        schedule.activity === 'sleeping'
          ? 'energy'
          : schedule.activity === 'eating'
            ? 'hunger'
            : null;
      if (target && needs && needs[target] < 70) {
        ai.needTarget = target;
        ai.needTargetTile = null;
        ai.needFacilityId = null;
        ai.path = [];
        ai.pathIndex = 0;
        ai.state = 'needs';
        ai.stateTimer = 0;
      }
    }
  }
}
