# SIDMAKER

A browser-based C64/SID-style chiptune generator. Pick a mood, tempo and
length, press **Generate**, and get a new procedurally generated tune every
time. No music knowledge required — music theory is encoded as rules (scales,
modes, curated chord progressions, motif and rhythm templates) and a seeded
RNG picks within those rules, so every tune is random yet musical.

**Live:** https://sidmaker.pages.dev/ (also https://flexunityteam.github.io/sidmaker/)

## What you can do

- **Generate** endless tunes across **7 moods** — Hero, Dark, Bubbly, Chill,
  Boss, Title, Aqua — each with its own scale, tempo range and character.
- **Save WAV** / **Save MP3** — render the current tune (2 loops) to a file.
- **Copy Link** — a short URL like `…/#hero.mid.short.1a2b3c` that regenerates
  the exact same tune (the code is just mood, tempo, length and seed).
- **Load box** — paste a share link, a bare seed, *or any URL/text* (a YouTube
  link, a song title, a name). Anything that isn't a share code/seed is hashed
  into a seed, so the same text always gives the same tune. (It does **not**
  transcribe a linked song — it just derives a unique chiptune from the text.)
- **Prev / Next** — step back through tunes you generated this session.

## The sound

Like the real SID chip, only three voices play at once:

1. **Lead** — a pulse/triangle/saw melody built from motifs laid out A A B B
   (a recognisable hook plus an answering phrase), walked on a pentatonic
   ladder so it stays hummable. Delayed vibrato and portamento slides.
2. **Arpeggio** — the chord rendered on a single oscillator whose pitch steps
   through the notes at frame rate: the iconic C64 shimmer.
3. **Bass + drums shared** — a driving bassline (root-8, octave-16 or a
   Hubbard-style running line) with a kick/snare-or-clap backbeat, off-beat
   hats and snare/tom fills, all multiplexed onto one channel.

What makes tunes differ and feel like real game music:

- **Modes**, not just major/minor: harmonic minor, Dorian, Phrygian, Lydian.
- **A/B song form** with its own melody per section; on long songs a **drum
  breakdown** on the B bridge, and sometimes a **key change** into the bridge
  that returns home so the loop still joins seamlessly.
- **Swing**, **pulse-width timbre** (band-limited `PeriodicWave`s), and a slow
  **low-pass filter sweep** for movement.
- Per seed, the drum pattern, arp shape, bass style, motifs and progression are
  all chosen, so different seeds sound genuinely different — not just transposed.

## Architecture

```
[UI]  →  [Generator (pure music theory)]  →  Song (plain data)  →  [Synth (Web Audio)]
                                                                    ├─ Player   (realtime)
                                                                    └─ Exporter (offline → WAV/MP3)
```

- **Generator** (`src/generator/`) knows music theory, nothing about audio.
  `generateSong(seed, options)` is pure and deterministic.
- **Synth** (`src/player/synth.ts`) turns instruments and notes into Web Audio
  voices against any `BaseAudioContext`, so the same sound plays live and
  renders offline.
- **Player** (`src/player/player.ts`) drives the synth in realtime: a lookahead
  scheduler, looping, swing, filter sweep, and deterministic teardown.
- **Exporter** (`src/export/`) drives the same synth through an
  `OfflineAudioContext`; `wav.ts` encodes WAV, `mp3.ts` encodes MP3
  (`@breezystack/lamejs`, bundled — no network).
- **`Song`** (`src/core/types.ts`) is the seam; a future bit-exact WASM SID
  player (reSID) could consume the same structure.

## Visitor counter

`functions/count.js` is a Cloudflare Pages Function backed by a KV namespace
(`GET /count` increments, `?peek` reads). The page shows "visitors", counting
each browser once per day. Visit analytics also run via cookieless Cloudflare
Web Analytics (beacon in `index.html`).

## Development

```sh
npm install
npm run dev       # dev server
npx vitest run    # tests: determinism, scale membership, variety, encoders, share
npm run build     # production build (tsc + vite)
```

## Deployment

Push to `main` auto-deploys to both hosts:

- **Cloudflare Pages** → `sidmaker.pages.dev` via `.github/workflows/cloudflare-pages.yml`
  (config-driven `wrangler.toml`, which also carries the `/count` Function and
  its KV binding).
- **GitHub Pages** → `flexunityteam.github.io/sidmaker` via `.github/workflows/deploy.yml`.

Vite `base: './'` keeps asset paths relative so both subpaths work.

## Roadmap ideas

True WASM reSID playback, a live mixer, saving favourites permanently, an
auto-play/shuffle mode. The original v1 design is in `docs/design.md`.
