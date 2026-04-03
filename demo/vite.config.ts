import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  // base is set to /paragraf/ for GitHub Pages hosting at kadetr.github.io/paragraf/
  base: '/paragraf/',
  // D1: serve the root fonts/ directory as static assets
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
});
