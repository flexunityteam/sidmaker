import type { Instrument } from '../core/types';
import type { ScaleName } from './theory';

export type MoodName = 'hero' | 'dark' | 'bubbly' | 'chill' | 'boss' | 'title' | 'aqua';
export type TempoChoice = 'slow' | 'mid' | 'fast';
export type LengthChoice = 'short' | 'long';

export type BassStyle = 'root8' | 'octave16' | 'hubbard' | 'walk' | 'pedal';

export interface MoodConfig {
  scale: ScaleName;
  /** [min, max] BPM per tempo choice */
  bpm: Record<TempoChoice, [number, number]>;
  /** Probability a kick/snare slot fires */
  drumDensity: number;
  /** Probability an off-beat hi-hat tick fires */
  hatDensity: number;
  /** Bass styles this mood may use; one is picked per song. */
  bassStyles: BassStyle[];
  lead: Instrument;
  arp: Instrument;
  bass: Instrument;
}

export const MOODS: Record<MoodName, MoodConfig> = {
  // Triumphant major, bright quarter-pulse lead with singing vibrato.
  hero: {
    scale: 'major',
    bpm: { slow: [104, 116], mid: [124, 140], fast: [148, 164] },
    drumDensity: 0.95,
    hatDensity: 0.6,
    bassStyles: ['hubbard', 'walk', 'pedal', 'root8'],
    lead: {
      waveform: 'pulse',
      pulseWidth: 0.25,
      adsr: { a: 0.01, d: 0.09, s: 0.65, r: 0.09 },
      gain: 0.3,
      vibrato: { rateHz: 6, depthCents: 26, delaySec: 0.18 },
      pwm: { rateHz: 4, minWidth: 0.15, maxWidth: 0.42 },
    },
    arp: {
      waveform: 'pulse',
      pulseWidth: 0.2,
      adsr: { a: 0.005, d: 0.05, s: 0.55, r: 0.05 },
      gain: 0.15,
      arpRateHz: 36,
    },
    bass: { waveform: 'pulse', pulseWidth: 0.5, adsr: { a: 0.005, d: 0.09, s: 0.7, r: 0.05 }, gain: 0.32 },
  },

  // Brooding harmonic minor, thin nasal pulse, heavy driving bass.
  dark: {
    scale: 'harmonicMinor',
    bpm: { slow: [82, 94], mid: [100, 118], fast: [126, 144] },
    drumDensity: 0.8,
    hatDensity: 0.5,
    bassStyles: ['hubbard', 'octave16', 'walk', 'pedal'],
    lead: {
      waveform: 'pulse',
      pulseWidth: 0.15,
      adsr: { a: 0.01, d: 0.08, s: 0.6, r: 0.09 },
      gain: 0.28,
      vibrato: { rateHz: 5.5, depthCents: 32, delaySec: 0.2 },
      pwm: { rateHz: 2.5, minWidth: 0.1, maxWidth: 0.35 },
    },
    arp: {
      waveform: 'pulse',
      pulseWidth: 0.15,
      adsr: { a: 0.005, d: 0.05, s: 0.5, r: 0.05 },
      gain: 0.15,
      arpRateHz: 32,
    },
    bass: { waveform: 'sawtooth', adsr: { a: 0.005, d: 0.11, s: 0.75, r: 0.06 }, gain: 0.32 },
  },

  // Fast and playful major, chirpy narrow pulse, quick shimmering arps.
  bubbly: {
    scale: 'major',
    bpm: { slow: [116, 128], mid: [136, 152], fast: [158, 176] },
    drumDensity: 0.9,
    hatDensity: 0.8,
    bassStyles: ['walk', 'root8', 'pedal', 'hubbard'],
    lead: {
      waveform: 'pulse',
      pulseWidth: 0.125,
      adsr: { a: 0.004, d: 0.06, s: 0.5, r: 0.05 },
      gain: 0.28,
      vibrato: { rateHz: 7, depthCents: 18, delaySec: 0.12 },
      pwm: { rateHz: 6, minWidth: 0.1, maxWidth: 0.35 },
    },
    arp: {
      waveform: 'pulse',
      pulseWidth: 0.5,
      adsr: { a: 0.003, d: 0.04, s: 0.45, r: 0.04 },
      gain: 0.16,
      arpRateHz: 42,
    },
    bass: { waveform: 'pulse', pulseWidth: 0.5, adsr: { a: 0.005, d: 0.07, s: 0.62, r: 0.05 }, gain: 0.3 },
  },

  // Slow Dorian groove, soft triangle voices, sparse drums, gentle vibrato.
  chill: {
    scale: 'dorian',
    bpm: { slow: [72, 84], mid: [88, 100], fast: [106, 120] },
    drumDensity: 0.45,
    hatDensity: 0.35,
    bassStyles: ['pedal', 'walk', 'hubbard', 'root8'],
    lead: {
      waveform: 'triangle',
      adsr: { a: 0.03, d: 0.1, s: 0.72, r: 0.16 },
      gain: 0.32,
      vibrato: { rateHz: 5, depthCents: 15, delaySec: 0.25 },
    },
    arp: {
      waveform: 'triangle',
      adsr: { a: 0.01, d: 0.06, s: 0.5, r: 0.08 },
      gain: 0.18,
      arpRateHz: 28,
    },
    bass: { waveform: 'triangle', adsr: { a: 0.01, d: 0.1, s: 0.8, r: 0.1 }, gain: 0.34 },
  },

  // Boss battle: aggressive Phrygian, fast, buzzy sawtooth lead, relentless drums.
  boss: {
    scale: 'phrygian',
    bpm: { slow: [124, 138], mid: [144, 162], fast: [168, 186] },
    drumDensity: 1,
    hatDensity: 0.85,
    bassStyles: ['octave16', 'hubbard', 'walk', 'pedal'],
    lead: {
      waveform: 'sawtooth',
      adsr: { a: 0.005, d: 0.07, s: 0.6, r: 0.07 },
      gain: 0.27,
      vibrato: { rateHz: 6.5, depthCents: 30, delaySec: 0.14 },
    },
    arp: {
      waveform: 'sawtooth',
      adsr: { a: 0.004, d: 0.04, s: 0.4, r: 0.04 },
      gain: 0.15,
      arpRateHz: 44,
    },
    bass: { waveform: 'sawtooth', adsr: { a: 0.004, d: 0.1, s: 0.8, r: 0.05 }, gain: 0.33 },
  },

  // Title screen: epic major, wide quarter-pulse lead, stately mid tempo.
  title: {
    scale: 'major',
    bpm: { slow: [96, 108], mid: [116, 132], fast: [140, 156] },
    drumDensity: 0.9,
    hatDensity: 0.55,
    bassStyles: ['hubbard', 'walk', 'pedal', 'root8'],
    lead: {
      waveform: 'pulse',
      pulseWidth: 0.35,
      adsr: { a: 0.02, d: 0.1, s: 0.7, r: 0.14 },
      gain: 0.3,
      vibrato: { rateHz: 5.5, depthCents: 24, delaySec: 0.22 },
      pwm: { rateHz: 3, minWidth: 0.2, maxWidth: 0.5 },
    },
    arp: {
      waveform: 'pulse',
      pulseWidth: 0.3,
      adsr: { a: 0.006, d: 0.06, s: 0.55, r: 0.06 },
      gain: 0.15,
      arpRateHz: 34,
    },
    bass: { waveform: 'pulse', pulseWidth: 0.5, adsr: { a: 0.006, d: 0.1, s: 0.72, r: 0.06 }, gain: 0.32 },
  },

  // Underwater: dreamy Lydian, soft triangle, slow, deep gentle vibrato.
  aqua: {
    scale: 'lydian',
    bpm: { slow: [66, 78], mid: [84, 96], fast: [100, 114] },
    drumDensity: 0.4,
    hatDensity: 0.3,
    bassStyles: ['pedal', 'walk', 'hubbard', 'root8'],
    lead: {
      waveform: 'triangle',
      adsr: { a: 0.04, d: 0.12, s: 0.75, r: 0.2 },
      gain: 0.32,
      vibrato: { rateHz: 4.5, depthCents: 20, delaySec: 0.28 },
    },
    arp: {
      waveform: 'triangle',
      adsr: { a: 0.015, d: 0.08, s: 0.55, r: 0.1 },
      gain: 0.18,
      arpRateHz: 26,
    },
    bass: { waveform: 'triangle', adsr: { a: 0.015, d: 0.12, s: 0.82, r: 0.12 }, gain: 0.33 },
  },
};

/** Percussion, carried on the shared bass/drum voice as per-note overrides. */
export const DRUMS: {
  kick: Instrument;
  snare: Instrument;
  hat: Instrument;
  clap: Instrument;
  tom: Instrument;
} = {
  kick: { waveform: 'triangle', adsr: { a: 0.001, d: 0.09, s: 0, r: 0.03 }, gain: 0.5 },
  snare: { waveform: 'noise', adsr: { a: 0.001, d: 0.08, s: 0, r: 0.04 }, gain: 0.3 },
  hat: { waveform: 'noise', adsr: { a: 0.001, d: 0.025, s: 0, r: 0.015 }, gain: 0.14 },
  clap: { waveform: 'noise', adsr: { a: 0.001, d: 0.09, s: 0, r: 0.06 }, gain: 0.26 },
  // Pitched tom for fills; its MIDI note is set per hit (stays >= 45 so it
  // doesn't trigger the kick's pitch sweep).
  tom: { waveform: 'triangle', adsr: { a: 0.001, d: 0.13, s: 0, r: 0.05 }, gain: 0.4 },
};
