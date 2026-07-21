import type { Song } from '../core/types';
import { createNoiseBuffer, scheduleArp, scheduleTone } from '../player/synth';
import type { SynthTargets } from '../player/synth';

/** Minimal shape of an AudioBuffer, so the encoder is testable without one. */
export interface PcmSource {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

/** Encode PCM audio as a 16-bit little-endian WAV blob. */
export function encodeWav(buffer: PcmSource): Blob {
  const numCh = buffer.numberOfChannels;
  const { length, sampleRate } = buffer;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = length * blockAlign;

  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numCh; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

/**
 * Render a Song to raw audio by scheduling every event once per loop into an
 * OfflineAudioContext and rendering faster than realtime. Uses the same synth
 * as live playback, so the output sounds identical to what you hear. The
 * resulting AudioBuffer feeds both the WAV and MP3 encoders.
 */
export async function renderSong(song: Song, loops = 2, sampleRate = 44100): Promise<AudioBuffer> {
  const secondsPerTick = 60 / song.bpm / song.ticksPerBeat;
  const loopSec = song.lengthTicks * secondsPerTick;
  const lead = 0.02; // tiny head start so nothing clicks at t=0
  const tail = 0.4; // let final release ring out
  const totalSec = lead + loopSec * loops + tail;

  const ctx = new OfflineAudioContext(1, Math.ceil(totalSec * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 9000;
  filter.connect(master);
  master.connect(ctx.destination);

  const targets: SynthTargets = {
    ctx,
    destination: filter,
    noiseBuffer: createNoiseBuffer(ctx),
    pulseWaves: new Map(),
  };

  const flat = song.tracks.flatMap((track) => track.events.map((event) => ({ event, trackInstrument: track.instrument })));
  for (let loop = 0; loop < loops; loop++) {
    const base = lead + loop * loopSec;
    for (const { event, trackInstrument } of flat) {
      const instrument = event.instrument ?? trackInstrument;
      const time = base + event.tick * secondsPerTick;
      const duration = event.durationTicks * secondsPerTick;
      if (event.arpNotes && event.arpNotes.length > 0 && instrument.arpRateHz) {
        scheduleArp(targets, instrument, event.arpNotes, event.velocity, time, duration);
      } else {
        scheduleTone(targets, instrument, event.midiNote, event.velocity, time, duration, event.glideFromMidi);
      }
    }
  }

  return ctx.startRendering();
}

/** Render a Song straight to a WAV blob. */
export async function renderSongToWav(song: Song, loops = 2, sampleRate = 44100): Promise<Blob> {
  return encodeWav(await renderSong(song, loops, sampleRate));
}
