import type { GenerateOptions } from './generator/generate';
import type { LengthChoice, MoodName, TempoChoice } from './generator/moods';

const MOODS: MoodName[] = ['hero', 'dark', 'bubbly', 'chill'];
const TEMPOS: TempoChoice[] = ['slow', 'mid', 'fast'];
const LENGTHS: LengthChoice[] = ['short', 'long'];

export interface TuneState extends GenerateOptions {
  seed: number;
}

/** Compact, shareable code for a tune: `mood.tempo.length.seed36`. */
export function encodeShare(s: TuneState): string {
  return `${s.mood}.${s.tempo}.${s.length}.${(s.seed >>> 0).toString(36)}`;
}

/** Parse a share code (with or without leading '#'), or null if malformed. */
export function parseShare(code: string): TuneState | null {
  const parts = code.replace(/^#/, '').split('.');
  if (parts.length !== 4) return null;
  const [mood, tempo, length, seed36] = parts;
  if (!MOODS.includes(mood as MoodName)) return null;
  if (!TEMPOS.includes(tempo as TempoChoice)) return null;
  if (!LENGTHS.includes(length as LengthChoice)) return null;
  const seed = parseInt(seed36, 36);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
  return { mood: mood as MoodName, tempo: tempo as TempoChoice, length: length as LengthChoice, seed };
}
