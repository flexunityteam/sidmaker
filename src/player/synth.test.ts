import { describe, expect, it } from 'vitest';
import { swingDelaySeconds } from './synth';

describe('swingDelaySeconds', () => {
  const spt = 0.05; // seconds per tick
  const tpb = 8; // ticks per beat -> sixteenth = 2 ticks

  it('is zero when swing is off', () => {
    expect(swingDelaySeconds(2, spt, tpb, 0)).toBe(0);
  });

  it('leaves on-beat sixteenths untouched', () => {
    // ticks 0, 4, 8 are even sixteenth positions (on-beat)
    expect(swingDelaySeconds(0, spt, tpb, 0.2)).toBe(0);
    expect(swingDelaySeconds(4, spt, tpb, 0.2)).toBe(0);
  });

  it('delays off-beat sixteenths by swing of a sixteenth', () => {
    // tick 2 = sixteenth position 1 (off-beat); sixteenth = 2 ticks
    expect(swingDelaySeconds(2, spt, tpb, 0.25)).toBeCloseTo(0.25 * 2 * spt, 10);
    expect(swingDelaySeconds(6, spt, tpb, 0.25)).toBeCloseTo(0.25 * 2 * spt, 10);
  });
});
