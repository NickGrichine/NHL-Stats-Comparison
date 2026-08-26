import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configs run in Node. Declared here rather than adding @types/node as a
// dependency for a single lookup.
declare const process: { env: Record<string, string | undefined> };

// GitHub Pages serves a project site under /<repo>/, so every asset and data
// URL needs that prefix. It is derived from GITHUB_REPOSITORY ("owner/repo")
// rather than hardcoded, because renaming the repository would otherwise ship
// a build whose asset paths point at the old name — an entirely blank page
// with no error, which is exactly what happened once already.
const repoFromCI = process.env.GITHUB_REPOSITORY?.split('/')[1];
const REPO_BASE = `/${repoFromCI ?? 'NHL-Stats-Comparison'}/`;

// Set unconditionally rather than only for builds: `vite preview` resolves
// config with command === 'serve', so a conditional base would serve the
// preview at '/' while the built HTML still pointed at the repo path, and every
// asset would 404. Dev uses the same base for consistency — Vite redirects
// http://localhost:5173/ to it automatically.
export default defineConfig({
  base: REPO_BASE,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
