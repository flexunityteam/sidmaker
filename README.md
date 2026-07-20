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

1. **Lead** — pulse-wave melody
2. **Arpeggio** — chords as fast broken notes (the iconic C64 shimmer)
3. **Bass + drums shared** — bass roots between kick/snare hits, the way
   real SID composers multiplexed one channel

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
