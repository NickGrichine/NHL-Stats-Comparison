import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site is served from https://nickgrichine.github.io/NHL-Players-Comparison/,
// so every asset and data URL needs that prefix. `npm run dev` overrides it to '/'.
const REPO_BASE = '/NHL-Players-Comparison/';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : REPO_BASE,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}));
