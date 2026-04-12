// demo/src/pages/layout.ts
// Page 1 — Layout: visualise page geometry (paper size, margins, columns).

import type { Page, BootContext } from '../router.js';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface PageDimensions {
  width: number; // points
  height: number; // points
}

export type PaperSizeName = 'A4' | 'A5' | 'Letter';
export type Orientation = 'portrait' | 'landscape';

// ─── Constants (exported for unit tests) ────────────────────────────────────────

export const PAPER_SIZES: Record<PaperSizeName, PageDimensions> = {
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
};

// ─── Pure helpers (exported for unit tests) ─────────────────────────────────────

/** Return the dimensions (portrait) for a named paper size. */
export function paperSize(name: PaperSizeName): PageDimensions {
  return { ...PAPER_SIZES[name] };
}

/**
 * Swap width/height when landscape is requested.
 * Portrait always ensures width ≤ height; landscape ensures width ≥ height.
 */
export function applyOrientation(
  dims: PageDimensions,
  orientation: Orientation,
): PageDimensions {
  const isLandscape = dims.width >= dims.height;
  if (orientation === 'landscape' && !isLandscape) {
    return { width: dims.height, height: dims.width };
  }
  if (orientation === 'portrait' && isLandscape) {
    return { width: dims.height, height: dims.width };
  }
  return { ...dims };
}

/**
 * Compute column widths given page geometry and column count.
 * Returns an array of `columns` equal widths.
 * Formula: each = (pageWidth − marginLeft − marginRight − (columns−1) × gutter) / columns
 */
export function computeTextArea(
  pageWidth: number,
  marginLeft: number,
  marginRight: number,
  columns: number,
  gutter: number,
): number[] {
  const totalText = pageWidth - marginLeft - marginRight;
  const totalGutter = (columns - 1) * gutter;
  const colWidth = Math.max(0, (totalText - totalGutter) / columns);
  return Array.from({ length: columns }, () => colWidth);
}

/**
 * Build an SVG thumbnail of the page layout.
 * Renders: page background, margin box, column areas.
 */
export function buildLayoutSvg(
  dims: PageDimensions,
  marginTop: number,
  marginBottom: number,
  marginLeft: number,
  marginRight: number,
  columns: number,
  gutter: number,
): string {
  // Scale to fit in a ~300-wide preview
  const scale = 300 / dims.width;
  const W = dims.width * scale;
  const H = dims.height * scale;

  const mt = marginTop * scale;
  const mb = marginBottom * scale;
  const ml = marginLeft * scale;
  const mr = marginRight * scale;
  const g = gutter * scale;

  const textWidth = W - ml - mr;
  const textHeight = H - mt - mb;
  const colWidths = computeTextArea(W, ml, mr, columns, g);

  const colRects = colWidths
    .map((cw, i) => {
      const x = ml + i * (cw + g);
      return `<rect class="column-area" x="${x.toFixed(2)}" y="${mt.toFixed(2)}" width="${cw.toFixed(2)}" height="${textHeight.toFixed(2)}" fill="#dbeafe" opacity="0.6"/>`;
    })
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}" height="${H.toFixed(2)}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}">
  <rect width="${W.toFixed(2)}" height="${H.toFixed(2)}" fill="white" stroke="#94a3b8" stroke-width="1.5"/>
  <rect class="text-area" x="${ml.toFixed(2)}" y="${mt.toFixed(2)}" width="${textWidth.toFixed(2)}" height="${textHeight.toFixed(2)}" fill="none" stroke="#cbd5e1" stroke-width="0.5" stroke-dasharray="3,2"/>
  ${colRects}
</svg>`;
}

// ─── Default values ─────────────────────────────────────────────────────────────

export const DEFAULT_PAPER: PaperSizeName = 'A4';
export const DEFAULT_ORIENTATION: Orientation = 'portrait';
export const DEFAULT_MARGIN = 72; // 1 inch in points
export const DEFAULT_COLUMNS = 1;
export const DEFAULT_GUTTER = 18;

// ─── Page implementation ─────────────────────────────────────────────────────────

export const layoutPage: Page = (() => {
  let host: HTMLElement | null = null;

  // State
  let currentPaper: PaperSizeName = DEFAULT_PAPER;
  let currentOrientation: Orientation = DEFAULT_ORIENTATION;
  let currentMarginTop = DEFAULT_MARGIN;
  let currentMarginBottom = DEFAULT_MARGIN;
  let currentMarginLeft = DEFAULT_MARGIN;
  let currentMarginRight = DEFAULT_MARGIN;
  let currentColumns = DEFAULT_COLUMNS;
  let currentGutter = DEFAULT_GUTTER;

  let svgContainer: HTMLElement | null = null;

  function render() {
    if (!svgContainer) return;
    const dims = applyOrientation(paperSize(currentPaper), currentOrientation);
    const svg = buildLayoutSvg(
      dims,
      currentMarginTop,
      currentMarginBottom,
      currentMarginLeft,
      currentMarginRight,
      currentColumns,
      currentGutter,
    );
    svgContainer.innerHTML = svg;
  }

  function createControl(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onChange: (v: number) => void,
    highlight = false,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = highlight
      ? 'control-row control-row--highlight'
      : 'control-row';
    const lbl = document.createElement('label');
    lbl.textContent = `${label}: ${value}pt`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      lbl.textContent = `${label}: ${v}pt`;
      onChange(v);
      render();
    });
    wrap.appendChild(lbl);
    wrap.appendChild(input);
    return wrap;
  }

  return {
    mount(el: HTMLElement, _ctx: BootContext) {
      host = el;
      el.className = ''; // clear any class left by a previous page

      const root = document.createElement('div');
      root.className = 'layout-page';

      // ── Controls panel ──────────────────────────────────────────────────────
      const controls = document.createElement('div');
      controls.className = 'controls';

      // Paper size selector
      const paperRow = document.createElement('div');
      paperRow.className = 'control-row';
      const paperLabel = document.createElement('span');
      paperLabel.textContent = 'Paper size';
      const paperSelect = document.createElement('select');
      (['A4', 'A5', 'Letter'] as PaperSizeName[]).forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === currentPaper) opt.selected = true;
        paperSelect.appendChild(opt);
      });
      paperSelect.addEventListener('change', () => {
        currentPaper = paperSelect.value as PaperSizeName;
        render();
      });
      paperRow.appendChild(paperLabel);
      paperRow.appendChild(paperSelect);
      controls.appendChild(paperRow);

      // Orientation toggle
      const orientRow = document.createElement('div');
      orientRow.className = 'control-row';
      const orientLabel = document.createElement('span');
      orientLabel.textContent = 'Orientation';
      const orientBtns = document.createElement('div');
      orientBtns.className = 'toggle-group';
      (['portrait', 'landscape'] as Orientation[]).forEach((o) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = o;
        btn.dataset['value'] = o;
        btn.setAttribute('aria-pressed', String(o === currentOrientation));
        btn.addEventListener('click', () => {
          currentOrientation = o;
          orientBtns.querySelectorAll('button').forEach((b) => {
            b.setAttribute('aria-pressed', String(b.dataset['value'] === o));
          });
          render();
        });
        orientBtns.appendChild(btn);
      });
      orientRow.appendChild(orientLabel);
      orientRow.appendChild(orientBtns);
      controls.appendChild(orientRow);

      // Margin sliders
      controls.appendChild(
        createControl('Margin top', 18, 144, 9, currentMarginTop, (v) => {
          currentMarginTop = v;
        }),
      );
      controls.appendChild(
        createControl('Margin bottom', 18, 144, 9, currentMarginBottom, (v) => {
          currentMarginBottom = v;
        }),
      );
      controls.appendChild(
        createControl('Margin left', 18, 144, 9, currentMarginLeft, (v) => {
          currentMarginLeft = v;
        }),
      );
      controls.appendChild(
        createControl('Margin right', 18, 144, 9, currentMarginRight, (v) => {
          currentMarginRight = v;
        }),
      );

      // Column count
      const colRow = document.createElement('div');
      colRow.className = 'control-row';
      const colLbl = document.createElement('label');
      colLbl.textContent = `Columns: ${currentColumns}`;
      const colInput = document.createElement('input');
      colInput.type = 'range';
      colInput.min = '1';
      colInput.max = '4';
      colInput.step = '1';
      colInput.value = String(currentColumns);
      colInput.addEventListener('input', () => {
        currentColumns = Number(colInput.value);
        colLbl.textContent = `Columns: ${currentColumns}`;
        render();
      });
      colRow.appendChild(colLbl);
      colRow.appendChild(colInput);
      controls.appendChild(colRow);

      // Gutter
      controls.appendChild(
        createControl('Gutter', 0, 72, 4.5, currentGutter, (v) => {
          currentGutter = v;
        }),
      );

      // ── Preview panel ───────────────────────────────────────────────────────
      const preview = document.createElement('div');
      preview.className = 'preview-panel';
      svgContainer = document.createElement('div');
      svgContainer.className = 'svg-container';
      preview.appendChild(svgContainer);

      root.appendChild(controls);
      root.appendChild(preview);
      host.appendChild(root);

      render();
    },

    unmount() {
      if (host) {
        host.innerHTML = '';
        host = null;
        svgContainer = null;
      }
    },
  };
})();
