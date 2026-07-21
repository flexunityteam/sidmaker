import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';
import type { PcmSource } from './wav';

function fakeBuffer(samples: number[], sampleRate = 44100): PcmSource {
  const data = Float32Array.from(samples);
  return {
    numberOfChannels: 1,
    length: data.length,
    sampleRate,
    getChannelData: () => data,
  };
}

function readStr(view: DataView, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe('encodeWav', () => {
  it('produces a valid mono 16-bit PCM WAV header', async () => {
    const blob = encodeWav(fakeBuffer([0, 0.5, -0.5, 1, -1]));
    const view = new DataView(await blob.arrayBuffer());

    expect(readStr(view, 0, 4)).toBe('RIFF');
    expect(readStr(view, 8, 4)).toBe('WAVE');
    expect(readStr(view, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(44100); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(readStr(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(5 * 2); // 5 samples * 2 bytes
    expect(blob.size).toBe(44 + 5 * 2);
    expect(blob.type).toBe('audio/wav');
  });

  it('clamps and quantises samples to int16', async () => {
    const blob = encodeWav(fakeBuffer([1, -1, 0, 2, -2]));
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getInt16(44, true)).toBe(0x7fff); // +1 full scale
    expect(view.getInt16(46, true)).toBe(-0x8000); // -1 full scale
    expect(view.getInt16(48, true)).toBe(0); // silence
    expect(view.getInt16(50, true)).toBe(0x7fff); // +2 clamped
    expect(view.getInt16(52, true)).toBe(-0x8000); // -2 clamped
  });
});
