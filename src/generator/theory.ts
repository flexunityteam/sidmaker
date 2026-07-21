/** Music theory as data: scales, modes, chords, progressions. No audio code here. */

export type ScaleName =
  | 'major'
  | 'minor'
  | 'harmonicMinor'
  | 'dorian'
  | 'phrygian'
  | 'lydian';

/** Semitone offsets from the tonic */
export const SCALES: Record<ScaleName, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

/**
 * Melody masks: which scale-degree indices the melody is allowed to use.
 * Restricting the tune to a pentatonic subset of the mode keeps it consonant
 * and singable — the reason classic SID melodies rarely hit a wrong note —
 * while chords and bass still use the full mode for colour.
 */
export const MELODY_MASKS: Record<ScaleName, readonly number[]> = {
  major: [0, 1, 2, 4, 5], // major pentatonic (1 2 3 5 6)
  minor: [0, 2, 3, 4, 6], // minor pentatonic (1 b3 4 5 b7)
  harmonicMinor: [0, 2, 3, 4, 6], // minor pentatonic over the exotic mode
  dorian: [0, 2, 3, 4, 5], // 1 b3 4 5 6 — the bright Dorian sixth
  phrygian: [0, 1, 3, 4, 6], // 1 b2 4 5 b7 — the dark Phrygian second
  lydian: [0, 1, 2, 4, 5], // 1 2 3 5 6 — dreamy, sidesteps the sharp fourth
};

/** Curated pools of chord progressions per scale family, as 0-based degrees. */
const MAJOR_PROGRESSIONS: readonly (readonly number[])[] = [
  [0, 4, 5, 3], // I–V–vi–IV
  [0, 3, 4, 3], // I–IV–V–IV
  [0, 5, 3, 4], // I–vi–IV–V
  [0, 3, 5, 4], // I–IV–vi–V
  [0, 5, 1, 4], // I–vi–ii–V
  [0, 4, 1, 4], // I–V–ii–V
  [0, 3, 0, 4], // I–IV–I–V
  [0, 2, 3, 4], // I–iii–IV–V
  [0, 4, 5, 2], // I–V–vi–iii
  [0, 5, 4, 3], // I–vi–V–IV
];

const MINOR_PROGRESSIONS: readonly (readonly number[])[] = [
  [0, 5, 2, 6], // i–VI–III–VII
  [0, 3, 4, 5], // i–iv–v–VI
  [0, 6, 5, 6], // i–VII–VI–VII
  [0, 3, 6, 0], // i–iv–VII–i
  [0, 5, 6, 4], // i–VI–VII–v  (heroic minor climb)
  [0, 2, 5, 6], // i–III–VI–VII
  [0, 6, 2, 3], // i–VII–III–iv
  [0, 3, 5, 6], // i–iv–VI–VII
  [0, 4, 5, 0], // i–v–VI–i
  [0, 6, 3, 4], // i–VII–iv–v
];

export const PROGRESSIONS: Record<ScaleName, readonly (readonly number[])[]> = {
  major: MAJOR_PROGRESSIONS,
  minor: MINOR_PROGRESSIONS,
  harmonicMinor: MINOR_PROGRESSIONS,
  dorian: MINOR_PROGRESSIONS,
  phrygian: MINOR_PROGRESSIONS,
  lydian: MAJOR_PROGRESSIONS,
};

/** MIDI note for a scale degree, handling octave wrap for degrees >= 7. */
export function degreeToMidi(tonicMidi: number, scale: readonly number[], degree: number): number {
  const octave = Math.floor(degree / scale.length);
  const step = ((degree % scale.length) + scale.length) % scale.length;
  return tonicMidi + octave * 12 + scale[step];
}

/** Triad (three MIDI notes) built on a scale degree by stacking thirds. */
export function chordMidiNotes(tonicMidi: number, scale: readonly number[], degree: number): number[] {
  return [
    degreeToMidi(tonicMidi, scale, degree),
    degreeToMidi(tonicMidi, scale, degree + 2),
    degreeToMidi(tonicMidi, scale, degree + 4),
  ];
}

/**
 * Map a position on the pentatonic melody ladder to a MIDI note. The ladder
 * repeats the mask across octaves, so integer steps always move by consonant
 * intervals — melodies can walk freely without landing on a wrong note.
 */
export function ladderToMidi(
  tonicMidi: number,
  scale: readonly number[],
  mask: readonly number[],
  pos: number,
): number {
  const len = mask.length;
  const octave = Math.floor(pos / len);
  const i = ((pos % len) + len) % len;
  const degree = octave * scale.length + mask[i];
  return degreeToMidi(tonicMidi, scale, degree);
}

/** All pitch classes (0..11) that belong to the scale rooted at tonicMidi. */
export function scalePitchClasses(tonicMidi: number, scale: readonly number[]): Set<number> {
  return new Set(scale.map((s) => (tonicMidi + s) % 12));
}
