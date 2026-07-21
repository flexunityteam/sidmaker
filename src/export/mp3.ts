import { Mp3Encoder } from '@breezystack/lamejs';
import type { PcmSource } from './wav';

/** Encode mono PCM audio as an MP3 blob (bundled encoder, no network). */
export function encodeMp3(buffer: PcmSource, kbps = 160): Blob {
  const channel = buffer.getChannelData(0);
  const samples = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i++) {
    const s = Math.max(-1, Math.min(1, channel[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const encoder = new Mp3Encoder(1, buffer.sampleRate, kbps);
  const blockSize = 1152; // MP3 frame size
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += blockSize) {
    const block = samples.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(block);
    if (encoded.length > 0) chunks.push(encoded);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}
