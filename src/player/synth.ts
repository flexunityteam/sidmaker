import type { Instrument } from '../core/types';

/**
 * Voice synthesis, shared by the realtime Player and the offline WAV exporter.
 * Works against any BaseAudioContext, so the same SID-style sound renders both
 * live and into a file.
 */
export interface SynthTargets {
  ctx: BaseAudioContext;
  /** Node that voices connect into (e.g. a shared lowpass filter). */
  destination: AudioNode;
  noiseBuffer: AudioBuffer;
  /** Duty-cycle -> band-limited pulse wave, cached per context. */
  pulseWaves: Map<number, PeriodicWave>;
  /**
   * Called for every scheduled source. The realtime Player uses it to track
   * sources for deterministic teardown; the offline exporter omits it.
   */
  onSource?: (src: AudioScheduledSourceNode) => void;
}

export function midiToFreq(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Seconds to push a note late for swing: off-beat sixteenths get delayed by
 * `swing` of a sixteenth, on-beat ones are untouched. Shared by live playback
 * and the offline exporter so a rendered file grooves like what you hear.
 */
export function swingDelaySeconds(
  tick: number,
  secondsPerTick: number,
  ticksPerBeat: number,
  swing: number,
): number {
  if (swing <= 0) return 0;
  const sixteenthTicks = ticksPerBeat / 4;
  const position = Math.round(tick / sixteenthTicks);
  return position % 2 === 1 ? swing * sixteenthTicks * secondsPerTick : 0;
}

export function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Band-limited pulse wave for a given duty cycle, cached per duty. */
export function getPulseWave(ctx: BaseAudioContext, cache: Map<number, PeriodicWave>, duty: number): PeriodicWave {
  const key = Math.max(1, Math.min(99, Math.round(duty * 100)));
  let wave = cache.get(key);
  if (!wave) {
    const harmonics = 32;
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);
    const d = key / 100;
    for (let n = 1; n <= harmonics; n++) {
      real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
    }
    wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    cache.set(key, wave);
  }
  return wave;
}

function applyAdsr(envelope: GainNode, instrument: Instrument, velocity: number, time: number, duration: number): void {
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

function setWaveform(t: SynthTargets, osc: OscillatorNode, instrument: Instrument): void {
  if (instrument.waveform === 'pulse') {
    osc.setPeriodicWave(getPulseWave(t.ctx, t.pulseWaves, instrument.pulseWidth ?? 0.5));
  } else {
    osc.type = instrument.waveform === 'noise' ? 'square' : instrument.waveform;
  }
}

function attachVibrato(t: SynthTargets, osc: OscillatorNode, instrument: Instrument, time: number, stopTime: number): void {
  const vib = instrument.vibrato;
  if (!vib) return;
  const lfo = t.ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = vib.rateHz;
  const depth = t.ctx.createGain();
  depth.gain.setValueAtTime(0, time);
  depth.gain.setValueAtTime(0, time + vib.delaySec);
  depth.gain.linearRampToValueAtTime(vib.depthCents, time + vib.delaySec + 0.08);
  lfo.connect(depth);
  depth.connect(osc.detune);
  lfo.start(time);
  lfo.stop(stopTime);
  t.onSource?.(lfo);
}

/** A single note: pulse/triangle/saw or noise, with optional vibrato and glide. */
export function scheduleTone(
  t: SynthTargets,
  instrument: Instrument,
  midiNote: number,
  velocity: number,
  time: number,
  duration: number,
  glideFrom?: number,
): void {
  const envelope = t.ctx.createGain();
  envelope.connect(t.destination);
  applyAdsr(envelope, instrument, velocity, time, duration);
  const stopTime = time + duration + instrument.adsr.r + 0.05;

  let source: AudioScheduledSourceNode;
  if (instrument.waveform === 'noise') {
    const src = t.ctx.createBufferSource();
    src.buffer = t.noiseBuffer;
    src.loop = true;
    src.connect(envelope);
    source = src;
  } else {
    const osc = t.ctx.createOscillator();
    setWaveform(t, osc, instrument);
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
    attachVibrato(t, osc, instrument, time, stopTime);
    osc.connect(envelope);
    source = osc;
  }

  source.addEventListener('ended', () => envelope.disconnect());
  source.start(time);
  source.stop(stopTime);
  t.onSource?.(source);
}

/**
 * Frame-rate arpeggio on one oscillator whose pitch steps through the chord
 * — the signature C64 "chord on a single voice" shimmer.
 */
export function scheduleArp(
  t: SynthTargets,
  instrument: Instrument,
  arpNotes: number[],
  velocity: number,
  time: number,
  duration: number,
): void {
  const envelope = t.ctx.createGain();
  envelope.connect(t.destination);
  applyAdsr(envelope, instrument, velocity, time, duration);
  const stopTime = time + duration + instrument.adsr.r + 0.03;

  const osc = t.ctx.createOscillator();
  setWaveform(t, osc, instrument);
  const frame = 1 / (instrument.arpRateHz ?? 40);
  const frames = Math.max(1, Math.ceil(duration / frame));
  for (let k = 0; k < frames; k++) {
    osc.frequency.setValueAtTime(midiToFreq(arpNotes[k % arpNotes.length]), time + k * frame);
  }
  osc.connect(envelope);
  osc.addEventListener('ended', () => envelope.disconnect());
  osc.start(time);
  osc.stop(stopTime);
  t.onSource?.(osc);
}
