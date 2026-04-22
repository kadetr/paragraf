import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import path from 'path';

export default defineConfig(({ command }) => ({
  plugins: [wasm()],
  // In build mode: /paragraf/ for GitHub Pages. In dev: / so publicDir fonts are
  // served at the root (Vite always serves publicDir at server root, not at base).
  base: command === 'build' ? '/paragraf/' : '/',
  publicDir: '../fonts',
  resolve: {
    alias: {
      // Node.js-only modules pulled into the browser bundle transitively through
      // @paragraf/compile → @paragraf/typography → @paragraf/shaping-wasm and
      // @paragraf/font-engine. These packages are never CALLED in the demo
      // (it uses BrowserWasmFontEngine), so the stubs are never invoked at runtime.
      fontkit: path.resolve(__dirname, './src/fontkit-stub.ts'),
      fs: path.resolve(__dirname, './src/fs-stub.ts'),
      // 'node:fs/promises' is imported by @paragraf/color's loadProfile() — not
      // called at runtime (demo uses loadBuiltinSrgb()), so a throw-stub is safe.
      'node:fs/promises': path.resolve(__dirname, './src/fs-promises-stub.ts'),
      path: path.resolve(__dirname, './src/path-stub.ts'),
      module: path.resolve(__dirname, './src/module-stub.ts'),
    },
  },
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
