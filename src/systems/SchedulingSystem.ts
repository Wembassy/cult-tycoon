/**
 * SchedulingSystem — Manages shift assignments and daily activity scheduling.
 *
 * Three shifts provide 24/7 coverage:
 *   Morning   (6-14):  work 6-12, eat 12-13, free 13-14
 *   Afternoon (14-22): free 6-10, eat 10-11, work 14-20, eat 20-21, free 21-22
 *   Night     (22-6):  free 22-23, work 0-4, eat 4-5, sleep 5-6
 *
 * During update(), the system checks the current game hour and sets each
 * cultist's FollowerAI.state to the appropriate activity.
 */

import type { World } from '../ecs/World';
import { System } from '../ecs/System';
import { Schedule, Shift } from '../components/Schedule';
import { FollowerAI } from '../components/FollowerAI';

export class SchedulingSystem implements System {
  private currentHour: number = 6;

  /**
   * Set the current game hour (0-23). Called externally by the game loop.
   */
  setHour(hour: number): void {
    this.currentHour = hour % 24;
  }

  /**
   * Auto-assign shifts evenly across all cultists who don't yet have a Schedule.
   * Existing schedules are preserved.
   */
  autoAssignShifts(world: World): void {
    const entities = world.query([FollowerAI]);
    const shiftCounts: Record<Shift, number> = { morning: 0, afternoon: 0, night: 0 };

    // Count existing shift assignments
    for (const entity of entities) {
      const schedule = world.getComponent(entity, Schedule);
      if (schedule) {
        shiftCounts[schedule.shift]++;
      }
    }

    // Assign new followers to the least-populated shift
    for (const entity of entities) {
      let schedule = world.getComponent(entity, Schedule);
      if (!schedule) {
        schedule = new Schedule(entity);
        // Pick the shift with the fewest members
        const leastShift = (Object.keys(shiftCounts) as Shift[]).reduce((a, b) =>
          shiftCounts[a] <= shiftCounts[b] ? a : b,
        );
        schedule.shift = leastShift;
        // Set sleep hours based on shift
        schedule.sleepStartHour = this.getSleepStartForShift(leastShift);
        world.addComponent(entity, schedule);
        shiftCounts[leastShift]++;
      }
    }
  }

  /**
   * Manually assign a specific shift to a cultist.
   */
  assignShift(world: World, entityId: number, shift: Shift): void {
    let schedule = world.getComponent(entityId, Schedule);
    if (!schedule) {
      schedule = new Schedule(entityId);
      world.addComponent(entityId, schedule);
    }
    schedule.shift = shift;
    schedule.sleepStartHour = this.getSleepStartForShift(shift);
  }

  /**
   * Get the default sleep start hour for a given shift.
   */
  private getSleepStartForShift(shift: Shift): number {
    switch (shift) {
      case 'morning': return 22;   // Sleep at 10pm after evening free time
      case 'afternoon': return 2;  // Sleep at 2am after late evening
      case 'night': return 5;      // Sleep at 5am before shift ends
    }
  }

  /**
   * Determine what activity a cultist should be doing based on their shift
   * and the current hour.
   */
  private getActivityForShift(shift: Shift, hour: number): 'working' | 'eating' | 'free' | 'sleeping' {
    switch (shift) {
      case 'morning':
        // Shift: 6-14 — work 6-12, eat 12-13, free 13-14
        if (hour >= 6 && hour < 12) return 'working';
        if (hour >= 12 && hour < 13) return 'eating';
        if (hour >= 13 && hour < 14) return 'free';
        // Off-shift: free time, sleep at night
        if (hour >= this.getSleepStartForShift('morning') ||
            hour < this.getSleepStartForShift('morning') - 22) {
          // Sleep 22-4 (10pm to 4am, 6 hours)
          if (hour >= 22 || hour < 4) return 'sleeping';
        }
        return 'free';

      case 'afternoon':
        // Shift: 14-22 — free 6-10, eat 10-11, work 14-20, eat 20-21, free 21-22
        if (hour >= 6 && hour < 10) return 'free';
        if (hour >= 10 && hour < 11) return 'eating';
        if (hour >= 14 && hour < 20) return 'working';
        if (hour >= 20 && hour < 21) return 'eating';
        if (hour >= 21 && hour < 22) return 'free';
        // Off-shift: 22-6 — sleep 2-8
        if (hour >= 2 && hour < 8) return 'sleeping';
        return 'free';

      case 'night':
        // Shift: 22-6 — free 22-23, work 0-4, eat 4-5, sleep 5-6
        if (hour >= 22 && hour < 23) return 'free';
        if (hour >= 0 && hour < 4) return 'working';
        if (hour >= 4 && hour < 5) return 'eating';
        if (hour >= 5 && hour < 6) return 'sleeping';
        // Off-shift: 6-22 — free time, sleep during the day
        if (hour >= 8 && hour < 14) return 'sleeping';
        return 'free';
    }
  }

  /**
   * Update all cultists' AI states based on their shift schedule.
   */
  update(world: World, _dt: number): void {
    const entities = world.query([FollowerAI, Schedule]);

    for (const entity of entities) {
      const ai = world.getComponent(entity, FollowerAI)!;
      const schedule = world.getComponent(entity, Schedule)!;

      const activity = this.getActivityForShift(schedule.shift, this.currentHour);

      // Don't override 'moving' or 'stuck' states — let the AI resolve those first
      if (ai.state === 'moving' || ai.state === 'stuck') continue;

      switch (activity) {
        case 'working':
          if (ai.state !== 'working') {
            ai.state = 'working';
            ai.stateTimer = 0;
          }
          break;
        case 'eating':
          if (ai.state !== 'needs') {
            ai.state = 'needs';
            ai.stateTimer = 0;
          }
          break;
        case 'sleeping':
          if (ai.state !== 'sleeping') {
            ai.state = 'sleeping';
            ai.stateTimer = 0;
          }
          break;
        case 'free':
          if (ai.state === 'working' || ai.state === 'sleeping' || ai.state === 'needs') {
            ai.state = 'idle';
            ai.stateTimer = 0;
          }
          break;
      }
    }
  }
}