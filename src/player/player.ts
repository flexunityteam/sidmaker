import type { Instrument, NoteEvent, Song } from '../core/types';

export type AudioContextFactory = () => AudioContext;

/**
 * Web Audio playback engine. Knows nothing about music theory — it just
 * schedules NoteEvents with a standard lookahead loop and loops the song.
 *
 * Synthesis aims for the classic SID character: pulse voices with a real duty
 * cycle, delayed vibrato on leads, portamento slides, and frame-rate chord
 * arpeggios rendered on a single stepping oscillator.
 *
 * Teardown is deterministic: every scheduled source is tracked and stopped on
 * the audio clock in stop(), with no reliance on wall-clock timers, so a new
 * song can never leave a previous one audible.
 */
export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private pulseWaves = new Map<number, PeriodicWave>();

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
        this.loopStartTime += song.lengthTicks * spt;
        this.nextEventIndex = 0;
      }
      const event = this.sortedEvents[this.nextEventIndex];
      const startTime = this.loopStartTime + event.tick * spt;
      if (startTime > horizon) break;
      this.nextEventIndex++;
      if (startTime < ctx.currentTime - 0.02) continue;
      this.scheduleEvent(event, event.trackInstrument, startTime, event.durationTicks * spt);
    }
  }

  private scheduleEvent(event: NoteEvent, trackInstrument: Instrument, time: number, duration: number): void {
    const instrument = event.instrument ?? trackInstrument;
    if (event.arpNotes && event.arpNotes.length > 0 && instrument.arpRateHz) {
      this.scheduleArp(instrument, event.arpNotes, event.velocity, time, duration);
    } else {
      this.scheduleTone(instrument, event.midiNote, event.velocity, time, duration, event.glideFromMidi);
    }
  }

  /** A single note: pulse/triangle/saw or noise, with optional vibrato and glide. */
  private scheduleTone(
    instrument: Instrument,
    midiNote: number,
    velocity: number,
    time: number,
    duration: number,
    glideFrom?: number,
  ): void {
    const ctx = this.ctx;
    const filter = this.filter;
    if (!ctx || !filter) return;

    const envelope = ctx.createGain();
    envelope.connect(filter);
    this.applyAdsr(envelope, instrument, velocity, time, duration);
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
      this.setWaveform(osc, instrument);
      const freq = midiToFreq(midiNote);
      if (instrument.adsr.s === 0 && midiNote < 45) {
        // Chip-style kick: short envelope at low pitch gets a downward sweep.
        osc.frequency.setValueAtTime(freq * 3, time);
        osc.frequency.exponentialRampToValueAtTime(freq, time + 0.06);
      } else if (glideFrom != null) {
        osc.frequency.setValueAtTime(midiToFreq(glideFrom), time);
        osc.frequency.exponentialRampToValueAtTime(freq, time + Math.min(0.06, duration * 0.4));
      } else {
        osc.frequency.setValueAtTime(freq, time);
      }
      if (instrument.vibrato) this.attachVibrato(osc, instrument, time, stopTime);
      osc.connect(envelope);
      source = osc;
    }

    this.trackSource(source, envelope, time, stopTime);
  }

  /**
   * Frame-rate arpeggio on one oscillator whose pitch steps through the chord
   * — the signature C64 "chord on a single voice" shimmer.
   */
  private scheduleArp(
    instrument: Instrument,
    arpNotes: number[],
    velocity: number,
    time: number,
    duration: number,
  ): void {
    const ctx = this.ctx;
    const filter = this.filter;
    if (!ctx || !filter) return;

    const envelope = ctx.createGain();
    envelope.connect(filter);
    this.applyAdsr(envelope, instrument, velocity, time, duration);
    const stopTime = time + duration + instrument.adsr.r + 0.03;

    const osc = ctx.createOscillator();
    this.setWaveform(osc, instrument);
    const frame = 1 / (instrument.arpRateHz ?? 40);
    const frames = Math.max(1, Math.ceil(duration / frame));
    for (let k = 0; k < frames; k++) {
      osc.frequency.setValueAtTime(midiToFreq(arpNotes[k % arpNotes.length]), time + k * frame);
    }
    osc.connect(envelope);
    this.trackSource(osc, envelope, time, stopTime);
  }

  private setWaveform(osc: OscillatorNode, instrument: Instrument): void {
    if (instrument.waveform === 'pulse') {
      osc.setPeriodicWave(this.getPulseWave(instrument.pulseWidth ?? 0.5));
    } else {
      osc.type = instrument.waveform === 'noise' ? 'square' : instrument.waveform;
    }
  }

  private attachVibrato(osc: OscillatorNode, instrument: Instrument, time: number, stopTime: number): void {
    const ctx = this.ctx;
    const vib = instrument.vibrato;
    if (!ctx || !vib) return;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = vib.rateHz;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, time);
    depth.gain.setValueAtTime(0, time + vib.delaySec);
    depth.gain.linearRampToValueAtTime(vib.depthCents, time + vib.delaySec + 0.08);
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start(time);
    lfo.stop(stopTime);
    this.activeSources.add(lfo);
    lfo.addEventListener('ended', () => this.activeSources.delete(lfo));
  }

  private trackSource(source: AudioScheduledSourceNode, envelope: GainNode, time: number, stopTime: number): void {
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

  /** Band-limited pulse wave for a given duty cycle, cached per duty. */
  private getPulseWave(duty: number): PeriodicWave {
    const ctx = this.ctx!;
    const key = Math.max(1, Math.min(99, Math.round(duty * 100)));
    let wave = this.pulseWaves.get(key);
    if (!wave) {
      const harmonics = 32;
      const real = new Float32Array(harmonics + 1);
      const imag = new Float32Array(harmonics + 1);
      const d = key / 100;
      for (let n = 1; n <= harmonics; n++) {
        real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
      }
      wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
      this.pulseWaves.set(key, wave);
    }
    return wave;
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
