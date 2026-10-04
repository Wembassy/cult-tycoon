/**
 * SchedulingSystem — RimWorld-style hourly activity scheduling.
 */

import type { World } from '../ecs/World';
import { System } from '../ecs/System';
import { Schedule, type ScheduleActivity, type Shift } from '../components/Schedule';
import { FollowerAI } from '../components/FollowerAI';
import { Needs } from '../components/Needs';

export class SchedulingSystem implements System {
  private currentHour = 6;

  setHour(hour: number): void {
    this.currentHour = ((hour % 24) + 24) % 24;
  }

  /** Compatibility name used by existing spawn/load flow. */
  autoAssignShifts(world: World): void {
    for (const entity of world.query([FollowerAI])) {
      if (!world.getComponent(entity, Schedule)) {
        world.addComponent(entity, new Schedule(entity));
      }
    }
  }

  /** Legacy preset hook retained for old callers/saves. */
  assignShift(world: World, entityId: number, shift: Shift): void {
    let schedule = world.getComponent(entityId, Schedule);
    if (!schedule) {
      schedule = new Schedule(entityId);
      world.addComponent(entityId, schedule);
    }
    schedule.shift = shift;
    schedule.resetDefault();

    if (shift === 'afternoon') {
      schedule.hours = this.rotate(schedule.hours, 6);
    } else if (shift === 'night') {
      schedule.hours = this.rotate(schedule.hours, 12);
    }
  }

  setActivity(world: World, entityId: number, hour: number, activity: ScheduleActivity): void {
    let schedule = world.getComponent(entityId, Schedule);
    if (!schedule) {
      schedule = new Schedule(entityId);
      world.addComponent(entityId, schedule);
    }
    schedule.setActivity(hour, activity);
  }

  resetSchedule(world: World, entityId: number): void {
    let schedule = world.getComponent(entityId, Schedule);
    if (!schedule) {
      schedule = new Schedule(entityId);
      world.addComponent(entityId, schedule);
    }
    schedule.resetDefault();
  }

  update(world: World, _dt: number): void {
    for (const entity of world.query([FollowerAI, Schedule])) {
      const ai = world.getComponent(entity, FollowerAI)!;
      const schedule = world.getComponent(entity, Schedule)!;
      const needs = world.getComponent(entity, Needs);
      const activity = schedule.getActivity(this.currentHour);

      // Never stomp active pathing/stuck resolution.
      if (ai.state === 'moving' || ai.state === 'stuck') continue;

      // Release schedule-forced need behavior when its block ends unless the
      // underlying need is still genuinely critical.
      if (activity !== 'sleep' && ai.needTarget === 'energy' && (needs?.energy ?? 100) > 25) {
        ai.needTarget = null;
        ai.needTargetTile = null;
        if (ai.state === 'needs' || ai.state === 'sleeping') ai.state = 'idle';
      }
      if (activity !== 'recreation' && ai.needTarget === 'fun' && (needs?.fun ?? 100) > 25) {
        ai.needTarget = null;
        ai.needTargetTile = null;
        if (ai.state === 'needs') ai.state = 'idle';
      }

      if (ai.state === 'needs') continue;

      if (activity === 'sleep') {
        ai.needTarget = 'energy';
        ai.needTargetTile = null;
        ai.state = 'needs';
        ai.stateTimer = 0;
        continue;
      }

      if (activity === 'recreation') {
        ai.needTarget = 'fun';
        ai.needTargetTile = null;
        ai.state = 'needs';
        ai.stateTimer = 0;
        continue;
      }

      // Work and Anything are availability states. JobSystem/autonomous needs
      // decide the actual action.
      if (ai.state === 'sleeping') {
        ai.state = 'idle';
        ai.stateTimer = 0;
      }
    }
  }

  private rotate(hours: ScheduleActivity[], amount: number): ScheduleActivity[] {
    const n = hours.length;
    return hours.map((_, i) => hours[(i - amount + n) % n]);
  }
}
