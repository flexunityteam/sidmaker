import './style.css';
import { generateSong } from './generator/generate';
import type { GenerateOptions } from './generator/generate';
import type { LengthChoice, MoodName, TempoChoice } from './generator/moods';
import { Player } from './player/player';
import type { Song } from './core/types';
import { encodeWav, renderSong } from './export/wav';
import { encodeMp3 } from './export/mp3';
import { encodeShare, parseShare, parseTuneInput } from './share';

const MOOD_LABELS: Record<MoodName, string> = {
  hero: 'Hero',
  dark: 'Dark',
  bubbly: 'Bubbly',
  chill: 'Chill',
  boss: 'Boss',
  title: 'Title',
  aqua: 'Aqua',
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
    <div class="crt"></div>
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
      <button id="export-wav">Save WAV</button>
      <button id="export-mp3">Save MP3</button>
      <button id="copylink">Copy Link</button>
    </div>

    <div class="load-row">
      <input id="seedinput" type="text" placeholder="Paste a seed, link, or any URL" spellcheck="false" autocomplete="off" />
      <button id="loadbtn">Load</button>
    </div>

    <div class="history">
      <button id="prev">&#9664; Prev</button>
      <button id="next">Next &#9654;</button>
    </div>

    <div class="status" id="status">Ready.<span class="cursor"></span></div>
    <div class="counter" id="counter"></div>
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
const exportWavBtn = document.getElementById('export-wav') as HTMLButtonElement;
const exportMp3Btn = document.getElementById('export-mp3') as HTMLButtonElement;
const copyBtn = document.getElementById('copylink') as HTMLButtonElement;
const seedInput = document.getElementById('seedinput') as HTMLInputElement;
const loadBtn = document.getElementById('loadbtn') as HTMLButtonElement;
const prevBtn = document.getElementById('prev') as HTMLButtonElement;
const nextBtn = document.getElementById('next') as HTMLButtonElement;

// Session history of tunes, so you can step back to one you just heard.
type HistoryEntry = GenerateOptions & { seed: number };
const history: HistoryEntry[] = [];
let historyIndex = -1;

function updateHistoryButtons(): void {
  prevBtn.disabled = historyIndex <= 0;
  nextBtn.disabled = historyIndex >= history.length - 1;
}

function setStatus(text: string): void {
  // textContent (not innerHTML) so status text can never inject markup.
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

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Defer revoke so the browser can finish reading the blob for the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function playHistory(index: number): void {
  historyIndex = index;
  const entry = history[index];
  selectors.mood(entry.mood);
  selectors.tempo(entry.tempo);
  selectors.length(entry.length);
  state.song = generateSong(entry.seed, { mood: entry.mood, tempo: entry.tempo, length: entry.length });
  playSong(state.song, `Tune ${index + 1} of ${history.length}:`);
  updateHistoryButtons();
}

document.getElementById('generate')!.addEventListener('click', () => {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  state.song = generateSong(seed, { mood: state.mood, tempo: state.tempo, length: state.length });
  history.push({ mood: state.mood, tempo: state.tempo, length: state.length, seed });
  historyIndex = history.length - 1;
  playSong(state.song, 'Now playing:');
  updateHistoryButtons();
});

prevBtn.addEventListener('click', () => {
  if (historyIndex > 0) playHistory(historyIndex - 1);
});
nextBtn.addEventListener('click', () => {
  if (historyIndex < history.length - 1) playHistory(historyIndex + 1);
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

async function saveAs(format: 'wav' | 'mp3'): Promise<void> {
  if (!state.song) {
    setStatus('Generate a tune first, then save it.');
    return;
  }
  const song = state.song;
  exportWavBtn.disabled = true;
  exportMp3Btn.disabled = true;
  setStatus(`Rendering ${format.toUpperCase()}...`);
  try {
    // Offline render on its own context; live playback keeps going untouched.
    const buffer = await renderSong(song, 2);
    const blob = format === 'mp3' ? encodeMp3(buffer) : encodeWav(buffer);
    const filename = `sidmaker-${state.mood}-${song.seed}.${format}`;
    download(blob, filename);
    setStatus(`Saved ${filename} (${Math.round(blob.size / 1024)} KB).`);
  } catch (err) {
    setStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    exportWavBtn.disabled = false;
    exportMp3Btn.disabled = false;
  }
}

exportWavBtn.addEventListener('click', () => void saveAs('wav'));
exportMp3Btn.addEventListener('click', () => void saveAs('mp3'));

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

function loadTune(
  tune: { mood: MoodName; tempo: TempoChoice; length: LengthChoice; seed: number },
  prefix: string,
  autoplay: boolean,
): void {
  selectors.mood(tune.mood);
  selectors.tempo(tune.tempo);
  selectors.length(tune.length);
  state.song = generateSong(tune.seed, { mood: tune.mood, tempo: tune.tempo, length: tune.length });
  history.push({ mood: tune.mood, tempo: tune.tempo, length: tune.length, seed: tune.seed });
  historyIndex = history.length - 1;
  updateHistoryButtons();
  if (autoplay) {
    playSong(state.song, prefix);
  } else {
    playStopBtn.textContent = 'Play';
    setStatus(`${prefix}\n${describe(state.song)}`);
  }
}

loadBtn.addEventListener('click', () => {
  const tune = parseTuneInput(seedInput.value, { mood: state.mood, tempo: state.tempo, length: state.length });
  if (!tune) {
    setStatus('Type or paste something first - a seed, a link, or any URL.');
    return;
  }
  loadTune(tune, 'Now playing:', true);
});
seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadBtn.click();
});

// Load a shared tune from the URL hash (set up but not auto-played — browsers
// block audio until the first click).
const fromHash = parseShare(location.hash);
if (fromHash) loadTune(fromHash, 'Loaded a shared tune - press play:', false);
updateHistoryButtons();

// Shared visit counter (a Cloudflare Pages Function backed by KV). Counts each
// browser once per day; on any failure the line simply stays hidden.
async function loadCounter(): Promise<void> {
  const counterEl = document.getElementById('counter')!;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const flag = `sidmaker_counted_${today}`;
    const counted = localStorage.getItem(flag) !== null;
    const res = await fetch(`/count${counted ? '?peek' : ''}`);
    if (!res.ok) return;
    const data = (await res.json()) as { count?: number };
    if (typeof data.count !== 'number') return;
    if (!counted) localStorage.setItem(flag, '1');
    counterEl.textContent = `◉ ${data.count.toLocaleString()} visitors`;
  } catch {
    // Offline, or the endpoint isn't available (e.g. local dev): hide it.
  }
}
void loadCounter();
