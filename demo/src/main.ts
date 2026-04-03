// demo/src/main.ts
// Entry point — initialises WASM (via vite-plugin-wasm side effect),
// fetches the font bytes, registers them, then starts the app.

// vite-plugin-wasm transforms this import so the WASM binary is
// fetched and instantiated before any function in this module runs.
// By the time we call register_font() below, the WASM is ready.
import '../../2a-shaping-wasm/wasm/pkg-bundler/knuth_plass_wasm.js';

import { BrowserWasmFontEngine } from './browser-engine.js';
import { loadHyphenator } from '@paragraf/linebreak';
import { startApp } from './app.js';
import './style.css';

async function boot(): Promise<void> {
  const statusEl = document.getElementById('status')!;

  try {
    // 1. Create WASM font engine
    const engine = new BrowserWasmFontEngine();

    // 2. Pre-load English hyphenation patterns (one-time async op)
    await loadHyphenator('en-us');

    // 3. Start the interactive UI — font loading is managed inside startApp
    await startApp(engine);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    statusEl.textContent = `● error: ${msg}`;
    statusEl.className = 'status error';
    console.error('[paragraf-demo] boot failed:', err);
  }
}

boot();
