import { Rng } from '../core/rng';
import type { Instrument, NoteEvent, Song, Track } from '../core/types';
import { DRUMS, MOODS } from './moods';
import type { BassStyle, LengthChoice, MoodName, TempoChoice } from './moods';
import {
  MELODY_MASKS,
  PROGRESSIONS,
  SCALES,
  chordMidiNotes,
  degreeToMidi,
  ladderToMidi,
} from './theory';

export interface GenerateOptions {
  mood: MoodName;
  tempo: TempoChoice;
  length: LengthChoice;
}

const TICKS_PER_BEAT = 8; // 32nd-note resolution
const BEATS_PER_BAR = 4;
const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;
const EIGHTH = TICKS_PER_BEAT / 2; // 4 ticks
const SIXTEENTH = TICKS_PER_BEAT / 4; // 2 ticks

/** Melody rhythm templates: note durations in ticks, summing to one bar (32). */
const RHYTHM_TEMPLATES: readonly (readonly number[])[] = [
  [8, 8, 8, 8],
  [8, 4, 4, 8, 8],
  [4, 4, 8, 4, 4, 8],
  [12, 4, 8, 8],
  [8, 8, 12, 4],
  [16, 8, 8],
  [4, 4, 4, 4, 8, 8],
  [6, 6, 4, 8, 8],
  [8, 8, 4, 4, 8],
  [4, 8, 4, 8, 8],
  [16, 16],
  [12, 12, 8],
];

/** Kick/snare positions on the 16-sixteenth bar grid; one picked per song. */
interface DrumPattern {
  kick: number[];
  snare: number[];
}
const DRUM_PATTERNS: readonly DrumPattern[] = [
  { kick: [0, 8], snare: [4, 12] }, // classic backbeat
  { kick: [0, 4, 8, 12], snare: [4, 12] }, // four-on-the-floor
  { kick: [0, 6, 8, 14], snare: [4, 12] }, // syncopated
  { kick: [0, 8, 11], snare: [4, 12] }, // pushed
  { kick: [0], snare: [8] }, // half-time
  { kick: [0, 3, 8, 10], snare: [4, 12] }, // busy
  { kick: [0, 8, 10, 14], snare: [4, 12] }, // rolling
];

/** Arp shapes over a triad [root, third, fifth]; one picked per song. */
type ArpShape = (t: number[]) => number[];
const ARP_SHAPES: readonly ArpShape[] = [
  (t) => [t[0], t[1], t[2], t[0] + 12], // ascending + octave
  (t) => [t[0] + 12, t[2], t[1], t[0]], // descending
  (t) => [t[0], t[1], t[2], t[0] + 12, t[2], t[1]], // up then down
  (t) => [t[0], t[0] + 12, t[1], t[2]], // octave lead-in
  (t) => [t[0], t[2], t[0] + 12, t[2]], // root-fifth-octave
  (t) => [t[0], t[1], t[2]], // plain triad
  (t) => [t[2], t[1], t[0], t[1]], // down then up
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Variety {
  bassStyle: BassStyle;
  drums: DrumPattern;
  arpShape: ArpShape;
  arpOctave: number;
  motifA: Motif;
  motifB: Motif;
  baseShift: number;
}

interface Motif {
  rhythm: readonly number[];
  contour: number[];
}

interface SongContext {
  rng: Rng;
  scale: readonly number[];
  mask: readonly number[];
  tonicMidi: number;
  chordByBar: number[];
  isIntro: boolean[];
  totalBars: number;
  variety: Variety;
}

function makeMotif(rng: Rng): Motif {
  const rhythm = rng.pick(RHYTHM_TEMPLATES);
  const contour = rhythm.map((_, i) => {
    if (i === 0) return 0;
    const r = rng.next();
    if (r < 0.5) return rng.chance(0.5) ? 1 : -1; // stepwise
    if (r < 0.68) return 0; // repeat
    if (r < 0.88) return rng.chance(0.5) ? 2 : -2; // small leap
    return rng.chance(0.5) ? 3 : -3; // occasional wide leap
  });
  return { rhythm, contour };
}

export function generateSong(seed: number, options: GenerateOptions): Song {
  const rng = new Rng(seed);
  const mood = MOODS[options.mood];
  const scale = SCALES[mood.scale];
  const mask = MELODY_MASKS[mood.scale];

  const [bpmMin, bpmMax] = mood.bpm[options.tempo];
  const bpm = rng.range(bpmMin, bpmMax);
  const tonicMidi = rng.range(48, 59);
  const progression = rng.pick(PROGRESSIONS[mood.scale]);

  // Per-song variety: the layers a listener actually distinguishes.
  const variety: Variety = {
    bassStyle: rng.pick(mood.bassStyles),
    drums: rng.pick(DRUM_PATTERNS),
    arpShape: rng.pick(ARP_SHAPES),
    arpOctave: rng.pick([0, 0, 12]),
    motifA: makeMotif(rng),
    motifB: makeMotif(rng),
    baseShift: rng.pick([0, 0, 0, 2, 3]),
  };

  // Slight per-song timbre jitter so instruments don't sound identical.
  const jitterPulse = (inst: Instrument): Instrument =>
    inst.waveform === 'pulse'
      ? { ...inst, pulseWidth: clamp((inst.pulseWidth ?? 0.5) + rng.pick([-0.05, 0, 0, 0.05, 0.1]), 0.08, 0.5) }
      : inst;
  const leadInst = jitterPulse(mood.lead);
  const arpInst: Instrument = {
    ...jitterPulse(mood.arp),
    arpRateHz: clamp((mood.arp.arpRateHz ?? 36) + rng.range(-4, 6), 22, 48),
  };

  const INTRO_BARS = 2;
  const mainRepeats = options.length === 'long' ? 4 : 2;
  const totalBars = INTRO_BARS + progression.length * mainRepeats;

  const chordByBar: number[] = [];
  const isIntro: boolean[] = [];
  for (let bar = 0; bar < INTRO_BARS; bar++) {
    chordByBar.push(progression[0]);
    isIntro.push(true);
  }
  for (let rep = 0; rep < mainRepeats; rep++) {
    for (const degree of progression) {
      chordByBar.push(degree);
      isIntro.push(false);
    }
  }

  const ctx: SongContext = { rng, scale, mask, tonicMidi, chordByBar, isIntro, totalBars, variety };

  const tracks: Track[] = [
    { name: 'lead', instrument: leadInst, events: generateMelody(ctx) },
    { name: 'arp', instrument: arpInst, events: generateArpeggio(ctx) },
    { name: 'bass+drums', instrument: mood.bass, events: generateBassAndDrums(ctx, mood.drumDensity, mood.hatDensity) },
  ];

  return { bpm, ticksPerBeat: TICKS_PER_BEAT, lengthTicks: totalBars * TICKS_PER_BAR, tracks, seed };
}

// ---------------------------------------------------------------------------
// Melody: two motifs (A and B) walked on a pentatonic ladder, laid out A A B B
// so each tune has a recognisable idea and an answering phrase, and different
// songs get genuinely different melodic and rhythmic material.
// ---------------------------------------------------------------------------

function generateMelody(ctx: SongContext): NoteEvent[] {
  const { rng, chordByBar, isIntro, variety } = ctx;
  const firstMainBar = isIntro.filter(Boolean).length;
  const mainBars = ctx.totalBars - firstMainBar;
  const phraseLen = 4;
  const base = ctx.mask.length + variety.baseShift;
  const restChance = 0.1;

  // A A B B, with the B phrase resolving to the tonic on its last bar.
  const motifFor = (b: number) => (b < 2 ? variety.motifA : variety.motifB);
  const phrase: NoteEvent[][] = [];
  for (let b = 0; b < phraseLen; b++) {
    const motif = motifFor(b);
    phrase.push(renderMotifBar(ctx, motif, chordByBar[firstMainBar + b], base, b === phraseLen - 1, restChance));
  }

  const events: NoteEvent[] = [];
  for (let bar = 0; bar < mainBars; bar++) {
    const absoluteBar = firstMainBar + bar;
    const barInPhrase = bar % phraseLen;
    let barEvents = phrase[barInPhrase];
    if (bar >= phraseLen && barInPhrase === phraseLen - 1 && rng.chance(0.5)) {
      barEvents = renderMotifBar(ctx, motifFor(barInPhrase), chordByBar[absoluteBar], base, true, restChance);
    }
    for (const e of barEvents) events.push({ ...e, tick: e.tick + absoluteBar * TICKS_PER_BAR });
  }
  return events;
}

function renderMotifBar(
  ctx: SongContext,
  motif: Motif,
  chordDeg: number,
  base: number,
  cadence: boolean,
  restChance: number,
): NoteEvent[] {
  const { rng, scale, mask, tonicMidi } = ctx;
  const anchor = anchorLadderPos(ctx, chordDeg, base);
  const events: NoteEvent[] = [];
  let pos = anchor;
  let prevMidi: number | null = null;
  let tick = 0;

  motif.rhythm.forEach((duration, i) => {
    if (i === 0) {
      pos = anchor;
    } else {
      pos += motif.contour[i];
    }
    if (cadence && i === motif.rhythm.length - 1) {
      pos = nearestTonicLadderPos(mask.length, pos); // resolve to the tonic
    }
    pos = clamp(pos, base - mask.length, base + mask.length + 1);

    if (i !== 0 && rng.chance(restChance)) {
      tick += duration;
      prevMidi = null;
      return;
    }

    const midiNote = ladderToMidi(tonicMidi, scale, mask, pos);
    const ev: NoteEvent = {
      tick,
      durationTicks: Math.max(1, duration - 1),
      midiNote,
      velocity: tick % TICKS_PER_BEAT === 0 ? 1 : 0.82,
    };
    const step = prevMidi === null ? 99 : Math.abs(midiNote - prevMidi);
    if (step > 0 && step <= 4 && rng.chance(0.35)) ev.glideFromMidi = prevMidi as number;
    events.push(ev);
    prevMidi = midiNote;
    tick += duration;
  });
  return events;
}

/** Nearest ladder position around `base` whose pitch class is a chord tone. */
function anchorLadderPos(ctx: SongContext, chordDeg: number, base: number): number {
  const { scale, mask, tonicMidi } = ctx;
  const chordPCs = new Set(chordMidiNotes(tonicMidi, scale, chordDeg).map((m) => ((m % 12) + 12) % 12));
  for (let d = 0; d <= mask.length; d++) {
    const candidates = d === 0 ? [base] : [base + d, base - d];
    for (const cand of candidates) {
      const pc = ((ladderToMidi(tonicMidi, scale, mask, cand) % 12) + 12) % 12;
      if (chordPCs.has(pc)) return cand;
    }
  }
  return base;
}

/** Tonic ladder positions are multiples of the mask length (mask[0] === tonic). */
function nearestTonicLadderPos(len: number, pos: number): number {
  const lower = Math.floor(pos / len) * len;
  const upper = lower + len;
  return pos - lower <= upper - pos ? lower : upper;
}

// ---------------------------------------------------------------------------
// Arpeggio: one event per beat carrying the chord; the player renders it as a
// single voice stepping through the notes at frame rate — the SID chord trick.
// ---------------------------------------------------------------------------

function generateArpeggio(ctx: SongContext): NoteEvent[] {
  const { scale, tonicMidi, chordByBar, variety } = ctx;
  const events: NoteEvent[] = [];
  const rootMidi = tonicMidi + 12 + variety.arpOctave;

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const triad = chordMidiNotes(rootMidi, scale, chordByBar[bar]);
    const cycle = variety.arpShape(triad);
    for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
      events.push({
        tick: bar * TICKS_PER_BAR + beat * TICKS_PER_BEAT,
        durationTicks: TICKS_PER_BEAT - 1,
        midiNote: cycle[0],
        velocity: 0.85,
        arpNotes: cycle,
      });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Shared voice 3: a drum pattern, a driving bassline, and off-beat hats,
// multiplexed onto one channel the way real SID tunes did.
// ---------------------------------------------------------------------------

const KICK_NOTE = 34;

function bassDegree(style: BassStyle, chordDeg: number, i: number): number | null {
  const eighth = i % 2 === 0 ? i / 2 : -1;
  switch (style) {
    case 'root8':
      if (eighth < 0) return null;
      return eighth % 2 === 1 ? chordDeg + 7 : chordDeg; // root / octave
    case 'octave16':
      return i % 2 === 0 ? chordDeg : chordDeg + 7; // driving sixteenths
    case 'hubbard': {
      if (eighth < 0) return null;
      const seq = [chordDeg, chordDeg, chordDeg + 4, chordDeg + 7, chordDeg, chordDeg + 6, chordDeg + 4, chordDeg];
      return seq[eighth];
    }
  }
}

function generateBassAndDrums(ctx: SongContext, drumDensity: number, hatDensity: number): NoteEvent[] {
  const { rng, scale, tonicMidi, chordByBar, isIntro, variety } = ctx;
  const events: NoteEvent[] = [];
  const SIXTEENTHS = TICKS_PER_BAR / SIXTEENTH; // 16
  const kicks = new Set(variety.drums.kick);
  const snares = new Set(variety.drums.snare);
  const strongKick = new Set([0, 8]);

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const chordDeg = chordByBar[bar];
    const drumsOn = !isIntro[bar];

    for (let i = 0; i < SIXTEENTHS; i++) {
      const tick = bar * TICKS_PER_BAR + i * SIXTEENTH;

      if (drumsOn && kicks.has(i) && (strongKick.has(i) || rng.chance(drumDensity))) {
        const strong = strongKick.has(i);
        events.push({
          tick,
          durationTicks: EIGHTH,
          midiNote: KICK_NOTE,
          velocity: strong ? 1 : 0.8,
          instrument: DRUMS.kick,
        });
        continue;
      }
      if (drumsOn && snares.has(i)) {
        events.push({ tick, durationTicks: EIGHTH, midiNote: 60, velocity: 1, instrument: DRUMS.snare });
        continue;
      }

      const deg = bassDegree(variety.bassStyle, chordDeg, i);
      if (deg !== null) {
        const slotTicks = i % 2 === 0 ? EIGHTH : SIXTEENTH;
        events.push({
          tick,
          durationTicks: Math.max(1, slotTicks - 1),
          midiNote: degreeToMidi(tonicMidi - 12, scale, deg),
          velocity: i % 4 === 0 ? 1 : 0.85,
        });
        continue;
      }

      if (drumsOn && i % 2 === 1 && rng.chance(hatDensity)) {
        events.push({ tick, durationTicks: SIXTEENTH, midiNote: 90, velocity: 0.7, instrument: DRUMS.hat });
      }
    }
  }
  return events;
}
