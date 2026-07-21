import type { GenerateOptions } from './generator/generate';
import type { LengthChoice, MoodName, TempoChoice } from './generator/moods';

const MOODS: MoodName[] = ['hero', 'dark', 'bubbly', 'chill', 'boss', 'title', 'aqua'];
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

/** Deterministic 32-bit FNV-1a hash of a string, for turning any text/URL into a seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Parse whatever a user pastes into the load box:
 *   1. a full share link or bare share code  -> that exact tune,
 *   2. a plain decimal seed                   -> that seed with current options,
 *   3. anything else (a URL, a song title, …) -> hashed into a seed with current
 *      options, so pasting e.g. a YouTube link always gives the same chiptune.
 * Only empty input returns null.
 */
export function parseTuneInput(raw: string, fallback: GenerateOptions): TuneState | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hashIndex = trimmed.lastIndexOf('#');
  const share = parseShare(hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : trimmed);
  if (share) return share;

  if (/^\d+$/.test(trimmed)) {
    const seed = Number(trimmed);
    if (Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff) {
      return { mood: fallback.mood, tempo: fallback.tempo, length: fallback.length, seed };
    }
  }

  return { mood: fallback.mood, tempo: fallback.tempo, length: fallback.length, seed: hashString(trimmed) };
}
