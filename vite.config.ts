import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

// Relative base so the built app works both locally and when served from a
// GitHub Pages project subpath (https://user.github.io/sidmaker/).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        games: page('games.html'),
      },
    },
  },
});
