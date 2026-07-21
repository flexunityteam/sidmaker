import { describe, expect, it } from 'vitest';
import { encodeMp3 } from './mp3';
import type { PcmSource } from './wav';

function sineBuffer(samples: number, sampleRate = 44100): PcmSource {
  const data = new Float32Array(samples);
  for (let i = 0; i < samples; i++) data[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  return { numberOfChannels: 1, length: samples, sampleRate, getChannelData: () => data };
}

describe('encodeMp3', () => {
  it('produces a non-empty MP3 blob starting with a frame sync', async () => {
    const blob = encodeMp3(sineBuffer(8192), 128);
    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBeGreaterThan(0);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0xff); // MP3 frames begin with 0xFF sync
    expect((bytes[1] & 0xe0) === 0xe0).toBe(true);
  });

  it('a higher bitrate yields a larger file for the same audio', () => {
    const buf = sineBuffer(44100);
    expect(encodeMp3(buf, 320).size).toBeGreaterThan(encodeMp3(buf, 96).size);
  });
});
