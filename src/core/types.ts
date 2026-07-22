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

/** Gentle pitch wobble on sustained notes, the expressive core of SID leads. */
export interface Vibrato {
  rateHz: number;
  depthCents: number;
  /** Seconds before the vibrato fades in, like a real player's delayed vibrato */
  delaySec: number;
}

export interface Instrument {
  waveform: Waveform;
  /** Pulse duty cycle 0..1, only meaningful for 'pulse' */
  pulseWidth?: number;
  adsr: Adsr;
  /** Linear gain 0..1 applied to this instrument's notes */
  gain: number;
  vibrato?: Vibrato;
  /**
   * Frame-rate arpeggio speed in notes per second. When set and a note
   * carries arpNotes, the player renders that note as one oscillator whose
   * pitch steps through the chord — the signature C64 chord shimmer.
   */
  arpRateHz?: number;
  /**
   * Ring modulation: multiplies the tone by a modulator oscillator at
   * `ratio` times the note frequency, for metallic/clangorous SID timbres.
   * `depth` 0..1 blends dry (0) to full ring (1).
   */
  ringMod?: { ratio: number; depth: number };
  /**
   * Pulse-width modulation: sweeps the pulse duty between minWidth and
   * maxWidth at rateHz — the breathing SID lead. Only meaningful for 'pulse'.
   */
  pwm?: { rateHz: number; minWidth: number; maxWidth: number };
  /**
   * A wavetable-style pitch blip on the attack: semitone offsets applied one
   * per ~50Hz frame at note start before settling to pitch (a SID "zap").
   */
  pitchAttack?: number[];
  /**
   * Layers a short noise burst on each note's attack — a hi-hat/shaker from
   * the same voice, the classic Hubbard bass-plus-percussion trick.
   */
  noiseAttack?: number;
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
  /**
   * When set, the player pitch-slides (portamento) from this MIDI note into
   * midiNote at the start of the note.
   */
  glideFromMidi?: number;
  /**
   * When set, the player renders this note as a frame-rate arpeggio cycling
   * through these MIDI notes (the C64 "chord on one voice" trick).
   */
  arpNotes?: number[];
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
  /**
   * Swing amount, 0..0.5: how far off-beat sixteenths are pushed late, as a
   * fraction of a sixteenth. Applied at render time by the player and exporter,
   * so ticks stay on the grid. 0 = straight.
   */
  swing: number;
  /** Slow low-pass filter sweep on the master bus, for movement. */
  filter: FilterSweep;
}

export interface FilterSweep {
  /** Centre cutoff frequency in Hz */
  center: number;
  /** How far the cutoff swings above/below centre, in Hz */
  depth: number;
  /** Sweep speed in Hz (cycles per second), e.g. 0.1 = one sweep every 10s */
  rateHz: number;
}
