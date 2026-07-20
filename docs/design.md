# SIDMAKER — v1 design

Date: 2026-07-20. Design validated through a brainstorming session.

## Goal

A browser toy that generates random C64/SID-style chip music from simple
choices, usable by someone with zero music knowledge.

## Decisions

- **Platform:** web app, Web Audio API with SID-*like* synthesis (3 voices,
  pulse/triangle/sawtooth/noise). Upgrade path to bit-exact WASM reSID later
  via the clean `Song` data format.
- **Controls (v1):** mood presets (Hero, Dark, Bubbly, Chill) + tempo
  (slow/mid/fast) + length (short/long) + a Generate button.
- **Scope (v1):** listen and re-generate only. No export, no storage, no
  server. Static Vite + TypeScript app.
- **Determinism:** seeded RNG from the start (same seed → same song), not
  yet exposed in the UI. Makes "save favorite" and shareable URLs cheap later.

## How generation works

1. Mood → scale (major/minor), BPM range, instrument palette, drum density.
2. Chord progression picked from a curated pool of proven progressions —
   this is what makes the output *sound like music* rather than noise.
3. Bass follows chord roots (eighth notes, optional octave jumps).
4. Melody: rhythm templates + stepwise random walk over scale degrees,
   landing on chord tones at bar boundaries; phrases repeat (A A B A feel)
   with regenerated cadence bars.
5. Arpeggio voice plays the current chord as fast broken notes.
6. Drums (kick = pitch-swept triangle, snare = noise burst) share voice 3
   with the bass, like real SID tunes.
7. Structure: intro (2 bars, no drums/melody) → main loop → seamless loop.

## Architecture

```
[UI]  →  [Generator (pure music theory)]  →  Song (plain data)  →  [Player (pure Web Audio)]
```

`generateSong(seed, options) => Song` is pure and fully covered by vitest
tests (determinism, scale membership, structural invariants). The Player
uses a 25 ms lookahead scheduler against `AudioContext.currentTime`.

## Out of scope for v1

Seed display/sharing, WAV export (OfflineAudioContext), WASM reSID player,
more moods, live mixing, accounts/persistence of any kind.
