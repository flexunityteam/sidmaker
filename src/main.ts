import './style.css';
import { generateSong } from './generator/generate';
import type { GenerateOptions } from './generator/generate';
import type { LengthChoice, MoodName, TempoChoice } from './generator/moods';
import { Player } from './player/player';
import type { Song } from './core/types';

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

    <div class="status" id="status">Ready.<span class="cursor"></span></div>
  </div>
`;

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
  select(state[id]);
}

setupOptionGroup('mood');
setupOptionGroup('tempo');
setupOptionGroup('length');

const statusEl = document.getElementById('status')!;
const playStopBtn = document.getElementById('playstop') as HTMLButtonElement;

function setStatus(text: string): void {
  statusEl.innerHTML = `${text}<span class="cursor"></span>`;
}

function describe(song: Song): string {
  const bars = song.lengthTicks / (song.ticksPerBeat * 4);
  return `Now playing: ${MOOD_LABELS[state.mood]} / ${song.bpm} BPM / ${bars} bars\nSeed ${song.seed}`;
}

document.getElementById('generate')!.addEventListener('click', () => {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  state.song = generateSong(seed, { mood: state.mood, tempo: state.tempo, length: state.length });
  player.play(state.song);
  playStopBtn.textContent = 'Stop';
  setStatus(describe(state.song));
});

playStopBtn.addEventListener('click', () => {
  if (player.isPlaying) {
    player.stop();
    playStopBtn.textContent = 'Play';
    setStatus('Stopped. Press generate for a new tune.');
  } else if (state.song) {
    player.play(state.song);
    playStopBtn.textContent = 'Stop';
    setStatus(describe(state.song));
  } else {
    setStatus('Nothing to play yet - press generate.');
  }
});
