import type { Instrument } from '../core/types';
import type { ScaleName } from './theory';

export type MoodName = 'hero' | 'dark' | 'bubbly' | 'chill';
export type TempoChoice = 'slow' | 'mid' | 'fast';
export type LengthChoice = 'short' | 'long';

export type BassStyle = 'root8' | 'octave16' | 'hubbard';

export interface MoodConfig {
  scale: ScaleName;
  /** [min, max] BPM per tempo choice */
  bpm: Record<TempoChoice, [number, number]>;
  /** Probability a kick/snare slot fires */
  drumDensity: number;
  /** Probability an off-beat hi-hat tick fires */
  hatDensity: number;
  bassStyle: BassStyle;
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
    bassStyle: 'hubbard',
    lead: {
      waveform: 'pulse',
      pulseWidth: 0.25,
      adsr: { a: 0.01, d: 0.09, s: 0.65, r: 0.09 },
      gain: 0.3,
      vibrato: { rateHz: 6, depthCents: 26, delaySec: 0.18 },
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
    bassStyle: 'octave16',
    lead: {
      waveform: 'pulse',
      pulseWidth: 0.15,
      adsr: { a: 0.01, d: 0.08, s: 0.6, r: 0.09 },
      gain: 0.28,
      vibrato: { rateHz: 5.5, depthCents: 32, delaySec: 0.2 },
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
    bassStyle: 'octave16',
    lead: {
      waveform: 'pulse',
      pulseWidth: 0.125,
      adsr: { a: 0.004, d: 0.06, s: 0.5, r: 0.05 },
      gain: 0.28,
      vibrato: { rateHz: 7, depthCents: 18, delaySec: 0.12 },
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
    bassStyle: 'root8',
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
};

/** Percussion, carried on the shared bass/drum voice as per-note overrides. */
export const DRUMS: { kick: Instrument; snare: Instrument; hat: Instrument } = {
  kick: { waveform: 'triangle', adsr: { a: 0.001, d: 0.09, s: 0, r: 0.03 }, gain: 0.5 },
  snare: { waveform: 'noise', adsr: { a: 0.001, d: 0.08, s: 0, r: 0.04 }, gain: 0.3 },
  hat: { waveform: 'noise', adsr: { a: 0.001, d: 0.025, s: 0, r: 0.015 }, gain: 0.14 },
};
