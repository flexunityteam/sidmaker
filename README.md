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
- **Synth** (`src/player/synth.ts`) turns instruments and notes into Web Audio
  voices. It works against any `BaseAudioContext`, so the exact same sound
  plays live and renders offline.
- **Player** (`src/player/player.ts`) drives the synth in realtime: a
  lookahead scheduler, looping, and deterministic teardown.
- **Exporter** (`src/export/wav.ts`) drives the same synth through an
  `OfflineAudioContext` and encodes the result as a WAV file.
- **`Song`** (`src/core/types.ts`) is the seam between them; a future
  bit-exact WASM SID player (reSID) can consume the same data structure.

## Saving and sharing

- **Save WAV** renders the current tune (2 loops) to a `.wav` file you can
  download and keep.
- **Copy Link** copies a short URL like `…/#hero.mid.short.1a2b3c`. Opening it
  regenerates the exact same tune — the share code is just the mood, tempo,
  length and seed.

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

## Roadmap

- MP3 export (needs an encoder library), true WASM reSID playback, more
  moods, a live mixer, and a seed input box.
