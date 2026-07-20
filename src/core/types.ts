/**
 * Core data model. This is the seam between the generator (music theory)
 * and the player (Web Audio). A future WASM SID player or WAV exporter
 * consumes the same Song shape.
 */

export type Waveform = 'pulse' | 'triangle' | 'sawtooth' | 'noise';

export interface Adsr {
  /** Attack time in seconds */
  a: number;
  /** Decay time in seconds */
  d: number;
  /** Sustain level 0..1 */
  s: number;
  /** Release time in seconds */
  r: number;
}

export interface Instrument {
  waveform: Waveform;
  /** Pulse duty cycle 0..1, only meaningful for 'pulse' */
  pulseWidth?: number;
  adsr: Adsr;
  /** Linear gain 0..1 applied to this instrument's notes */
  gain: number;
}

export interface NoteEvent {
  /** Start position in ticks from song start */
  tick: number;
  durationTicks: number;
  /** MIDI note number. Ignored for noise instruments. */
  midiNote: number;
  /** 0..1, scales instrument gain per note */
  velocity: number;
  /**
   * Optional per-note instrument override. Used on the shared bass/drum
   * voice where kick, snare and bass alternate within one track.
   */
  instrument?: Instrument;
}

export interface Track {
  name: string;
  instrument: Instrument;
  events: NoteEvent[];
}

export interface Song {
  bpm: number;
  /** Ticks per quarter note */
  ticksPerBeat: number;
  /** Total length; playback loops back to 0 here */
  lengthTicks: number;
  tracks: Track[];
  /** Seed that produced this song (same seed + options => same song) */
  seed: number;
}
