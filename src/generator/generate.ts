import { Rng } from '../core/rng';
import type { NoteEvent, Song, Track } from '../core/types';
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
];

interface SongContext {
  rng: Rng;
  scale: readonly number[];
  mask: readonly number[];
  tonicMidi: number;
  chordByBar: number[];
  isIntro: boolean[];
  totalBars: number;
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

  const ctx: SongContext = { rng, scale, mask, tonicMidi, chordByBar, isIntro, totalBars };

  const tracks: Track[] = [
    { name: 'lead', instrument: mood.lead, events: generateMelody(ctx) },
    { name: 'arp', instrument: mood.arp, events: generateArpeggio(ctx) },
    { name: 'bass+drums', instrument: mood.bass, events: generateBassAndDrums(ctx, mood.drumDensity, mood.hatDensity, mood.bassStyle) },
  ];

  return { bpm, ticksPerBeat: TICKS_PER_BEAT, lengthTicks: totalBars * TICKS_PER_BAR, tracks, seed };
}

// ---------------------------------------------------------------------------
// Melody: a motif developed across the phrase, walked on a pentatonic ladder
// so it stays consonant and hummable (how classic SID tunes get a real hook).
// ---------------------------------------------------------------------------

function generateMelody(ctx: SongContext): NoteEvent[] {
  const { rng, chordByBar, isIntro } = ctx;
  const firstMainBar = isIntro.filter(Boolean).length;
  const mainBars = ctx.totalBars - firstMainBar;
  const phraseLen = 4;

  // One motif: a fixed rhythm plus a contour of ladder-step deltas. Keeping
  // the rhythm constant across the phrase is what makes the tune recognisable.
  const rhythm = rng.pick(RHYTHM_TEMPLATES);
  const contour = rhythm.map((_, i) => {
    if (i === 0) return 0;
    const r = rng.next();
    if (r < 0.55) return rng.chance(0.5) ? 1 : -1; // stepwise
    if (r < 0.75) return 0; // repeat
    return rng.chance(0.5) ? 2 : -2; // small leap
  });

  const base = ctx.mask.length; // one octave above the tonic on the ladder
  const restChance = 0.1;

  // Develop the motif over one 4-bar phrase: bar 3 inverts it, bar 4 cadences.
  const phrase: NoteEvent[][] = [];
  for (let b = 0; b < phraseLen; b++) {
    const chordDeg = chordByBar[firstMainBar + b];
    phrase.push(renderMotifBar(ctx, rhythm, contour, chordDeg, base, b === phraseLen - 1, b === 2, restChance));
  }

  const events: NoteEvent[] = [];
  for (let bar = 0; bar < mainBars; bar++) {
    const absoluteBar = firstMainBar + bar;
    const barInPhrase = bar % phraseLen;
    let barEvents = phrase[barInPhrase];
    if (bar >= phraseLen && barInPhrase === phraseLen - 1 && rng.chance(0.5)) {
      // Refresh the cadence bar on later passes so the loop breathes.
      barEvents = renderMotifBar(ctx, rhythm, contour, chordByBar[absoluteBar], base, true, false, restChance);
    }
    for (const e of barEvents) events.push({ ...e, tick: e.tick + absoluteBar * TICKS_PER_BAR });
  }
  return events;
}

function renderMotifBar(
  ctx: SongContext,
  rhythm: readonly number[],
  contour: readonly number[],
  chordDeg: number,
  base: number,
  cadence: boolean,
  invert: boolean,
  restChance: number,
): NoteEvent[] {
  const { rng, scale, mask, tonicMidi } = ctx;
  const anchor = anchorLadderPos(ctx, chordDeg, base);
  const events: NoteEvent[] = [];
  let pos = anchor;
  let prevMidi: number | null = null;
  let tick = 0;

  rhythm.forEach((duration, i) => {
    if (i === 0) {
      pos = anchor;
    } else {
      pos += invert ? -contour[i] : contour[i];
    }
    if (cadence && i === rhythm.length - 1) {
      pos = nearestTonicLadderPos(mask.length, pos); // resolve to the tonic
    }
    pos = Math.max(base - mask.length, Math.min(base + mask.length + 1, pos));

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
  const { rng, scale, tonicMidi, chordByBar } = ctx;
  const events: NoteEvent[] = [];
  const descending = rng.chance(0.5);

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const triad = chordMidiNotes(tonicMidi + 12, scale, chordByBar[bar]);
    let cycle = [triad[0], triad[1], triad[2], triad[0] + 12];
    if (descending) cycle = cycle.slice().reverse();
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
// Shared voice 3: kick/snare backbeat, a driving bassline, and off-beat hats,
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

function generateBassAndDrums(
  ctx: SongContext,
  drumDensity: number,
  hatDensity: number,
  bassStyle: BassStyle,
): NoteEvent[] {
  const { rng, scale, tonicMidi, chordByBar, isIntro } = ctx;
  const events: NoteEvent[] = [];
  const SIXTEENTHS = TICKS_PER_BAR / SIXTEENTH; // 16

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const chordDeg = chordByBar[bar];
    const drumsOn = !isIntro[bar];

    for (let i = 0; i < SIXTEENTHS; i++) {
      const tick = bar * TICKS_PER_BAR + i * SIXTEENTH;
      const isDown = i === 0 || i === 8;
      const isBackbeat = i === 4 || i === 12;

      if (drumsOn && isDown) {
        events.push({ tick, durationTicks: EIGHTH, midiNote: KICK_NOTE, velocity: 1, instrument: DRUMS.kick });
        continue;
      }
      if (drumsOn && isBackbeat) {
        events.push({ tick, durationTicks: EIGHTH, midiNote: 60, velocity: 1, instrument: DRUMS.snare });
        continue;
      }
      if (drumsOn && (i === 6 || i === 10) && rng.chance(0.3 * drumDensity)) {
        events.push({ tick, durationTicks: SIXTEENTH, midiNote: KICK_NOTE, velocity: 0.8, instrument: DRUMS.kick });
        continue;
      }

      const deg = bassDegree(bassStyle, chordDeg, i);
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
