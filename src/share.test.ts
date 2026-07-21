import { describe, expect, it } from 'vitest';
import { encodeShare, parseShare, parseTuneInput } from './share';
import type { TuneState } from './share';
import type { GenerateOptions } from './generator/generate';

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
    expect(parseShare('hero.mid.short.zzzzzzzz')).toBeNull(); // seed > 2^32
  });
});

describe('parseTuneInput', () => {
  const fallback: GenerateOptions = { mood: 'chill', tempo: 'slow', length: 'long' };

  it('parses a full pasted link', () => {
    expect(parseTuneInput('https://sidmaker.pages.dev/#hero.fast.short.z', fallback)).toEqual({
      mood: 'hero',
      tempo: 'fast',
      length: 'short',
      seed: 35,
    });
  });

  it('parses a bare share code', () => {
    expect(parseTuneInput('dark.mid.long.10', fallback)).toEqual({
      mood: 'dark',
      tempo: 'mid',
      length: 'long',
      seed: 36,
    });
  });

  it('parses a bare decimal seed using the current options', () => {
    expect(parseTuneInput('  12345 ', fallback)).toEqual({ ...fallback, seed: 12345 });
  });

  it('returns null only for empty input', () => {
    expect(parseTuneInput('', fallback)).toBeNull();
    expect(parseTuneInput('   ', fallback)).toBeNull();
  });

  it('hashes an arbitrary URL or text into a deterministic tune', () => {
    const url = 'https://www.youtube.com/watch?v=djV11Xbc914';
    const a = parseTuneInput(url, fallback);
    expect(a).not.toBeNull();
    expect(a).toEqual(parseTuneInput(url, fallback)); // same input -> same tune
    expect(a!.mood).toBe(fallback.mood); // uses the current options
    expect(a!.seed).toBeGreaterThanOrEqual(0);
    expect(a!.seed).toBeLessThanOrEqual(0xffffffff);
    const other = parseTuneInput('https://youtu.be/something-else', fallback);
    expect(other!.seed).not.toBe(a!.seed); // different input -> different seed
  });
});
