// demo/src/main.ts
// Entry point — initialises WASM, loads hyphenation patterns, then starts router.

import '../../2a-shaping-wasm/wasm/pkg-bundler/knuth_plass_wasm.js';

import { BrowserWasmFontEngine } from './browser-engine.js';
import { loadHyphenator } from '@paragraf/compile';
import { createRouter } from './router.js';
import type { Page, PageKey, BootContext } from './router.js';
import './style.css';

// Lazy-import page modules so they only load when first navigated to.
// Each returns a `Page` with mount() / unmount().
async function importPage(key: PageKey): Promise<Page> {
  switch (key) {
    case 'linebreak':
      return (await import('./pages/linebreak.js')).linebreakPage;
    case 'layout':
      return (await import('./pages/layout.js')).layoutPage;
    case 'typography':
      return (await import('./pages/typography.js')).typographyPage;
    case 'i18n':
      return (await import('./pages/i18n.js')).i18nPage;
  }
}

// Thin proxy that lazy-loads the real page module on first mount.
function lazyPage(key: PageKey): Page {
  let real: Page | null = null;
  return {
    async mount(container: HTMLElement, ctx: BootContext) {
      if (!real) real = await importPage(key);
      real.mount(container, ctx);
    },
    unmount() {
      real?.unmount();
    },
  };
}

async function boot(): Promise<void> {
  const statusEl = document.getElementById('status')!;

  try {
    const engine = new BrowserWasmFontEngine();
    await loadHyphenator('en-us');

    const ctx: BootContext = {
      engine,
      loadFont: async () => {
        /* font cache managed per-page */
      },
    };

    const pageRoot = document.getElementById('page-root')!;
    const pages = {
      layout: lazyPage('layout'),
      linebreak: lazyPage('linebreak'),
      typography: lazyPage('typography'),
      i18n: lazyPage('i18n'),
    };

    const router = createRouter(pages, pageRoot, ctx);

    // Wire nav tab clicks
    document
      .querySelectorAll<HTMLButtonElement>('[role="tab"][data-page]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          router.navigateTo(btn.dataset['page'] as PageKey);
        });
      });

    statusEl.textContent = '● ready';
    statusEl.className = 'status ready';

    router.start();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    statusEl.textContent = `● error: ${msg}`;
    statusEl.className = 'status error';
    console.error('[paragraf-demo] boot failed:', err);
  }
}

boot();
