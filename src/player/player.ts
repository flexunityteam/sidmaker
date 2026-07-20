import type { Instrument, NoteEvent, Song } from '../core/types';

export type AudioContextFactory = () => AudioContext;

/**
 * Web Audio playback engine. Knows nothing about music theory — it just
 * schedules NoteEvents with a standard lookahead loop and loops the song.
 *
 * Teardown is deterministic: every scheduled source node is tracked and
 * stopped on the audio clock in stop(), with no reliance on wall-clock
 * timers. The master/filter graph is created once and reused, so stopping
 * and re-generating can never leave a previous song audible.
 */
export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private song: Song | null = null;
  private timer: number | null = null;
  /** AudioContext time corresponding to tick 0 of the current loop pass */
  private loopStartTime = 0;
  private nextEventIndex = 0;
  private sortedEvents: Array<NoteEvent & { trackInstrument: Instrument }> = [];
  /** Every source scheduled for the current song, so stop() can silence all. */
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

    // Restore master gain (stop() ramps it to 0 to de-click).
    if (this.master) {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setValueAtTime(Player.MASTER_GAIN, ctx.currentTime);
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

    // Short de-click fade on the master, then hard-stop every source on the
    // audio clock. No wall-clock setTimeout: teardown is immediate and cannot
    // be delayed by tab throttling or CPU load.
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
        // Source already stopped/ended — nothing to do.
      }
    }
    this.activeSources.clear();
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.createAudioContext();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.master = this.ctx.createGain();
      this.master.gain.value = Player.MASTER_GAIN;
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 9000;
      this.filter.connect(this.master);
      this.master.connect(this.ctx.destination);
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
    const { ctx, song } = this;
    if (!ctx || !song) return;
    const LOOKAHEAD = 0.12;
    const spt = this.secondsPerTick(song);
    const horizon = ctx.currentTime + LOOKAHEAD;

    while (true) {
      if (this.nextEventIndex >= this.sortedEvents.length) {
        // Wrap to the next loop pass
        this.loopStartTime += song.lengthTicks * spt;
        this.nextEventIndex = 0;
      }
      const event = this.sortedEvents[this.nextEventIndex];
      const startTime = this.loopStartTime + event.tick * spt;
      if (startTime > horizon) break;
      this.nextEventIndex++;
      if (startTime < ctx.currentTime - 0.02) continue; // too late, skip
      this.scheduleNote(event, event.trackInstrument, startTime, event.durationTicks * spt);
    }
  }

  private scheduleNote(event: NoteEvent, trackInstrument: Instrument, time: number, duration: number): void {
    const ctx = this.ctx;
    const filter = this.filter;
    if (!ctx || !filter) return;
    const instrument = event.instrument ?? trackInstrument;

    const envelope = ctx.createGain();
    envelope.connect(filter);
    this.applyAdsr(envelope, instrument, event.velocity, time, duration);

    const stopTime = time + duration + instrument.adsr.r + 0.05;
    let source: AudioScheduledSourceNode;
    if (instrument.waveform === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      src.connect(envelope);
      source = src;
    } else {
      const osc = ctx.createOscillator();
      osc.type = instrument.waveform === 'pulse' ? 'square' : instrument.waveform;
      const freq = midiToFreq(event.midiNote);
      osc.frequency.setValueAtTime(freq, time);
      // Chip-style kick: short envelope at low pitch gets a downward sweep
      if (instrument.adsr.s === 0 && event.midiNote < 45) {
        osc.frequency.setValueAtTime(freq * 3, time);
        osc.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
      }
      osc.connect(envelope);
      source = osc;
    }

    this.activeSources.add(source);
    source.addEventListener('ended', () => {
      this.activeSources.delete(source);
      envelope.disconnect();
    });
    source.start(time);
    source.stop(stopTime);
  }

  private applyAdsr(envelope: GainNode, instrument: Instrument, velocity: number, time: number, duration: number): void {
    const { a, d, s, r } = instrument.adsr;
    const peak = instrument.gain * velocity;
    const g = envelope.gain;
    g.setValueAtTime(0, time);
    g.linearRampToValueAtTime(peak, time + a);
    g.linearRampToValueAtTime(peak * s, time + a + d);
    const releaseStart = Math.max(time + a + d, time + duration);
    g.setValueAtTime(peak * s, releaseStart);
    g.linearRampToValueAtTime(0, releaseStart + r);
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}

export function midiToFreq(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}
