// demo/src/app.ts
// UI management: font selection, leading, debounced re-render.

import type {
  Font,
  FontRegistry,
  FontDescriptor,
  ComposedParagraph,
} from '@paragraf/types';
import type { BrowserWasmFontEngine } from './browser-engine.js';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import type { RenderedParagraph } from '@paragraf/render-core';
import { composeKP } from './compose-kp.js';
import { composeGreedy } from './compose-greedy.js';
import { createBrowserMeasurer } from './measurer.js';
import { FONTS, type FontOption } from './fonts.js';

export const DEFAULT_TEXT =
  "In olden times when wishing still helped one, there lived a king whose daughters were all beautiful; and the youngest was so beautiful that the sun itself, which has seen so much, was astonished whenever it shone in her face. Close by the king's castle lay a great dark forest, and under an old lime-tree in the forest was a well, and when the day was very warm, the king's child went out into the forest and sat down by the side of the cool fountain.";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Font loading ──────────────────────────────────────────────────────────────

const loadedFonts = new Set<string>();

async function loadFont(
  engine: BrowserWasmFontEngine,
  opt: FontOption,
): Promise<void> {
  if (loadedFonts.has(opt.id)) return;
  const url = `${import.meta.env.BASE_URL}${opt.fileName}`;
  const resp = await fetch(url);
  if (!resp.ok)
    throw new Error(`Font fetch failed (${resp.status}): ${opt.fileName}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  engine.loadFontBytes(opt.id, bytes);
  const face = new FontFace(opt.family, bytes.buffer);
  await face.load();
  document.fonts.add(face);
  loadedFonts.add(opt.id);
}

// ─── Leading helper ────────────────────────────────────────────────────────────

function applyLeading(
  composed: ComposedParagraph,
  leading: number,
): ComposedParagraph {
  if (leading === 1) return composed;
  return composed.map((line) => ({
    ...line,
    lineHeight: line.lineHeight * leading,
  }));
}

// ─── Selectable text overlay ─────────────────────────────────────────────────
// Injects invisible <text> elements positioned at each segment's HarfBuzz
// baseline so the browser treats the SVG as selectable text while the visual
// rendering stays glyph-path based.

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function injectSelectableText(
  svg: string,
  rendered: RenderedParagraph,
  fontFamily: string,
): string {
  const els: string[] = ['<g class="text-select" aria-hidden="false">'];
  for (const line of rendered) {
    for (const seg of line.segments) {
      if (!seg.text) continue;
      els.push(
        `<text x="${seg.x.toFixed(2)}" y="${seg.y.toFixed(2)}" ` +
          `font-size="${seg.font.size}" font-family="${fontFamily}" ` +
          `fill="transparent">${escapeXml(seg.text)}</text>`,
      );
    }
  }
  els.push('</g>');
  return svg.replace('</svg>', els.join('\n') + '\n</svg>');
}

// ─── App ──────────────────────────────────────────────────────────────────────

export async function startApp(engine: BrowserWasmFontEngine): Promise<void> {
  const inputEl = document.getElementById('input') as HTMLTextAreaElement;
  const lwSlider = document.getElementById('linewidth') as HTMLInputElement;
  const fsSlider = document.getElementById('fontsize') as HTMLInputElement;
  const lhSlider = document.getElementById('leading') as HTMLInputElement;
  const fontSelectEl = document.getElementById(
    'fontselect',
  ) as HTMLSelectElement;
  const lwDisplay = document.getElementById('lw-display')!;
  const fsDisplay = document.getElementById('fs-display')!;
  const lhDisplay = document.getElementById('lh-display')!;
  const kpOut = document.getElementById('kp-output')!;
  const grOut = document.getElementById('greedy-output')!;
  const cssTextEl = document.getElementById('css-text') as HTMLElement;
  const cssHyTextEl = document.getElementById('css-hy-text') as HTMLElement;
  const statusEl = document.getElementById('status')!;

  // Populate font <select> from config
  for (const f of FONTS) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.label;
    fontSelectEl.appendChild(opt);
  }

  inputEl.value = DEFAULT_TEXT;
  lhDisplay.textContent = Number(lhSlider.value).toFixed(2);

  // Load the initial font before first render
  await loadFont(engine, FONTS[0]);

  const handleChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => render(), 150);
  };

  lwSlider.addEventListener('input', () => {
    lwDisplay.textContent = lwSlider.value;
    handleChange();
  });
  fsSlider.addEventListener('input', () => {
    fsDisplay.textContent = fsSlider.value;
    handleChange();
  });
  lhSlider.addEventListener('input', () => {
    lhDisplay.textContent = Number(lhSlider.value).toFixed(2);
    handleChange();
  });
  inputEl.addEventListener('input', handleChange);

  fontSelectEl.addEventListener('change', async () => {
    const selected = FONTS.find((f) => f.id === fontSelectEl.value) ?? FONTS[0];
    statusEl.textContent = '● loading font…';
    statusEl.className = 'status loading';
    try {
      await loadFont(engine, selected);
      render();
      statusEl.textContent = '● WASM ready';
      statusEl.className = 'status ready';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      statusEl.textContent = `● error: ${msg}`;
      statusEl.className = 'status error';
      console.error(err);
    }
  });

  const render = () => {
    const text = inputEl.value.trim();
    const lineWidth = Number(lwSlider.value);
    const fontSize = Number(fsSlider.value);
    const leading = Number(lhSlider.value);
    const fontOpt = FONTS.find((f) => f.id === fontSelectEl.value) ?? FONTS[0];

    if (!text) {
      kpOut.innerHTML = '<div class="empty">Type some text above.</div>';
      grOut.innerHTML = '<div class="empty">Type some text above.</div>';
      return;
    }

    const font: Font = {
      id: fontOpt.id,
      size: fontSize,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
    };
    const descriptor: FontDescriptor = {
      id: fontOpt.id,
      face: fontOpt.family,
      filePath: '',
    };
    const registry: FontRegistry = new Map([[fontOpt.id, descriptor]]);
    const measurer = createBrowserMeasurer(registry);

    try {
      // Derive CSS line-height in px from the same font metrics the SVG panels use,
      // then scale by the leading multiplier — keeps all 4 panels visually in sync.
      const fm = measurer.metrics(font);
      const cssLineHeightPx =
        (fm.ascender - fm.descender + fm.lineGap) * leading;
      const cssFamily = `'${fontOpt.family}', sans-serif`;

      // ── Knuth-Plass ────────────────────────────────────────────────────────
      const kpComposed = applyLeading(
        composeKP(text, font, lineWidth, registry),
        leading,
      );
      const kpRendered = layoutParagraph(kpComposed, measurer, { x: 0, y: 0 });
      const kpHeight = kpComposed.reduce((s, l) => s + l.lineHeight, 0);
      kpOut.innerHTML = injectSelectableText(
        renderToSvg(kpRendered, engine, { width: lineWidth, height: kpHeight }),
        kpRendered,
        fontOpt.family,
      );

      // ── Greedy ─────────────────────────────────────────────────────────────
      const grComposed = applyLeading(
        composeGreedy(text, font, lineWidth, registry),
        leading,
      );
      const grRendered = layoutParagraph(grComposed, measurer, { x: 0, y: 0 });
      const grHeight = grComposed.reduce((s, l) => s + l.lineHeight, 0);
      grOut.innerHTML = injectSelectableText(
        renderToSvg(grRendered, engine, { width: lineWidth, height: grHeight }),
        grRendered,
        fontOpt.family,
      );

      // ── CSS (browser native) ───────────────────────────────────────────────
      cssTextEl.style.fontSize = `${fontSize}px`;
      cssTextEl.style.width = `${lineWidth}px`;
      cssTextEl.style.fontFamily = cssFamily;
      cssTextEl.style.lineHeight = `${cssLineHeightPx}px`;
      cssTextEl.textContent = text;

      // ── CSS + hyphens: auto ────────────────────────────────────────────────
      cssHyTextEl.style.fontSize = `${fontSize}px`;
      cssHyTextEl.style.width = `${lineWidth}px`;
      cssHyTextEl.style.fontFamily = cssFamily;
      cssHyTextEl.style.lineHeight = `${cssLineHeightPx}px`;
      cssHyTextEl.textContent = text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      kpOut.innerHTML = `<div class="empty" style="color:#f87171">Error: ${msg}</div>`;
      grOut.innerHTML = '';
      console.error(err);
    }
  };

  statusEl.textContent = '● WASM ready';
  statusEl.className = 'status ready';
  render();
}
