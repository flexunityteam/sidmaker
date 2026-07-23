import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Player } from './player';
import { generateSong } from '../generator/generate';

/**
 * Minimal fake Web Audio graph. Records every source node and whether it was
 * explicitly stopped, so we can assert deterministic teardown without a real
 * AudioContext.
 */
function fakeParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

class FakeSource {
  started = false;
  stopCalled = false;
  frequency = fakeParam();
  detune = fakeParam();
  buffer: unknown = null;
  loop = false;
  type = '';
  private listeners: Record<string, Array<() => void>> = {};
  connect() {}
  disconnect() {}
  setPeriodicWave() {}
  start() {
    this.started = true;
  }
  stop() {
    if (this.stopCalled) throw new DOMException('already stopped');
    this.stopCalled = true;
  }
  addEventListener(name: string, cb: () => void) {
    (this.listeners[name] ??= []).push(cb);
  }
}

class FakeCtx {
  currentTime = 0;
  sampleRate = 44100;
  state = 'running';
  destination = {};
  createdSources: FakeSource[] = [];
  resume = vi.fn();
  createGain() {
    return { gain: fakeParam(), connect() {}, disconnect() {} };
  }
  createBiquadFilter() {
    return { type: '', frequency: fakeParam(), connect() {}, disconnect() {} };
  }
  createDelay() {
    return { delayTime: fakeParam(), connect() {}, disconnect() {} };
  }
  createDynamicsCompressor() {
    return {
      threshold: fakeParam(),
      knee: fakeParam(),
      ratio: fakeParam(),
      attack: fakeParam(),
      release: fakeParam(),
      connect() {},
      disconnect() {},
    };
  }
  createOscillator() {
    const s = new FakeSource();
    this.createdSources.push(s);
    return s;
  }
  createBufferSource() {
    const s = new FakeSource();
    this.createdSources.push(s);
    return s;
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(this.sampleRate) };
  }
  createPeriodicWave() {
    return {} as PeriodicWave;
  }
}

describe('Player teardown', () => {
  let ctx: FakeCtx;
  let player: Player;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new FakeCtx();
    player = new Player(() => ctx as unknown as AudioContext);
  });

  const song = () => generateSong(1, { mood: 'hero', tempo: 'mid', length: 'short' });

  it('stop() explicitly stops every scheduled source (no lingering audio)', () => {
    player.play(song());
    expect(ctx.createdSources.length).toBeGreaterThan(0);

    player.stop();

    for (const src of ctx.createdSources) {
      expect(src.stopCalled, 'every scheduled source must be stopped').toBe(true);
    }
    expect(player.isPlaying).toBe(false);
  });

  it('play() again stops the previous songs sources (no overlap)', () => {
    player.play(song());
    const firstBatch = [...ctx.createdSources];
    expect(firstBatch.length).toBeGreaterThan(0);

    player.play(song());

    for (const src of firstBatch) {
      expect(src.stopCalled, 'previous song sources must be stopped before new song').toBe(true);
    }
  });

  it('does not rely on wall-clock timers for teardown', () => {
    player.play(song());
    const batch = [...ctx.createdSources];
    player.stop();
    // Everything must already be stopped synchronously, before any timer fires.
    expect(batch.every((s) => s.stopCalled)).toBe(true);
    vi.runOnlyPendingTimers(); // draining timers must not be required for silence
  });
});
