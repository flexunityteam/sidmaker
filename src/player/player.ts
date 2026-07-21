import type { Instrument, NoteEvent, Song } from '../core/types';
import { connectFilterSweep, createNoiseBuffer, midiToFreq, scheduleArp, scheduleTone, swingDelaySeconds } from './synth';
import type { SynthTargets } from './synth';

export type AudioContextFactory = () => AudioContext;

/**
 * Realtime playback engine. Schedules NoteEvents with a standard lookahead
 * loop and loops the song. Voice synthesis lives in ./synth so the exact same
 * sound renders live here and offline in the WAV exporter.
 *
 * Teardown is deterministic: every scheduled source is tracked and stopped on
 * the audio clock in stop(), with no reliance on wall-clock timers, so a new
 * song can never leave a previous one audible.
 */
export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private synth: SynthTargets | null = null;

  private song: Song | null = null;
  private timer: number | null = null;
  private loopStartTime = 0;
  private nextEventIndex = 0;
  private sortedEvents: Array<NoteEvent & { trackInstrument: Instrument }> = [];
  private activeSources = new Set<AudioScheduledSourceNode>();
  private createAudioContext: AudioContextFactory;

  constructor(createAudioContext: AudioContextFactory = () => new AudioContext()) {
    this.createAudioContext = createAudioContext;
  }

  private static readonly MASTER_GAIN = 0.9;

  get isPlaying(): boolean {
    return this.timer !== null;
  }

  play(song: Song): void {
    this.stop();
    const ctx = this.ensureContext();
    this.song = song;

    this.sortedEvents = song.tracks
      .flatMap((track) => track.events.map((e) => ({ ...e, trackInstrument: track.instrument })))
      .sort((a, b) => a.tick - b.tick);

    if (this.master) {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setValueAtTime(Player.MASTER_GAIN, ctx.currentTime);
    }

    // Fresh filter sweep for this song; tracked so stop() tears it down.
    if (this.filter) {
      const lfo = connectFilterSweep(ctx, this.filter, song.filter, ctx.currentTime);
      if (lfo) {
        this.activeSources.add(lfo);
        lfo.addEventListener('ended', () => this.activeSources.delete(lfo));
      }
    }

    this.loopStartTime = ctx.currentTime + 0.1;
    this.nextEventIndex = 0;
    this.timer = setInterval(() => this.scheduleAhead(), 25) as unknown as number;
    this.scheduleAhead();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.song = null;

    const ctx = this.ctx;
    const now = ctx ? ctx.currentTime : 0;
    if (this.master && ctx) {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.02);
    }
    const cut = now + 0.03;
    for (const src of this.activeSources) {
      try {
        src.stop(cut);
      } catch {
        // Already stopped/ended.
      }
    }
    this.activeSources.clear();
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const ctx = this.createAudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = Player.MASTER_GAIN;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 9000;
      this.filter.connect(this.master);
      this.master.connect(ctx.destination);
      this.synth = {
        ctx,
        destination: this.filter,
        noiseBuffer: createNoiseBuffer(ctx),
        pulseWaves: new Map(),
        onSource: (src) => {
          this.activeSources.add(src);
          src.addEventListener('ended', () => this.activeSources.delete(src));
        },
      };
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private secondsPerTick(song: Song): number {
    return 60 / song.bpm / song.ticksPerBeat;
  }

  private scheduleAhead(): void {
    const { ctx, song, synth } = this;
    if (!ctx || !song || !synth) return;
    const LOOKAHEAD = 0.12;
    const spt = this.secondsPerTick(song);
    const horizon = ctx.currentTime + LOOKAHEAD;

    while (true) {
      if (this.nextEventIndex >= this.sortedEvents.length) {
        this.loopStartTime += song.lengthTicks * spt;
        this.nextEventIndex = 0;
      }
      const event = this.sortedEvents[this.nextEventIndex];
      const startTime =
        this.loopStartTime + event.tick * spt + swingDelaySeconds(event.tick, spt, song.ticksPerBeat, song.swing);
      if (startTime > horizon) break;
      this.nextEventIndex++;
      if (startTime < ctx.currentTime - 0.02) continue;
      const instrument = event.instrument ?? event.trackInstrument;
      const duration = event.durationTicks * spt;
      if (event.arpNotes && event.arpNotes.length > 0 && instrument.arpRateHz) {
        scheduleArp(synth, instrument, event.arpNotes, event.velocity, startTime, duration);
      } else {
        scheduleTone(synth, instrument, event.midiNote, event.velocity, startTime, duration, event.glideFromMidi);
      }
    }
  }
}

export { midiToFreq };
