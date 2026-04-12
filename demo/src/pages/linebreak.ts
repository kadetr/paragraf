// demo/src/pages/linebreak.ts
// Page 2 — Line Breaking: side-by-side KP vs Greedy comparison.

import type {
  AlignmentMode,
  Font,
  FontRegistry,
  FontDescriptor,
  FontEngine,
} from '@paragraf/compile';
import type { Page, BootContext } from '../router.js';
import { createSlider } from '../components/slider.js';
import { createToggleGroup } from '../components/toggle-group.js';
import { createTextarea } from '../components/textarea.js';
import { createSvgPreview } from '../components/svg-preview.js';
import { createPdfButton } from '../components/pdf-button.js';
import { runPipeline } from '../rendering/pipeline.js';
import { FONTS } from '../fonts.js';

// ─── Constants (exported for unit tests) ───────────────────────────────────────

export const TOLERANCE_SLIDER = { min: 1, max: 10, step: 0.5 };
export const LOOSENESS_SLIDER = { min: -2, max: 2, step: 1 };
export const LETTER_SPACING_SLIDER = { min: -0.05, max: 0.1, step: 0.01 };
export const DEFAULT_ALIGNMENT: AlignmentMode = 'justified';
export const DEFAULT_TOLERANCE = 2;
export const DEFAULT_LOOSENESS = 0;
export const DEFAULT_LETTER_SPACING = 0;

// ─── Pure helpers (exported for unit tests) ─────────────────────────────────────

/**
 * Build the status bar text for a column.
 * Pass demerits = -1 to omit the demerits section (greedy column).
 */
export function buildStatusText(
  lineCount: number,
  demerits: number,
  emergency: number,
): string {
  if (demerits === -1) return `${lineCount} lines`;
  return `${lineCount} lines · ${emergency} emergency`;
}

// ─── Default text ──────────────────────────────────────────────────────────────

export const DEFAULT_TEXT =
  'The Knuth–Plass algorithm finds the globally optimal set of line breaks for a paragraph, minimising a cost function based on how tightly or loosely each line is fitted. Unlike first-fit greedy algorithms, it considers all feasible breakpoints simultaneously. The result is a more even "colour" across the paragraph — no very loose lines followed by very tight ones, no unsightly rivers of white space running through the justified text. Difficult ligatures such as "fi", "fl", and "ffi" are resolved automatically through GSUB lookup tables. Hyphenation is applied using language-specific dictionaries, and consecutive hyphenated lines are limited to avoid a distracting ladder effect at the right-hand margin. Widow and orphan control ensures that a single short word never appears alone on the last line of a paragraph, and a single line never stands isolated at the top of a column. The algorithm was described by Donald Knuth and Michael Plass in their 1981 paper "Breaking Paragraphs into Lines".';

// ─── Page implementation ──────────────────────────────────────────────────────

type State = {
  text: string;
  tolerance: number;
  looseness: number;
  letterSpacing: number;
  opticalMarginAlignment: boolean;
  alignment: AlignmentMode;
  lineWidth: number;
  ctx: BootContext | null;
};

export const linebreakPage: Page = (() => {
  let state: State = {
    text: DEFAULT_TEXT,
    tolerance: DEFAULT_TOLERANCE,
    looseness: DEFAULT_LOOSENESS,
    letterSpacing: DEFAULT_LETTER_SPACING,
    opticalMarginAlignment: false,
    alignment: DEFAULT_ALIGNMENT,
    lineWidth: 350,
    ctx: null,
  };

  let container: HTMLElement | null = null;
  let mounted = false;
  let lastKpSvg: string | null = null;

  // DOM refs created in mount
  let kpPreview: ReturnType<typeof createSvgPreview> | null = null;
  let greedyPreview: ReturnType<typeof createSvgPreview> | null = null;
  let kpStatus: HTMLElement | null = null;
  let greedyStatus: HTMLElement | null = null;

  async function loadDefaultFont(ctx: BootContext): Promise<{
    registry: FontRegistry;
    font: Font;
  }> {
    const fontOpt = FONTS[0]; // Roboto
    const fontRegistry = new Map<string, FontDescriptor>();
    fontRegistry.set(fontOpt.id, {
      id: fontOpt.id,
      family: fontOpt.family,
      filePath: '',
    });

    // Actually load the font bytes into the engine
    if (!loadedFonts.has(fontOpt.id)) {
      const url = `${import.meta.env.BASE_URL}${fontOpt.fileName}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(
          `Failed to load font "${fontOpt.id}": ${resp.status} ${resp.statusText}`,
        );
      }
      const bytes = new Uint8Array(await resp.arrayBuffer());
      (
        ctx.engine as import('../browser-engine.js').BrowserWasmFontEngine
      ).loadFontBytes(fontOpt.id, bytes);
      const face = new FontFace(fontOpt.family, bytes.buffer);
      await face.load();
      document.fonts.add(face);
      loadedFonts.add(fontOpt.id);
    }

    const font: Font = {
      id: fontOpt.id,
      size: 14,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
    };

    return { registry: fontRegistry, font };
  }

  const loadedFonts = new Set<string>();

  function doRender(): void {
    if (
      !mounted ||
      !state.ctx ||
      !kpPreview ||
      !greedyPreview ||
      !kpStatus ||
      !greedyStatus
    )
      return;

    // Kick off async render without blocking
    renderAsync().catch(console.error);
  }

  async function renderAsync(): Promise<void> {
    if (
      !state.ctx ||
      !kpPreview ||
      !greedyPreview ||
      !kpStatus ||
      !greedyStatus
    )
      return;

    const { registry, font } = await loadDefaultFont(state.ctx);

    const fontWithSpacing = {
      ...font,
      letterSpacing: state.letterSpacing * font.size,
    };

    const result = runPipeline({
      text: state.text,
      font: fontWithSpacing,
      lineWidth: state.lineWidth,
      tolerance: state.tolerance,
      looseness: state.looseness,
      alignment: state.alignment,
      language: 'en-us',
      registry,
      engine: state.ctx.engine as FontEngine,
      opticalMarginAlignment: state.opticalMarginAlignment,
    });

    kpPreview.setSvg(result.kp);
    lastKpSvg = result.kp;
    greedyPreview.setSvg(result.greedy);
    kpStatus.textContent = buildStatusText(
      result.kpLineCount,
      result.kpDemerits,
      result.emergencyCount,
    );
    greedyStatus.textContent = buildStatusText(result.greedyLineCount, -1, 0);
  }

  return {
    mount(el: HTMLElement, ctx: BootContext): void {
      mounted = true;
      container = el;
      state.ctx = ctx;
      el.innerHTML = '';
      el.className = 'page page-linebreak';

      // ── Controls (left panel) ─────────────────────────────────────────────
      const controls = document.createElement('div');
      controls.className = 'controls-panel';

      const textarea = createTextarea({
        label: 'TEXT (EDITABLE)',
        value: state.text,
        maxLength: 500,
        debounceMs: 300,
        onChange: (text) => {
          state.text = text;
          doRender();
        },
      });

      const toleranceSlider = createSlider({
        label: 'TOLERANCE',
        description:
          'Controls how aggressively KP accepts tight or loose lines. lower values: tighter fits; higher values: more slack.',
        ...TOLERANCE_SLIDER,
        value: state.tolerance,
        format: (v) => v.toFixed(1),
        onChange: (v) => {
          state.tolerance = v;
          doRender();
        },
      });

      const loosenessSlider = createSlider({
        label: 'LOOSENESS',
        description:
          'Adjusts the target number of lines, optimal fit 0. positive values: looser, more whitespace, negative values: tighter, more compressed.',
        ...LOOSENESS_SLIDER,
        value: state.looseness,
        format: (v) => (v >= 0 ? `+${v}` : String(v)),
        onChange: (v) => {
          state.looseness = v;
          doRender();
        },
      });

      const alignmentGroup = createToggleGroup({
        options: [
          { label: 'Center', value: 'center' },
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
          { label: 'Justified', value: 'justified' },
        ] as { label: string; value: AlignmentMode }[],
        value: state.alignment,
        onChange: (v) => {
          state.alignment = v;
          doRender();
        },
      });

      const letterSpacingSlider = createSlider({
        label: 'LETTER SPACING',
        description:
          'Global tracking in em units, default 0. Positive values space letters out; negative values tighten them.',
        ...LETTER_SPACING_SLIDER,
        value: state.letterSpacing,
        format: (v) =>
          v === 0 ? '0' : v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2),
        onChange: (v) => {
          state.letterSpacing = v;
          doRender();
        },
      });

      // OMA toggle
      const omaRow = document.createElement('div');
      omaRow.className = 'control-row';
      const omaLbl = document.createElement('span');
      omaLbl.classList.add('slider-label-tip');
      const omaLblText = document.createTextNode('OPTICAL MARGINS');
      const omaTip = document.createElement('span');
      omaTip.className = 'slider-tip-text';
      omaTip.textContent =
        'Allows punctuation (", −, …) to hang slightly into the margin. Effect is subtle — best seen at left margin of lines starting with quotes or dashes.';
      omaLbl.appendChild(omaLblText);
      omaLbl.appendChild(omaTip);
      const omaBtn = document.createElement('button');
      omaBtn.type = 'button';
      omaBtn.className = 'toggle-btn';
      omaBtn.textContent = state.opticalMarginAlignment ? 'On' : 'Off';
      omaBtn.setAttribute('aria-pressed', String(state.opticalMarginAlignment));
      omaBtn.addEventListener('click', () => {
        state.opticalMarginAlignment = !state.opticalMarginAlignment;
        omaBtn.textContent = state.opticalMarginAlignment ? 'On' : 'Off';
        omaBtn.setAttribute(
          'aria-pressed',
          String(state.opticalMarginAlignment),
        );
        doRender();
      });
      omaRow.appendChild(omaLbl);
      omaRow.appendChild(omaBtn);

      controls.appendChild(textarea.el);
      controls.appendChild(toleranceSlider.el);
      controls.appendChild(loosenessSlider.el);
      controls.appendChild(letterSpacingSlider.el);
      controls.appendChild(omaRow);
      controls.appendChild(alignmentGroup.el);

      // ── Preview (right panel) ─────────────────────────────────────────────
      const preview = document.createElement('div');
      preview.className = 'preview-panel preview-split';

      // KP column
      const kpCol = document.createElement('div');
      kpCol.className = 'preview-col';
      const kpLabel = document.createElement('h3');
      kpLabel.textContent = 'Knuth-Plass';
      kpPreview = createSvgPreview({
        onResize: (w) => {
          // SVG pipeline adds VIEWPORT_PADDING (20px) on each side, making the
          // SVG 40px wider than lineWidth. Subtract it so the rendered SVG
          // exactly fills the container and prevents a ResizeObserver growth loop.
          state.lineWidth = Math.max(50, w - 40);
          doRender();
        },
      });
      kpStatus = document.createElement('div');
      kpStatus.className = 'status-bar';
      kpCol.appendChild(kpLabel);
      kpCol.appendChild(kpPreview.el);
      kpCol.appendChild(kpStatus);

      // Greedy column
      const greedyCol = document.createElement('div');
      greedyCol.className = 'preview-col';
      const greedyLabel = document.createElement('h3');
      greedyLabel.textContent = 'Greedy';
      greedyPreview = createSvgPreview({});
      greedyStatus = document.createElement('div');
      greedyStatus.className = 'status-bar';
      greedyCol.appendChild(greedyLabel);
      greedyCol.appendChild(greedyPreview.el);
      greedyCol.appendChild(greedyStatus);

      preview.appendChild(kpCol);
      preview.appendChild(greedyCol);

      // PDF button
      const pdfBtn = createPdfButton({
        label: 'Download SVG',
        subtitle: 'Knuth-Plass layout · vector, scalable',
        mimeType: 'image/svg+xml',
        filename: 'paragraf-kp.svg',
        onDownload: () => {
          if (!lastKpSvg) throw new Error('No render available yet');
          return lastKpSvg;
        },
      });

      el.appendChild(controls);
      el.appendChild(preview);
      el.appendChild(pdfBtn.el);

      doRender();
    },

    unmount(): void {
      mounted = false;
      lastKpSvg = null;
      kpPreview?.destroy();
      greedyPreview?.destroy();
      kpPreview = null;
      greedyPreview = null;
      kpStatus = null;
      greedyStatus = null;
      if (container) {
        container.innerHTML = '';
        container.className = ''; // clear so other pages don't inherit this grid layout
      }
      container = null;
    },
  };
})();
