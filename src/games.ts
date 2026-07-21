import './style.css';

/**
 * C64 games page: run games in a browser Commodore 64 emulator (EmulatorJS,
 * VICE core). You can load your own game file (.d64/.prg/.t64/.crt) or pick a
 * bundled free game. Only games cleared for redistribution are bundled.
 */

const EJS_DATA = 'https://cdn.emulatorjs.org/stable/data/';

interface BundledGame {
  name: string;
  file: string; // served from /roms/
  by: string;
}

// Only games we are legally allowed to redistribute are listed here.
const BUNDLED_GAMES: BundledGame[] = [
  { name: 'Spy Chase', file: 'spychase.prg', by: 'SIDMAKER (public domain)' },
  { name: 'Guess (BASIC)', file: 'guess.prg', by: 'SIDMAKER (public domain)' },
];

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="screen">
    <div class="crt"></div>
    <h1>**** C64 GAMES ****</h1>
    <p class="subtitle"><a href="./index.html" class="link">&#9664; back to SIDMAKER</a></p>

    <div id="menu">
      <div class="control-group">
        <div class="label">Free games:</div>
        <div class="options" id="gamelist"></div>
      </div>

      <div class="control-group">
        <div class="label">Or load your own (.d64 .prg .t64 .crt):</div>
        <div class="load-row">
          <input id="gamefile" type="file" accept=".d64,.prg,.t64,.crt,.tap,.g64,.d81" />
        </div>
      </div>

      <div class="status" id="status">
        Pick a game to boot the Commodore 64.
        Own games stay on your device.<span class="cursor"></span>
      </div>
      <div class="counter">
        Tip: legal free C64 games live at csdb.dk (PD releases) and itch.io.
      </div>
    </div>

    <div id="stage" style="display:none">
      <div class="c64-frame"><div id="game"></div></div>
      <div class="actions"><button id="back">&#9664; Back to games</button></div>
    </div>
  </div>
`;

const menu = document.getElementById('menu')!;
const stage = document.getElementById('stage')!;
const statusEl = document.getElementById('status')!;

function boot(gameUrl: string, gameName: string): void {
  const w = window as unknown as Record<string, unknown>;
  w.EJS_player = '#game';
  w.EJS_core = 'c64';
  w.EJS_gameUrl = gameUrl;
  w.EJS_gameName = gameName;
  w.EJS_pathtodata = EJS_DATA;
  w.EJS_startOnLoaded = true;

  menu.style.display = 'none';
  stage.style.display = 'block';

  const loader = document.createElement('script');
  loader.src = `${EJS_DATA}loader.js`;
  document.body.appendChild(loader);
}

const gamelist = document.getElementById('gamelist')!;
if (BUNDLED_GAMES.length === 0) {
  gamelist.textContent = '(none bundled — load your own below)';
} else {
  for (const game of BUNDLED_GAMES) {
    const button = document.createElement('button');
    button.textContent = game.name;
    button.title = `by ${game.by}`;
    button.addEventListener('click', () => boot(`./roms/${game.file}`, game.name));
    gamelist.appendChild(button);
  }
}

const fileInput = document.getElementById('gamefile') as HTMLInputElement;
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  statusEl.firstChild!.textContent = `Booting ${file.name}...`;
  boot(URL.createObjectURL(file), file.name);
});

// Switching games cleanly means a fresh emulator, so just reload to the menu.
document.getElementById('back')!.addEventListener('click', () => location.reload());
