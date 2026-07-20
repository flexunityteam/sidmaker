# SIDMAKER

A browser-based C64/SID-style chip music generator. Pick a mood, tempo and
length, press **Generate**, and get a new procedurally generated chiptune
every time. No music knowledge required — music theory is encoded as rules
(scales, curated chord progressions, pattern templates) and a seeded RNG
picks within those rules, so every tune is random yet musical.

## Architecture

```
[UI]  →  [Generator (pure music theory)]  →  Song (plain data)  →  [Player (pure Web Audio)]
```

- **Generator** (`src/generator/`) knows music theory, nothing about audio.
  `generateSong(seed, options)` is a pure, deterministic function: the same
  seed and options always produce the identical `Song`.
- **Player** (`src/player/`) knows Web Audio, nothing about music theory.
  It schedules `NoteEvent`s with a standard lookahead loop and loops the song.
- **`Song`** (`src/core/types.ts`) is the seam: a future bit-exact WASM SID
  player (reSID) or a WAV exporter consumes the same data structure.

### The three voices

Like the real SID chip, only three voices play at once:

1. **Lead** — a pulse-wave melody built from a motif that develops across the
   phrase (inversion, cadence), walked on a pentatonic ladder so it stays
   hummable. Delayed vibrato and portamento slides give it life.
2. **Arpeggio** — the chord rendered on a single oscillator whose pitch steps
   through the notes at frame rate: the iconic C64 shimmer.
3. **Bass + drums shared** — a driving bassline (root-8, octave-16 or a
   Hubbard-style running line) with a kick/snare backbeat and off-beat hats,
   all multiplexed onto one channel the way real SID composers did.

### The classic-game character

- **Modes**, not just major/minor: harmonic minor (dark/exotic), Dorian
  (chill groove), plus major — the palette behind Last Ninja-era tunes.
- **Pulse-width timbre**: narrow duty cycles (12.5%–25%) for the nasal,
  hollow C64 lead, via band-limited `PeriodicWave`s.
- Every tune derives from a **seed**, so it is fully reproducible.

## Development

```sh
npm install
npm run dev       # dev server
npx vitest run    # generator tests (determinism, scale membership, structure)
npm run build     # production build
```

## Roadmap (not in v1)

- Show/share seed, WAV export (OfflineAudioContext), true WASM reSID
  playback, more moods, live mixer.
