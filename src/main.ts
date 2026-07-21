import './style.css';
import { generateSong } from './generator/generate';
import type { GenerateOptions } from './generator/generate';
import type { LengthChoice, MoodName, TempoChoice } from './generator/moods';
import { Player } from './player/player';
import type { Song } from './core/types';
import { renderSongToWav } from './export/wav';
import { encodeShare, parseShare } from './share';

const MOOD_LABELS: Record<MoodName, string> = {
  hero: 'Hero',
  dark: 'Dark',
  bubbly: 'Bubbly',
  chill: 'Chill',
};

const state: GenerateOptions & { song: Song | null } = {
  mood: 'hero',
  tempo: 'mid',
  length: 'short',
  song: null,
};

const player = new Player();

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="screen">
    <h1>**** SIDMAKER ****</h1>
    <p class="subtitle">64K RAM SYSTEM &nbsp; 3 VOICES FREE</p>

    <div class="control-group">
      <div class="label">Mood:</div>
      <div class="options" id="mood">
        ${(Object.keys(MOOD_LABELS) as MoodName[])
          .map((m) => `<button data-value="${m}">${MOOD_LABELS[m]}</button>`)
          .join('')}
      </div>
    </div>

    <div class="control-group">
      <div class="label">Tempo:</div>
      <div class="options" id="tempo">
        <button data-value="slow">Slow</button>
        <button data-value="mid">Mid</button>
        <button data-value="fast">Fast</button>
      </div>
    </div>

    <div class="control-group">
      <div class="label">Length:</div>
      <div class="options" id="length">
        <button data-value="short">Short</button>
        <button data-value="long">Long</button>
      </div>
    </div>

    <div class="transport">
      <button id="generate">Generate</button>
      <button id="playstop">Play</button>
    </div>

    <div class="actions">
      <button id="export">Save WAV</button>
      <button id="copylink">Copy Link</button>
    </div>

    <div class="status" id="status">Ready.<span class="cursor"></span></div>
  </div>
`;

const selectors: Record<'mood' | 'tempo' | 'length', (value: string) => void> = {
  mood: () => {},
  tempo: () => {},
  length: () => {},
};

function setupOptionGroup(id: 'mood' | 'tempo' | 'length'): void {
  const group = document.getElementById(id)!;
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('button'));
  const select = (value: string) => {
    buttons.forEach((b) => b.classList.toggle('selected', b.dataset.value === value));
    if (id === 'mood') state.mood = value as MoodName;
    if (id === 'tempo') state.tempo = value as TempoChoice;
    if (id === 'length') state.length = value as LengthChoice;
  };
  buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.value!)));
  selectors[id] = select;
  select(state[id]);
}

setupOptionGroup('mood');
setupOptionGroup('tempo');
setupOptionGroup('length');

const statusEl = document.getElementById('status')!;
const playStopBtn = document.getElementById('playstop') as HTMLButtonElement;
const exportBtn = document.getElementById('export') as HTMLButtonElement;
const copyBtn = document.getElementById('copylink') as HTMLButtonElement;

function setStatus(text: string): void {
  // textContent (not innerHTML) so status text — including error messages and
  // share links — can never inject markup.
  statusEl.textContent = text;
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  statusEl.appendChild(cursor);
}

function describe(song: Song): string {
  const bars = song.lengthTicks / (song.ticksPerBeat * 4);
  return `${MOOD_LABELS[state.mood]} / ${song.bpm} BPM / ${bars} bars\nSeed ${song.seed}`;
}

function playSong(song: Song, prefix: string): void {
  player.play(song);
  playStopBtn.textContent = 'Stop';
  setStatus(`${prefix}\n${describe(song)}`);
}

document.getElementById('generate')!.addEventListener('click', () => {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  state.song = generateSong(seed, { mood: state.mood, tempo: state.tempo, length: state.length });
  playSong(state.song, 'Now playing:');
});

playStopBtn.addEventListener('click', () => {
  if (player.isPlaying) {
    player.stop();
    playStopBtn.textContent = 'Play';
    setStatus('Stopped. Press generate for a new tune.');
  } else if (state.song) {
    playSong(state.song, 'Now playing:');
  } else {
    setStatus('Nothing to play yet - press generate.');
  }
});

exportBtn.addEventListener('click', async () => {
  if (!state.song) {
    setStatus('Generate a tune first, then save it.');
    return;
  }
  const song = state.song;
  exportBtn.disabled = true;
  const wasPlaying = player.isPlaying;
  setStatus('Rendering WAV...');
  try {
    const blob = await renderSongToWav(song, 2);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sidmaker-${state.mood}-${song.seed}.wav`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    const kb = Math.round(blob.size / 1024);
    setStatus(`Saved sidmaker-${state.mood}-${song.seed}.wav (${kb} KB, 2 loops).`);
  } catch (err) {
    setStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    exportBtn.disabled = false;
    if (wasPlaying && !player.isPlaying) playSong(song, 'Now playing:');
  }
});

copyBtn.addEventListener('click', async () => {
  if (!state.song) {
    setStatus('Generate a tune first, then copy its link.');
    return;
  }
  const code = encodeShare({ mood: state.mood, tempo: state.tempo, length: state.length, seed: state.song.seed });
  const link = `${location.origin}${location.pathname}#${code}`;
  try {
    await navigator.clipboard.writeText(link);
    setStatus(`Link copied to clipboard:\n${link}`);
  } catch {
    location.hash = code;
    setStatus(`Link is in the address bar:\n${link}`);
  }
});

// Load a shared tune from the URL hash (set up but not auto-played — browsers
// block audio until the first click).
function loadFromHash(): void {
  const tune = parseShare(location.hash);
  if (!tune) return;
  selectors.mood(tune.mood);
  selectors.tempo(tune.tempo);
  selectors.length(tune.length);
  state.song = generateSong(tune.seed, { mood: tune.mood, tempo: tune.tempo, length: tune.length });
  playStopBtn.textContent = 'Play';
  setStatus(`Loaded a shared tune - press play.\n${describe(state.song)}`);
}

loadFromHash();
