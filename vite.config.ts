import { defineConfig } from 'vite';

// Relative base so the built app works both locally and when served from a
// GitHub Pages project subpath (https://user.github.io/sidmaker/).
export default defineConfig({
  base: './',
});
