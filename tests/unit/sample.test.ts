import { describe, it, expect } from 'vitest';

describe('Environment', () => {
  it('should run basic math operations', () => {
    expect(1 + 1).toBe(2);
  });

  it('should support string operations', () => {
    const greeting = 'Cult Tycoon';
    expect(greeting).toContain('Cult');
    expect(greeting.length).toBe(11);
  });

  it('should support array operations', () => {
    const tiles = [1, 2, 3, 4, 5];
    expect(tiles.filter((t) => t > 2)).toEqual([3, 4, 5]);
  });
});