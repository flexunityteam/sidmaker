import { describe, expect, it } from 'vitest';
import { encodeShare, parseShare } from './share';
import type { TuneState } from './share';

describe('share codes', () => {
  it('round-trips a tune state', () => {
    const tune: TuneState = { mood: 'dark', tempo: 'fast', length: 'long', seed: 3735928559 };
    const parsed = parseShare(encodeShare(tune));
    expect(parsed).toEqual(tune);
  });

  it('accepts a leading hash', () => {
    const tune: TuneState = { mood: 'hero', tempo: 'mid', length: 'short', seed: 42 };
    expect(parseShare(`#${encodeShare(tune)}`)).toEqual(tune);
  });

  it('rejects malformed or unknown codes', () => {
    expect(parseShare('')).toBeNull();
    expect(parseShare('hero.mid.short')).toBeNull(); // too few parts
    expect(parseShare('nope.mid.short.1')).toBeNull(); // bad mood
    expect(parseShare('hero.turbo.short.1')).toBeNull(); // bad tempo
    expect(parseShare('hero.mid.medium.1')).toBeNull(); // bad length
    expect(parseShare('hero.mid.short.')).toBeNull(); // empty seed
  });
});
