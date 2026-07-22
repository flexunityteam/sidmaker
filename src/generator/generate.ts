import { Rng } from '../core/rng';
import type { FilterSweep, Instrument, NoteEvent, Song, Track } from '../core/types';
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
const INTRO_BARS = 2;
const SECTION_BARS = 4;

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

/** Swing options per mood (fraction of a sixteenth); one picked per song. */
const SWING_BY_MOOD: Record<MoodName, readonly number[]> = {
  hero: [0, 0, 0.08, 0.12],
  dark: [0, 0.1, 0.15],
  bubbly: [0, 0, 0], // stays straight and punchy
  chill: [0.12, 0.16, 0.2],
  boss: [0, 0, 0.06],
  title: [0, 0.08],
  aqua: [0.14, 0.18, 0.22],
};

/** Base low-pass sweep per mood; the centre is jittered slightly per song. */
const FILTER_BY_MOOD: Record<MoodName, FilterSweep> = {
  hero: { center: 8000, depth: 3000, rateHz: 0.12 },
  dark: { center: 4500, depth: 2500, rateHz: 0.08 },
  bubbly: { center: 9000, depth: 2000, rateHz: 0.2 },
  chill: { center: 5000, depth: 3000, rateHz: 0.06 },
  boss: { center: 6500, depth: 4000, rateHz: 0.16 },
  title: { center: 8500, depth: 3000, rateHz: 0.1 },
  aqua: { center: 3800, depth: 3200, rateHz: 0.05 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Motif {
  rhythm: readonly number[];
  contour: number[];
}

/** Which of the three melodic voices sound in a given bar. */
interface LayerFlags {
  lead: boolean;
  arp: boolean;
  drums: boolean;
}

/** A 4-bar section of the song form. */
interface Section {
  startBar: number;
  label: 'A' | 'B';
  chords: number[];
  motif: Motif;
}

interface Variety {
  bassStyle: BassStyle;
  drums: DrumPattern;
  arpShape: ArpShape;
  arpOctave: number;
  motifA: Motif;
  motifB: Motif;
  baseShift: number;
  snareSound: 'snare' | 'clap';
  fillStyle: 'snare' | 'tom';
}

interface SongContext {
  rng: Rng;
  scale: readonly number[];
  mask: readonly number[];
  tonicMidi: number;
  chordByBar: number[];
  totalBars: number;
  firstMainBar: number;
  arrangement: LayerFlags[];
  sections: Section[];
  variety: Variety;
  /** Semitone key shift per bar (a modulated bridge on some long songs). */
  keyShiftByBar: number[];
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

  const pool = PROGRESSIONS[mood.scale];
  const progA = rng.pick(pool);
  let progB = rng.pick(pool);
  for (let guard = 0; guard < 8 && progB === progA; guard++) progB = rng.pick(pool);

  const swing = rng.pick(SWING_BY_MOOD[options.mood]);
  const fbase = FILTER_BY_MOOD[options.mood];
  const filter: FilterSweep = {
    center: clamp(fbase.center + rng.range(-800, 800), 1500, 11000),
    depth: fbase.depth,
    rateHz: fbase.rateHz,
  };

  const variety: Variety = {
    bassStyle: rng.pick(mood.bassStyles),
    drums: rng.pick(DRUM_PATTERNS),
    arpShape: rng.pick(ARP_SHAPES),
    arpOctave: rng.pick([0, 0, 12]),
    motifA: makeMotif(rng),
    motifB: makeMotif(rng),
    baseShift: rng.pick([0, 0, 0, 2, 3]),
    snareSound: rng.pick(['snare', 'snare', 'clap']),
    fillStyle: rng.pick(['snare', 'tom', 'tom']),
  };

  // Slight per-song timbre jitter so instruments don't sound identical.
  const jitterPulse = (inst: Instrument): Instrument =>
    inst.waveform === 'pulse'
      ? { ...inst, pulseWidth: clamp((inst.pulseWidth ?? 0.5) + rng.pick([-0.05, 0, 0, 0.05, 0.1]), 0.08, 0.5) }
      : inst;
  let leadInst = jitterPulse(mood.lead);
  // Ring-modulated metallic lead for some Boss/Dark tunes.
  if ((options.mood === 'boss' || options.mood === 'dark') && rng.chance(0.5)) {
    leadInst = { ...leadInst, ringMod: { ratio: rng.pick([1.5, 2.01, 0.5, 3.01]), depth: rng.pick([0.3, 0.4, 0.5]) } };
  }
  const arpInst: Instrument = {
    ...jitterPulse(mood.arp),
    arpRateHz: clamp((mood.arp.arpRateHz ?? 36) + rng.range(-4, 6), 22, 48),
  };

  // Song form: an A/B arrangement so tunes have a verse/chorus contrast.
  const isLong = options.length === 'long';
  const form: ('A' | 'B')[] = isLong ? ['A', 'A', 'B', 'A'] : ['A', 'B'];
  const firstMainBar = INTRO_BARS;
  const totalBars = INTRO_BARS + form.length * SECTION_BARS;
  const progByLabel = { A: progA, B: progB };
  const motifByLabel = { A: variety.motifA, B: variety.motifB };

  const chordByBar: number[] = [];
  for (let i = 0; i < INTRO_BARS; i++) chordByBar.push(progA[0]);
  const sections: Section[] = form.map((label, si) => {
    const chords = progByLabel[label];
    const startBar = firstMainBar + si * SECTION_BARS;
    for (let b = 0; b < SECTION_BARS; b++) chordByBar.push(chords[b]);
    return { startBar, label, chords: [...chords], motif: motifByLabel[label] };
  });

  // Arrangement: sparse intro (arp + bass), full sections, and — on long songs
  // — a "breakdown" on the B section where the drums (and sometimes the arp)
  // drop out, before the beat returns.
  const breakdownSection = isLong ? form.indexOf('B') : -1;
  const breakdownArpOff = isLong && rng.chance(0.5);
  const arrangement: LayerFlags[] = [];
  for (let bar = 0; bar < totalBars; bar++) {
    if (bar < INTRO_BARS) {
      arrangement.push({ lead: false, arp: true, drums: false });
      continue;
    }
    const si = Math.floor((bar - firstMainBar) / SECTION_BARS);
    const isBreakdown = si === breakdownSection;
    arrangement.push({ lead: true, arp: isBreakdown ? !breakdownArpOff : true, drums: !isBreakdown });
  }

  // Key change: on some long songs, lift the B-section bridge into a new key,
  // then return home for the final A so the loop still joins seamlessly.
  const keyShiftByBar = new Array<number>(totalBars).fill(0);
  if (isLong && breakdownSection >= 0 && rng.chance(0.4)) {
    const shift = rng.pick([2, 5, 3, -2]);
    const start = firstMainBar + breakdownSection * SECTION_BARS;
    for (let b = 0; b < SECTION_BARS; b++) keyShiftByBar[start + b] = shift;
  }

  const ctx: SongContext = {
    rng,
    scale,
    mask,
    tonicMidi,
    chordByBar,
    totalBars,
    firstMainBar,
    arrangement,
    sections,
    variety,
    keyShiftByBar,
  };

  const tracks: Track[] = [
    { name: 'lead', instrument: leadInst, events: generateMelody(ctx) },
    { name: 'arp', instrument: arpInst, events: generateArpeggio(ctx) },
    { name: 'bass+drums', instrument: mood.bass, events: generateBassAndDrums(ctx, mood.drumDensity, mood.hatDensity) },
  ];

  return { bpm, ticksPerBeat: TICKS_PER_BEAT, lengthTicks: totalBars * TICKS_PER_BAR, tracks, seed, swing, filter };
}

// ---------------------------------------------------------------------------
// Melody: one 4-bar phrase per section type (A, B) walked on a pentatonic
// ladder. Repeated A sections reuse the same phrase (a recognisable hook); the
// B section brings its own material for contrast.
// ---------------------------------------------------------------------------

function generateMelody(ctx: SongContext): NoteEvent[] {
  const base = ctx.mask.length + ctx.variety.baseShift;
  const restChance = 0.1;
  const phraseCache = new Map<'A' | 'B', NoteEvent[][]>();

  const phraseFor = (section: Section): NoteEvent[][] => {
    const cached = phraseCache.get(section.label);
    if (cached) return cached;
    const bars: NoteEvent[][] = [];
    for (let b = 0; b < SECTION_BARS; b++) {
      bars.push(renderMotifBar(ctx, section.motif, section.chords[b], base, b === SECTION_BARS - 1, restChance));
    }
    phraseCache.set(section.label, bars);
    return bars;
  };

  const events: NoteEvent[] = [];
  for (const section of ctx.sections) {
    const bars = phraseFor(section);
    for (let b = 0; b < SECTION_BARS; b++) {
      const absoluteBar = section.startBar + b;
      if (!ctx.arrangement[absoluteBar].lead) continue;
      const shift = ctx.keyShiftByBar[absoluteBar];
      for (const e of bars[b]) {
        const ev: NoteEvent = { ...e, tick: e.tick + absoluteBar * TICKS_PER_BAR, midiNote: e.midiNote + shift };
        if (ev.glideFromMidi != null) ev.glideFromMidi += shift;
        events.push(ev);
      }
    }
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
  const { scale, tonicMidi, chordByBar, variety, arrangement } = ctx;
  const events: NoteEvent[] = [];
  const rootMidi = tonicMidi + 12 + variety.arpOctave;

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    if (!arrangement[bar].arp) continue;
    const shift = ctx.keyShiftByBar[bar];
    const triad = chordMidiNotes(rootMidi, scale, chordByBar[bar]);
    const cycle = variety.arpShape(triad).map((n) => n + shift);
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
// Shared voice 3: the bassline always plays; the drum pattern, fills and hats
// only sound where the arrangement enables drums for that bar.
// ---------------------------------------------------------------------------

const KICK_NOTE = 34;

function bassDegree(style: BassStyle, chordDeg: number, i: number): number | null {
  const eighth = i % 2 === 0 ? i / 2 : -1;
  switch (style) {
    case 'root8':
      if (eighth < 0) return null;
      return eighth % 2 === 1 ? chordDeg + 7 : chordDeg; // root / octave bounce
    case 'octave16':
      return i % 2 === 0 ? chordDeg : chordDeg + 7; // driving octave sixteenths
    case 'hubbard': {
      if (eighth < 0) return null;
      const seq = [chordDeg, chordDeg, chordDeg + 4, chordDeg + 7, chordDeg, chordDeg + 6, chordDeg + 4, chordDeg];
      return seq[eighth]; // running fifth/seventh/octave line
    }
    case 'walk': {
      if (eighth < 0) return null;
      const seq = [0, 1, 2, 3, 4, 3, 2, 1]; // stepwise up to the fifth and back
      return chordDeg + seq[eighth];
    }
    case 'pedal':
      if (eighth < 0) return null;
      return chordDeg; // steady root pulse, no octave
  }
}

function generateBassAndDrums(ctx: SongContext, drumDensity: number, hatDensity: number): NoteEvent[] {
  const { rng, scale, tonicMidi, chordByBar, arrangement, firstMainBar, variety } = ctx;
  const events: NoteEvent[] = [];
  const SIXTEENTHS = TICKS_PER_BAR / SIXTEENTH; // 16
  const kicks = new Set(variety.drums.kick);
  const snares = new Set(variety.drums.snare);
  const strongKick = new Set([0, 8]);
  const snareInstrument = variety.snareSound === 'clap' ? DRUMS.clap : DRUMS.snare;
  const TOM_PITCHES = [57, 53, 50, 47]; // descending tom fill

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const chordDeg = chordByBar[bar];
    const drumsOn = arrangement[bar].drums;
    // A fill on the last bar of each 4-bar phrase, leading into the next.
    const fillBar = drumsOn && (bar - firstMainBar) % SECTION_BARS === SECTION_BARS - 1;

    for (let i = 0; i < SIXTEENTHS; i++) {
      const tick = bar * TICKS_PER_BAR + i * SIXTEENTH;

      if (fillBar && i >= 12) {
        const tom = variety.fillStyle === 'tom';
        events.push({
          tick,
          durationTicks: SIXTEENTH,
          midiNote: tom ? TOM_PITCHES[i - 12] : 60,
          velocity: tom ? 0.9 : 0.6 + (i - 12) * 0.13,
          instrument: tom ? DRUMS.tom : DRUMS.snare,
        });
        continue;
      }

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
        events.push({ tick, durationTicks: EIGHTH, midiNote: 60, velocity: 1, instrument: snareInstrument });
        continue;
      }

      const deg = bassDegree(variety.bassStyle, chordDeg, i);
      if (deg !== null) {
        const slotTicks = i % 2 === 0 ? EIGHTH : SIXTEENTH;
        events.push({
          tick,
          durationTicks: Math.max(1, slotTicks - 1),
          midiNote: degreeToMidi(tonicMidi - 12, scale, deg) + ctx.keyShiftByBar[bar],
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
