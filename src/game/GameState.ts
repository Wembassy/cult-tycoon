/**
 * GameState — Global mutable state store for the game.
 *
 * Tracks resources, time, and cult-level statistics.
 * This is a plain data container — systems read and mutate it during simulation ticks.
 */

export interface Resources {
  faith: number;
  funds: number;
  materials: number;
  food: number;
  influence: number;
  notoriety: number;
}

export interface CultStats {
  followerCount: number;
  believerCount: number;
  reputation: number;
  day: number;
}

export interface SerializedGameState {
  resources: Resources;
  cult: CultStats;
  elapsedSimTime: number;
  tickCount: number;
  timeScale: number;
}

export class GameState {
  /** Player-controlled resources. */
  public resources: Resources;

  /** Cult-level statistics. */
  public cult: CultStats;

  /** Total elapsed simulation time in seconds. */
  public elapsedSimTime: number = 0;

  /** Total number of simulation ticks. */
  public tickCount: number = 0;

  /** Current time scale (0 = paused, 1 = normal, 2 = fast, 3 = very fast). */
  public timeScale: number = 1;

  constructor(initial?: Partial<Resources & CultStats>) {
    this.resources = {
      faith: initial?.faith ?? 100,
      funds: initial?.funds ?? 500,
      materials: initial?.materials ?? 50,
      food: initial?.food ?? 100,
      influence: initial?.influence ?? 10,
      notoriety: initial?.notoriety ?? 0,
    };

    this.cult = {
      followerCount: initial?.followerCount ?? 0,
      believerCount: initial?.believerCount ?? 0,
      reputation: initial?.reputation ?? 0,
      day: initial?.day ?? 1,
    };
  }

  /** Advance the day counter (called every in-game day). */
  advanceDay(): void {
    this.cult.day++;
  }

  /** Check if the game is paused. */
  get isPaused(): boolean {
    return this.timeScale === 0;
  }

  /** Serialize to a plain object for saving. */
  toJSON(): SerializedGameState {
    return {
      resources: { ...this.resources },
      cult: { ...this.cult },
      elapsedSimTime: this.elapsedSimTime,
      tickCount: this.tickCount,
      timeScale: this.timeScale,
    };
  }

  /** Restore from a serialized object. */
  static fromJSON(data: SerializedGameState): GameState {
    const state = new GameState();
    state.resources = { ...data.resources };
    state.cult = { ...data.cult };
    state.elapsedSimTime = data.elapsedSimTime;
    state.tickCount = data.tickCount;
    state.timeScale = data.timeScale;
    return state;
  }
}