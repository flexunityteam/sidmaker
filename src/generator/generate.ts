import { Rng } from '../core/rng';
import type { NoteEvent, Song, Track } from '../core/types';
import { DRUMS, MOODS } from './moods';
import type { LengthChoice, MoodName, TempoChoice } from './moods';
import { PROGRESSIONS, SCALES, chordMidiNotes, degreeToMidi } from './theory';

export interface GenerateOptions {
  mood: MoodName;
  tempo: TempoChoice;
  length: LengthChoice;
}

const TICKS_PER_BEAT = 8; // 32nd-note resolution
const BEATS_PER_BAR = 4;
const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;

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
  tonicMidi: number;
  /** Chord degree per bar, over the whole song */
  chordByBar: number[];
  /** Section flags per bar */
  isIntro: boolean[];
  totalBars: number;
}

export function generateSong(seed: number, options: GenerateOptions): Song {
  const rng = new Rng(seed);
  const mood = MOODS[options.mood];
  const scale = SCALES[mood.scale];

  const [bpmMin, bpmMax] = mood.bpm[options.tempo];
  const bpm = rng.range(bpmMin, bpmMax);
  // Tonic somewhere around C3..B3 keeps every voice in a comfortable register
  const tonicMidi = rng.range(48, 59);

  const progression = rng.pick(PROGRESSIONS[mood.scale]);

  // Structure: intro (2 bars) + main (8 bars) [+ variation (8 bars) when long]
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

  const ctx: SongContext = { rng, scale, tonicMidi, chordByBar, isIntro, totalBars };

  const tracks: Track[] = [
    { name: 'lead', instrument: mood.lead, events: generateMelody(ctx) },
    { name: 'arp', instrument: mood.arp, events: generateArpeggio(ctx, mood.arpNotesPerBeat) },
    { name: 'bass+drums', instrument: mood.bass, events: generateBassAndDrums(ctx, mood.drumDensity) },
  ];

  return {
    bpm,
    ticksPerBeat: TICKS_PER_BEAT,
    lengthTicks: totalBars * TICKS_PER_BAR,
    tracks,
    seed,
  };
}

/**
 * Melody: random walk over scale degrees, one phrase per progression pass.
 * The phrase repeats on later passes (with a regenerated final bar for a
 * cadence feel) so the tune sounds intentional rather than aimless.
 */
function generateMelody(ctx: SongContext): NoteEvent[] {
  const { rng, chordByBar, isIntro } = ctx;
  const events: NoteEvent[] = [];

  const firstMainBar = isIntro.filter(Boolean).length;
  const mainBars = ctx.totalBars - firstMainBar;
  const phraseLen = 4; // bars per phrase (one progression pass)

  // Generate one phrase, then reuse it with a fresh last bar per pass
  const phrase: NoteEvent[][] = [];
  for (let barInPhrase = 0; barInPhrase < phraseLen; barInPhrase++) {
    const chordDegree = chordByBar[firstMainBar + barInPhrase];
    phrase.push(generateMelodyBar(ctx, chordDegree, barInPhrase === phraseLen - 1));
  }

  for (let bar = 0; bar < mainBars; bar++) {
    const absoluteBar = firstMainBar + bar;
    const barInPhrase = bar % phraseLen;
    const isLastBarOfPass = barInPhrase === phraseLen - 1;
    const isFirstPass = bar < phraseLen;

    let barEvents: NoteEvent[];
    if (!isFirstPass && isLastBarOfPass && rng.chance(0.6)) {
      barEvents = generateMelodyBar(ctx, chordByBar[absoluteBar], true);
    } else {
      barEvents = phrase[barInPhrase];
    }

    for (const e of barEvents) {
      events.push({ ...e, tick: e.tick + absoluteBar * TICKS_PER_BAR });
    }
  }
  return events;
}

/** One bar of melody: rhythm from a template, pitches walking the scale. */
function generateMelodyBar(ctx: SongContext, chordDegree: number, cadence: boolean): NoteEvent[] {
  const { rng, scale, tonicMidi } = ctx;
  const rhythm = rng.pick(RHYTHM_TEMPLATES);
  const events: NoteEvent[] = [];

  // Walk in scale-degree space one octave above the tonic
  const chordTones = [chordDegree, chordDegree + 2, chordDegree + 4];
  let degree = rng.pick(chordTones) + 7; // +7 degrees = +1 octave

  let tick = 0;
  rhythm.forEach((duration, i) => {
    const isFirst = i === 0;
    const isLast = i === rhythm.length - 1;

    if (isFirst || (isLast && cadence)) {
      // Land on a chord tone at bar boundaries; cadence resolves near the tonic
      const target = isLast && cadence ? 7 : rng.pick(chordTones) + 7;
      degree = target;
    } else if (rng.chance(0.65)) {
      degree += rng.chance(0.5) ? 1 : -1; // stepwise motion most of the time
    } else {
      degree = rng.pick(chordTones) + 7; // occasional leap back to the chord
    }
    degree = Math.max(5, Math.min(16, degree));

    // Small chance of a rest instead of a note keeps phrases breathing
    if (!isFirst && rng.chance(0.12)) {
      tick += duration;
      return;
    }

    events.push({
      tick,
      durationTicks: Math.max(1, duration - 1), // tiny gap articulates notes
      midiNote: degreeToMidi(tonicMidi, scale, degree),
      velocity: tick % TICKS_PER_BEAT === 0 ? 1 : 0.8,
    });
    tick += duration;
  });
  return events;
}

/** Arpeggio: the current chord as fast broken notes — the classic SID shimmer. */
function generateArpeggio(ctx: SongContext, notesPerBeat: number): NoteEvent[] {
  const { rng, scale, tonicMidi, chordByBar } = ctx;
  const events: NoteEvent[] = [];
  const noteTicks = TICKS_PER_BEAT / notesPerBeat;
  const upDown = rng.chance(0.4);

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const notes = chordMidiNotes(tonicMidi + 12, scale, chordByBar[bar]);
    const cycle = upDown ? [...notes, notes[1]] : notes;
    const slots = TICKS_PER_BAR / noteTicks;
    for (let slot = 0; slot < slots; slot++) {
      events.push({
        tick: bar * TICKS_PER_BAR + slot * noteTicks,
        durationTicks: noteTicks,
        midiNote: cycle[slot % cycle.length],
        velocity: 0.9,
      });
    }
  }
  return events;
}

/**
 * Shared voice 3: kick and snare take the strong eighth-note slots, bass
 * root/octave notes fill the rest — the way real SID tunes multiplex drums
 * and bass on one channel.
 */
function generateBassAndDrums(ctx: SongContext, drumDensity: number): NoteEvent[] {
  const { rng, scale, tonicMidi, chordByBar, isIntro } = ctx;
  const events: NoteEvent[] = [];
  const EIGHTH = TICKS_PER_BEAT / 2;
  const KICK_NOTE = 34;
  const octaveJumps = rng.chance(0.5);

  for (let bar = 0; bar < ctx.totalBars; bar++) {
    const rootMidi = degreeToMidi(tonicMidi - 12, scale, chordByBar[bar]);
    const drumsOn = !isIntro[bar];

    for (let slot = 0; slot < 8; slot++) {
      const tick = bar * TICKS_PER_BAR + slot * EIGHTH;

      if (drumsOn && (slot === 0 || slot === 4) && (slot === 0 || rng.chance(drumDensity))) {
        events.push({ tick, durationTicks: EIGHTH, midiNote: KICK_NOTE, velocity: 1, instrument: DRUMS.kick });
      } else if (drumsOn && (slot === 2 || slot === 6) && rng.chance(drumDensity)) {
        events.push({ tick, durationTicks: EIGHTH, midiNote: 60, velocity: 1, instrument: DRUMS.snare });
      } else {
        const octaveUp = octaveJumps && slot % 2 === 1;
        events.push({
          tick,
          durationTicks: EIGHTH - 1,
          midiNote: rootMidi + (octaveUp ? 12 : 0),
          velocity: slot % 4 === 0 ? 1 : 0.85,
        });
      }
    }
  }
  return events;
}
