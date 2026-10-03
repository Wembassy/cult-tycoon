export type FollowerAnimationState =
  | 'idle'
  | 'walk'
  | 'work'
  | 'pray'
  | 'eat'
  | 'sleep';

export const FOLLOWER_ANIMATION_KEYWORDS: Record<FollowerAnimationState, string[]> = {
  idle: ['idle', 'stand', 'standing', 'rest', 'breath'],
  walk: ['walk', 'locomotion', 'move'],
  work: ['work', 'hammer', 'build', 'clean', 'research', 'cook', 'craft'],
  pray: ['pray', 'prayer', 'worship', 'ritual', 'kneel'],
  eat: ['eat', 'eating', 'drink', 'drinking'],
  sleep: ['sleep', 'sleeping', 'lie', 'lying'],
};

export interface FollowerAnimationManifest {
  enabled: boolean;
  source: string;
}

/**
 * Pick a semantically named clip for a gameplay animation state.
 * Generic exports such as Take 001/BaseLayer are intentionally ignored.
 */
export function findFollowerAnimationClip(
  clips: { name: string }[],
  state: FollowerAnimationState,
): number {
  const keywords = FOLLOWER_ANIMATION_KEYWORDS[state];
  return clips.findIndex((clip) => {
    const name = clip.name.toLowerCase();
    return keywords.some((keyword) => name.includes(keyword));
  });
}
