/** Music theory as data: scales, chords, progressions. No audio code here. */

export type ScaleName = 'major' | 'minor';

/** Semitone offsets from the tonic */
export const SCALES: Record<ScaleName, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

/**
 * A chord expressed as a scale degree (0-based). Triads are built by
 * stacking thirds within the scale, which automatically yields the right
 * major/minor quality for each degree.
 */
export interface Chord {
  /** 0-based scale degree of the root (0 = tonic) */
  degree: number;
}

/** Curated pools of chord progressions per scale, as 0-based degrees. */
export const PROGRESSIONS: Record<ScaleName, readonly (readonly number[])[]> = {
  // I–V–vi–IV, I–IV–V–IV, I–vi–IV–V, I–IV–vi–V
  major: [
    [0, 4, 5, 3],
    [0, 3, 4, 3],
    [0, 5, 3, 4],
    [0, 3, 5, 4],
  ],
  // i–VI–III–VII, i–iv–v–VI, i–VII–VI–VII, i–iv–VII–i
  minor: [
    [0, 5, 2, 6],
    [0, 3, 4, 5],
    [0, 6, 5, 6],
    [0, 3, 6, 0],
  ],
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

/** All pitch classes (0..11) that belong to the scale rooted at tonicMidi. */
export function scalePitchClasses(tonicMidi: number, scale: readonly number[]): Set<number> {
  return new Set(scale.map((s) => (tonicMidi + s) % 12));
}
