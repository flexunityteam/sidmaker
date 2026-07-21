import { describe, expect, it } from 'vitest';
import { generateSong } from './generate';
import type { GenerateOptions } from './generate';
import { MOODS } from './moods';
import type { MoodName } from './moods';
import { SCALES, scalePitchClasses } from './theory';

const ALL_MOODS = Object.keys(MOODS) as MoodName[];

const baseOptions = (mood: MoodName): GenerateOptions => ({ mood, tempo: 'mid', length: 'short' });

describe('generateSong', () => {
  it('is deterministic: same seed and options produce an identical song', () => {
    const a = generateSong(12345, baseOptions('hero'));
    const b = generateSong(12345, baseOptions('hero'));
    expect(a).toEqual(b);
  });

  it('different seeds produce different songs', () => {
    const a = generateSong(1, baseOptions('hero'));
    const b = generateSong(2, baseOptions('hero'));
    expect(a).not.toEqual(b);
  });

  it.each(ALL_MOODS)('%s: has 3 tracks and all events inside the song length', (mood) => {
    const song = generateSong(99, baseOptions(mood));
    expect(song.tracks).toHaveLength(3);
    expect(song.lengthTicks).toBeGreaterThan(0);
    for (const track of song.tracks) {
      expect(track.events.length).toBeGreaterThan(0);
      for (const e of track.events) {
        expect(e.tick).toBeGreaterThanOrEqual(0);
        expect(e.tick + e.durationTicks).toBeLessThanOrEqual(song.lengthTicks);
      }
    }
  });

  it.each(ALL_MOODS)('%s: all pitched notes stay in the chosen scale', (mood) => {
    for (const seed of [7, 42, 1337]) {
      const song = generateSong(seed, baseOptions(mood));
      const scale = SCALES[MOODS[mood].scale];
      // The tonic is not exposed on Song, but every scale contains its tonic
      // pitch class, so derive the pitch-class set from the bass track root.
      // Instead of guessing, assert relative consistency: collect all pitch
      // classes from melodic tracks and check they fit some rotation of the
      // scale — with the arp track's first note treated as a chord tone.
      const pitchClasses = new Set<number>();
      for (const track of song.tracks) {
        for (const e of track.events) {
          if ((e.instrument ?? track.instrument).waveform === 'noise') continue;
          if (e.midiNote < 45 && (e.instrument?.adsr.s ?? 1) === 0) continue; // kick
          pitchClasses.add(e.midiNote % 12);
        }
      }
      const fitsSomeTonic = Array.from({ length: 12 }, (_, tonic) => tonic).some((tonic) => {
        const allowed = scalePitchClasses(tonic, scale);
        return Array.from(pitchClasses).every((pc) => allowed.has(pc));
      });
      expect(fitsSomeTonic, `seed ${seed}`).toBe(true);
    }
  });

  it('long songs are longer than short songs', () => {
    const short = generateSong(5, { mood: 'chill', tempo: 'mid', length: 'short' });
    const long = generateSong(5, { mood: 'chill', tempo: 'mid', length: 'long' });
    expect(long.lengthTicks).toBeGreaterThan(short.lengthTicks);
  });

  it('bpm respects the mood/tempo range', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const song = generateSong(seed, { mood: 'hero', tempo: 'fast', length: 'short' });
      const [min, max] = MOODS.hero.bpm.fast;
      expect(song.bpm).toBeGreaterThanOrEqual(min);
      expect(song.bpm).toBeLessThanOrEqual(max);
    }
  });
});

describe('musical features', () => {
  it.each(ALL_MOODS)('%s: arp track carries a chord (3-6 notes) on every event', (mood) => {
    const song = generateSong(3, baseOptions(mood));
    const arp = song.tracks.find((t) => t.name === 'arp')!;
    expect(arp.events.length).toBeGreaterThan(0);
    for (const e of arp.events) {
      expect(e.arpNotes).toBeDefined();
      expect(e.arpNotes!.length).toBeGreaterThanOrEqual(3);
      expect(e.arpNotes!.length).toBeLessThanOrEqual(6);
    }
  });

  it('leads use portamento glides at least sometimes', () => {
    let glides = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const lead = generateSong(seed, baseOptions('hero')).tracks.find((t) => t.name === 'lead')!;
      glides += lead.events.filter((e) => e.glideFromMidi != null).length;
    }
    expect(glides).toBeGreaterThan(0);
  });

  it('bass+drums voice includes noise percussion (hats/snare)', () => {
    const voice = generateSong(5, baseOptions('bubbly')).tracks.find((t) => t.name === 'bass+drums')!;
    const noiseHits = voice.events.filter((e) => e.instrument?.waveform === 'noise');
    expect(noiseHits.length).toBeGreaterThan(0);
  });

  it('assigns a swing amount from the mood set (bubbly stays straight)', () => {
    for (const seed of [1, 2, 3, 7, 11]) {
      expect([0, 0.08, 0.12]).toContain(generateSong(seed, baseOptions('hero')).swing);
      expect(generateSong(seed, baseOptions('bubbly')).swing).toBe(0);
    }
  });

  it('adds a drum fill at the end of a phrase', () => {
    const song = generateSong(4, baseOptions('hero'));
    const voice = song.tracks.find((t) => t.name === 'bass+drums')!;
    const barTicks = song.ticksPerBeat * 4;
    // First phrase ends on bar index 5 (2 intro + bars 0..3); its last beat.
    const fillBar = 5;
    const lastBeatStart = fillBar * barTicks + 3 * song.ticksPerBeat;
    // The fill is a snare roll or a tom fill — either way, percussion hits.
    const fillHits = voice.events.filter(
      (e) => e.tick >= lastBeatStart && e.tick < (fillBar + 1) * barTicks && e.instrument?.adsr.s === 0,
    );
    expect(fillHits.length).toBeGreaterThanOrEqual(3);
  });

  it('intro bars have no drums (a build-up before the beat drops)', () => {
    const song = generateSong(9, baseOptions('hero'));
    const voice = song.tracks.find((t) => t.name === 'bass+drums')!;
    const barTicks = song.ticksPerBeat * 4;
    // First two bars are the intro; no kick/snare/hat there.
    const introPercussion = voice.events.filter(
      (e) => e.tick < 2 * barTicks && e.instrument?.adsr.s === 0,
    );
    expect(introPercussion.length).toBe(0);
  });

  it.each(ALL_MOODS)('%s: has a sane filter sweep', (mood) => {
    const f = generateSong(2, baseOptions(mood)).filter;
    expect(f.center).toBeGreaterThanOrEqual(1500);
    expect(f.center).toBeLessThanOrEqual(11000);
    expect(f.depth).toBeGreaterThan(0);
    expect(f.rateHz).toBeGreaterThan(0);
  });

  it('long songs have a drum breakdown (a stretch of bars with no drums)', () => {
    const song = generateSong(12, { mood: 'hero', tempo: 'mid', length: 'long' });
    const voice = song.tracks.find((t) => t.name === 'bass+drums')!;
    const barTicks = song.ticksPerBeat * 4;
    const totalBars = song.lengthTicks / barTicks;
    const isDrum = (e: (typeof voice.events)[number]) =>
      e.instrument?.waveform === 'noise' || (e.instrument?.adsr.s === 0 && e.midiNote < 45);
    let drumless = 0;
    for (let bar = 2; bar < totalBars; bar++) {
      const hits = voice.events.filter((e) => e.tick >= bar * barTicks && e.tick < (bar + 1) * barTicks && isDrum(e));
      if (hits.length === 0) drumless++;
    }
    expect(drumless).toBeGreaterThanOrEqual(3); // the ~4-bar breakdown section
  });

  it('the B section melody differs from the A section', () => {
    const song = generateSong(7, { mood: 'title', tempo: 'mid', length: 'long' });
    const lead = song.tracks.find((t) => t.name === 'lead')!;
    const barTicks = song.ticksPerBeat * 4;
    const rel = (startBar: number) =>
      lead.events
        .filter((e) => e.tick >= startBar * barTicks && e.tick < (startBar + 4) * barTicks)
        .map((e) => `${e.tick - startBar * barTicks}:${e.midiNote}`)
        .join(',');
    // Section A starts at bar 2; the B section (form index 2) at bar 10.
    expect(rel(2)).not.toBe(rel(10));
  });
});

describe('variety across seeds (same mood)', () => {
  const seeds = Array.from({ length: 24 }, (_, i) => i * 101 + 7);
  const opts = baseOptions('hero');
  const songs = seeds.map((s) => generateSong(s, opts));
  const track = (song: (typeof songs)[number], name: string) => song.tracks.find((t) => t.name === name)!;

  it('picks a range of arpeggio shapes', () => {
    const lengths = new Set(songs.map((s) => track(s, 'arp').events[0].arpNotes!.length));
    expect(lengths.size).toBeGreaterThanOrEqual(2);
  });

  it('produces distinct drum/bass grooves', () => {
    const barTicks = opts.length === 'short' ? 32 : 32;
    const groove = (song: (typeof songs)[number]) => {
      const v = track(song, 'bass+drums');
      const start = 3 * barTicks;
      return v.events
        .filter((e) => e.tick >= start && e.tick < start + barTicks)
        .map((e) => `${e.tick - start}${e.instrument?.waveform === 'noise' ? 'n' : e.midiNote === 34 ? 'k' : 'b'}`)
        .join(',');
    };
    const grooves = new Set(songs.map(groove));
    expect(grooves.size).toBeGreaterThanOrEqual(5);
  });

  it('produces almost entirely distinct melodies', () => {
    const melodies = new Set(songs.map((s) => JSON.stringify(track(s, 'lead').events)));
    expect(melodies.size).toBeGreaterThanOrEqual(20);
  });
});
