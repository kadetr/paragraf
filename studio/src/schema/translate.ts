// studio/src/schema/translate.ts
// Translates a validated StudioTemplate into compile-ready Template + CompileOptions.
// Returns a TranslationResult — call validateStudioSchema() before this function.

import { parseDimension, resolvePageSize } from '@paragraf/layout';
import type {
  Template,
  TemplatePageSpec,
  TemplateRegionSpec,
} from '@paragraf/template';
import type { CompileOptions } from '@paragraf/compile';

import type {
  StudioTemplate,
  StudioFrame,
  StudioCompileSettings,
  StudioImageFrame,
  ValidationError,
  Dimension,
} from './types.js';
import type { StudioFrameGeometry } from '../ipc-types.js';

// ─── Return type ─────────────────────────────────────────────────────────────

export interface TranslationResult {
  template: Template;
  compileOptions: Partial<CompileOptions>;
  studioSettings: StudioCompileSettings;
  imageFrames: StudioImageFrame[];
  errors: ValidationError[];
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Translate a validated StudioTemplate into compile-ready objects.
 *
 * @param t — a StudioTemplate (already validated via validateStudioSchema)
 * @returns TranslationResult — errors[] is non-empty when semantic constraints are violated
 *          (e.g. computed auto height ≤ 0).
 */
export function translateToTemplate(t: StudioTemplate): TranslationResult {
  const errors: ValidationError[] = [];
  const imageFrames: StudioImageFrame[] = [];

  // ── Resolve page dimensions ─────────────────────────────────────────────

  const [, pageH] = resolvePageSize(t.layout.size);
  const { topMargin, bottomMargin } = _resolveVerticalMargins(t.layout.margins);
  const availableH = pageH - topMargin - bottomMargin;

  // ── Build TemplatePageSpec[] ────────────────────────────────────────────

  const pages: TemplatePageSpec[] = [];

  for (const [pageKey, page] of Object.entries(t.pages)) {
    const range = _resolvePageRange(pageKey);

    // Compute auto height for this page (if needed)
    let fixedTotal = 0;
    let hasAuto = false;

    for (const frameName of page.frames) {
      const frame = t.frames[frameName];
      if (!frame) continue;
      if (frame.height === 'auto') {
        hasAuto = true;
      } else {
        fixedTotal += parseDimension(frame.height as Dimension);
      }
    }

    const autoHeight = availableH - fixedTotal;

    if (hasAuto && autoHeight <= 0) {
      errors.push({
        field: `pages.${pageKey}`,
        message: `Computed auto height for page "${pageKey}" is ${autoHeight.toFixed(2)} pt — must be > 0`,
      });
    }

    // Build regions for text frames; record image frames
    const regions: TemplateRegionSpec[] = [];

    for (let i = 0; i < page.frames.length; i++) {
      const frameName = page.frames[i];
      const frame = t.frames[frameName];
      if (!frame) continue;

      if (frame.type === 'image') {
        imageFrames.push({ name: frameName, pageKey, frameIndex: i });
        continue;
      }

      // Resolve height
      const resolvedHeight: Dimension =
        frame.height === 'auto' ? autoHeight : (frame.height as Dimension);

      const region: TemplateRegionSpec = { height: resolvedHeight };
      if (frame.columns !== undefined) region.columns = frame.columns;
      if (frame.gutter !== undefined) region.gutter = frame.gutter;
      if (frame.x !== undefined) region.x = frame.x;
      if (frame.y !== undefined) region.y = frame.y;
      if (frame.width !== undefined) region.width = frame.width;

      regions.push(region);
    }

    pages.push({ range, regions });
  }

  // ── Build Template ──────────────────────────────────────────────────────

  // ── Derive page-level column settings from the first multi-column frame ────
  // compile()'s buildPageLayout reads layout.columns + layout.gutter to drive
  // PageLayout, which in turn controls the column width used by deriveLineWidths
  // and Knuth-Plass composition. Without this, all paragraphs are composed at
  // the full text-area width even when body frames declare columns.
  let layoutColumns: number | undefined;
  let layoutGutter: string | undefined;
  for (const frame of Object.values(t.frames)) {
    if (frame.type !== 'image' && frame.columns && frame.columns > 1) {
      layoutColumns = frame.columns;
      if (frame.gutter !== undefined) layoutGutter = String(frame.gutter);
      break;
    }
  }

  const template: Template = {
    layout: {
      size: t.layout.size,
      margins: t.layout.margins,
      pages,
      ...(layoutColumns !== undefined ? { columns: layoutColumns } : {}),
      ...(layoutGutter !== undefined ? { gutter: layoutGutter } : {}),
    },
    fonts: t.fonts as Template['fonts'],
    styles: t.styles,
    content: [], // populated later by content-parser + compile worker
  };

  // ── Build CompileOptions (partial) ──────────────────────────────────────

  const compileOptions: Partial<CompileOptions> = {};
  const studioSettings: StudioCompileSettings = {};

  if (t.compile) {
    if (t.compile.shaping !== undefined)
      // Studio uses 'js'/'wasm'; CompileOptions uses 'fontkit'/'wasm'/'auto'.
      compileOptions.shaping =
        t.compile.shaping === 'wasm' ? 'wasm' : 'fontkit';
    if (t.compile.selectable !== undefined)
      compileOptions.selectable = t.compile.selectable;
    if (t.compile.maxPages !== undefined)
      compileOptions.maxPages = t.compile.maxPages;
    if (t.compile.onOverflow !== undefined)
      compileOptions.onOverflow = t.compile.onOverflow;
    // Studio-specific: not passed to CompileOptions
    if (t.compile.opticalMargins !== undefined)
      studioSettings.opticalMargins = t.compile.opticalMargins;
    if (t.compile.hyphenation !== undefined)
      studioSettings.hyphenation = t.compile.hyphenation;
  }

  return { template, compileOptions, studioSettings, imageFrames, errors };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Map a studio page key to the TemplatePageSpec range value. */
function _resolvePageRange(pageKey: string): number | string {
  if (pageKey === 'first') return 1;
  if (pageKey === 'default') return 'default';
  return pageKey;
}

/** Extract top and bottom margin values in points from the studio margins field. */
function _resolveVerticalMargins(
  margins:
    | Dimension
    | { top: Dimension; right: Dimension; bottom: Dimension; left: Dimension },
): { topMargin: number; bottomMargin: number } {
  if (typeof margins === 'object' && !Array.isArray(margins)) {
    const m = margins as { top: Dimension; bottom: Dimension };
    return {
      topMargin: parseDimension(m.top),
      bottomMargin: parseDimension(m.bottom),
    };
  }
  // Single Dimension value → equal on all sides
  const v = parseDimension(margins as Dimension);
  return { topMargin: v, bottomMargin: v };
}

/** Extract left margin value in points from the studio margins field. */
function _resolveLeftMargin(
  margins:
    | Dimension
    | { top: Dimension; right: Dimension; bottom: Dimension; left: Dimension },
): number {
  if (typeof margins === 'object' && !Array.isArray(margins)) {
    return parseDimension((margins as { left: Dimension }).left);
  }
  return parseDimension(margins as Dimension);
}

// ─── Frame geometry ───────────────────────────────────────────────────────────

/**
 * Compute absolute frame positions (in points, from page top-left) for the
 * named page in a StudioTemplate.  Used to drive the FrameOverlay in the
 * preview panel.
 *
 * @param t       — validated StudioTemplate
 * @param pageKey — which page to use; falls back to the first defined page
 * @returns array of StudioFrameGeometry (empty if the page has no text frames)
 */
export function computeFrameGeometry(
  t: StudioTemplate,
  pageKey = 'default',
): StudioFrameGeometry[] {
  const page = t.pages[pageKey] ?? t.pages[Object.keys(t.pages)[0]];
  if (!page) return [];

  const [pageW, pageH] = resolvePageSize(t.layout.size);
  const { topMargin, bottomMargin } = _resolveVerticalMargins(t.layout.margins);
  const leftMargin = _resolveLeftMargin(t.layout.margins);

  // Resolve right margin to compute usable text-area width.
  const rightMargin = (() => {
    const m = t.layout.margins;
    if (typeof m === 'object' && !Array.isArray(m)) {
      return parseDimension((m as { right: Dimension }).right);
    }
    return parseDimension(m as Dimension);
  })();
  const usableWidth = pageW - leftMargin - rightMargin;
  const availableH = pageH - topMargin - bottomMargin;

  // Pre-compute auto height for this page (mirrors translateToTemplate logic)
  let fixedTotal = 0;
  let hasAuto = false;
  for (const frameName of page.frames) {
    const frame = t.frames[frameName];
    if (!frame || frame.type === 'image') continue;
    if (frame.height === 'auto') hasAuto = true;
    else fixedTotal += parseDimension(frame.height as Dimension);
  }
  const autoHeight = hasAuto ? availableH - fixedTotal : 0;

  const result: StudioFrameGeometry[] = [];
  let cumulativeY = 0;

  for (const frameName of page.frames) {
    const frame = t.frames[frameName];
    if (!frame || frame.type === 'image') continue;

    const fWidth =
      frame.width !== undefined
        ? parseDimension(frame.width as Dimension)
        : usableWidth;
    const fHeight =
      frame.height === 'auto'
        ? autoHeight
        : parseDimension(frame.height as Dimension);
    const fX =
      leftMargin +
      (frame.x !== undefined ? parseDimension(frame.x as Dimension) : 0);
    const fY =
      frame.y !== undefined
        ? topMargin + parseDimension(frame.y as Dimension)
        : topMargin + cumulativeY;

    result.push({
      name: frameName,
      x: fX,
      y: fY,
      width: fWidth,
      height: fHeight,
      columnCount: frame.columns ?? 1,
      columnGutter:
        frame.gutter !== undefined
          ? parseDimension(frame.gutter as Dimension)
          : 0,
    });

    // Only advance cumulative Y when the frame has no explicit y position.
    if (frame.y === undefined) cumulativeY += fHeight;
  }

  return result;
}
