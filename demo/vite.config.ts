import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig(({ command }) => ({
  plugins: [wasm()],
  // In build mode: /paragraf/ for GitHub Pages. In dev: / so publicDir fonts are
  // served at the root (Vite always serves publicDir at server root, not at base).
  base: command === 'build' ? '/paragraf/' : '/',
  publicDir: '../fonts',
  build: {
    outDir: 'dist',
    // top-level await required for wasm-pack --target bundler ESM init
    target: 'es2022',
  },
  optimizeDeps: {
    // prevent Vite from pre-bundling the WASM module — vite-plugin-wasm handles it
    exclude: ['knuth_plass_wasm'],
  },
}));
