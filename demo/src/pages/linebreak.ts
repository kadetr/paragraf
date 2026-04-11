// demo/src/pages/linebreak.ts
// Page 2 — Line Breaking: side-by-side KP vs Greedy comparison.

import type { AlignmentMode } from '@paragraf/types';
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
export const DEFAULT_ALIGNMENT: AlignmentMode = 'justified';
export const DEFAULT_TOLERANCE = 2;
export const DEFAULT_LOOSENESS = 0;

// ─── Pure helpers (exported for unit tests) ─────────────────────────────────────

const NARROW_SPACE = '\u202f'; // narrow no-break space for thousands separator

/**
 * Format a 4-digit number with a narrow-space thousands separator.
 * e.g. 3420 → "3 420"
 */
function fmtNum(n: number): string {
  return n >= 1000
    ? `${Math.floor(n / 1000)}${NARROW_SPACE}${String(n % 1000).padStart(3, '0')}`
    : String(n);
}

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
  return `${lineCount} lines · ${fmtNum(demerits)} demerits · ${emergency} emergency`;
}

// ─── Default text ──────────────────────────────────────────────────────────────

export const DEFAULT_TEXT =
  "In olden times when wishing still helped one, there lived a king whose daughters were all beautiful; and the youngest was so beautiful that the sun itself, which has seen so much, was astonished whenever it shone in her face. Close by the king's castle lay a great dark forest, and under an old lime-tree in the forest was a well, and when the day was very warm, the king's child went out into the forest and sat down by the side of the cool fountain.";

// ─── Page implementation ──────────────────────────────────────────────────────

type State = {
  text: string;
  tolerance: number;
  looseness: number;
  alignment: AlignmentMode;
  lineWidth: number;
  ctx: BootContext | null;
};

export const linebreakPage: Page = (() => {
  let state: State = {
    text: DEFAULT_TEXT,
    tolerance: DEFAULT_TOLERANCE,
    looseness: DEFAULT_LOOSENESS,
    alignment: DEFAULT_ALIGNMENT,
    lineWidth: 350,
    ctx: null,
  };

  let container: HTMLElement | null = null;
  let mounted = false;

  // DOM refs created in mount
  let kpPreview: ReturnType<typeof createSvgPreview> | null = null;
  let greedyPreview: ReturnType<typeof createSvgPreview> | null = null;
  let kpStatus: HTMLElement | null = null;
  let greedyStatus: HTMLElement | null = null;

  async function loadDefaultFont(ctx: BootContext): Promise<{
    registry: import('@paragraf/types').FontRegistry;
    font: import('@paragraf/types').Font;
  }> {
    const fontOpt = FONTS[0]; // Roboto
    const fontRegistry = new Map<
      string,
      import('@paragraf/types').FontDescriptor
    >();
    fontRegistry.set(fontOpt.id, {
      id: fontOpt.id,
      family: fontOpt.family,
      filePath: '',
    });

    // Actually load the font bytes into the engine
    if (!loadedFonts.has(fontOpt.id)) {
      const url = `${import.meta.env.BASE_URL}${fontOpt.fileName}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const bytes = new Uint8Array(await resp.arrayBuffer());
        (
          ctx.engine as import('../browser-engine.js').BrowserWasmFontEngine
        ).loadFontBytes(fontOpt.id, bytes);
        const face = new FontFace(fontOpt.family, bytes.buffer);
        await face.load();
        document.fonts.add(face);
        loadedFonts.add(fontOpt.id);
      }
    }

    const font: import('@paragraf/types').Font = {
      id: fontOpt.id,
      size: 12,
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

    const result = runPipeline({
      text: state.text,
      font,
      lineWidth: state.lineWidth,
      tolerance: state.tolerance,
      looseness: state.looseness,
      alignment: state.alignment,
      language: 'en-us',
      registry,
      engine: state.ctx.engine as import('@paragraf/font-engine').FontEngine,
    });

    kpPreview.setSvg(result.kp);
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
        label: 'Text (EDITABLE)',
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
          'Adjusts the target number of lines. 0=optimal fit. positive values: looser, more whitespace, negative values: tighter, more compressed.',
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
          { label: 'Justified', value: 'justified' },
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
          { label: 'Center', value: 'center' },
        ] as { label: string; value: AlignmentMode }[],
        value: state.alignment,
        onChange: (v) => {
          state.alignment = v;
          doRender();
        },
      });

      controls.appendChild(textarea.el);
      controls.appendChild(toleranceSlider.el);
      controls.appendChild(loosenessSlider.el);
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
        onDownload: async () => new Uint8Array(0), // placeholder until Phase 10
      });

      el.appendChild(controls);
      el.appendChild(preview);
      el.appendChild(pdfBtn.el);

      doRender();
    },

    unmount(): void {
      mounted = false;
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
