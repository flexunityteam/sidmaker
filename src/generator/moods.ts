import type { Instrument } from '../core/types';
import type { ScaleName } from './theory';

export type MoodName = 'hero' | 'dark' | 'bubbly' | 'chill';
export type TempoChoice = 'slow' | 'mid' | 'fast';
export type LengthChoice = 'short' | 'long';

export interface MoodConfig {
  scale: ScaleName;
  /** [min, max] BPM per tempo choice */
  bpm: Record<TempoChoice, [number, number]>;
  /** Probability that a drum slot actually fires */
  drumDensity: number;
  /** Arpeggio speed in notes per beat (4 = 16ths, 8 = 32nds) */
  arpNotesPerBeat: number;
  lead: Instrument;
  arp: Instrument;
  bass: Instrument;
}

const lead = (pulseWidth: number, gain: number): Instrument => ({
  waveform: 'pulse',
  pulseWidth,
  adsr: { a: 0.01, d: 0.08, s: 0.6, r: 0.08 },
  gain,
});

export const MOODS: Record<MoodName, MoodConfig> = {
  hero: {
    scale: 'major',
    bpm: { slow: [100, 115], mid: [120, 140], fast: [145, 165] },
    drumDensity: 0.95,
    arpNotesPerBeat: 4,
    lead: lead(0.5, 0.28),
    arp: { waveform: 'sawtooth', adsr: { a: 0.005, d: 0.04, s: 0.3, r: 0.04 }, gain: 0.16 },
    bass: { waveform: 'pulse', pulseWidth: 0.5, adsr: { a: 0.005, d: 0.1, s: 0.7, r: 0.05 }, gain: 0.3 },
  },
  dark: {
    scale: 'minor',
    bpm: { slow: [80, 95], mid: [100, 120], fast: [125, 145] },
    drumDensity: 0.7,
    arpNotesPerBeat: 4,
    lead: lead(0.25, 0.26),
    arp: { waveform: 'sawtooth', adsr: { a: 0.01, d: 0.06, s: 0.35, r: 0.06 }, gain: 0.15 },
    bass: { waveform: 'sawtooth', adsr: { a: 0.005, d: 0.12, s: 0.75, r: 0.06 }, gain: 0.3 },
  },
  bubbly: {
    scale: 'major',
    bpm: { slow: [110, 125], mid: [130, 150], fast: [155, 175] },
    drumDensity: 0.9,
    arpNotesPerBeat: 8,
    lead: lead(0.3, 0.26),
    arp: { waveform: 'pulse', pulseWidth: 0.5, adsr: { a: 0.003, d: 0.03, s: 0.25, r: 0.03 }, gain: 0.17 },
    bass: { waveform: 'pulse', pulseWidth: 0.5, adsr: { a: 0.005, d: 0.08, s: 0.65, r: 0.05 }, gain: 0.28 },
  },
  chill: {
    scale: 'minor',
    bpm: { slow: [70, 82], mid: [85, 100], fast: [105, 120] },
    drumDensity: 0.5,
    arpNotesPerBeat: 4,
    lead: { waveform: 'triangle', adsr: { a: 0.03, d: 0.1, s: 0.7, r: 0.15 }, gain: 0.3 },
    arp: { waveform: 'triangle', adsr: { a: 0.01, d: 0.05, s: 0.4, r: 0.08 }, gain: 0.18 },
    bass: { waveform: 'triangle', adsr: { a: 0.01, d: 0.1, s: 0.8, r: 0.1 }, gain: 0.32 },
  },
};

/** Drum hits live on the shared bass/drum voice as per-note instrument overrides. */
export const DRUMS: { kick: Instrument; snare: Instrument } = {
  kick: { waveform: 'triangle', adsr: { a: 0.001, d: 0.09, s: 0, r: 0.03 }, gain: 0.5 },
  snare: { waveform: 'noise', adsr: { a: 0.001, d: 0.07, s: 0, r: 0.04 }, gain: 0.3 },
};
