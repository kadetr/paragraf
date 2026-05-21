// compile.ts — 11-step compile pipeline for @paragraf/compile.
//
// Steps:
//  1. Resolve fonts        — TemplateFonts → FontRegistry
//  2. Build engine         — FontRegistry → ParagraphComposer + FontEngine
//  3. Resolve layout       — TemplateLayout → PageLayout → Frame[]
//  4. Resolve styles       — Template.styles → StyleRegistry
//  5. Resolve data         — apply normalize() if provided
//  6. Interpolate slots    — per slot: resolve bindings, apply onMissing
//  7. Build ParagraphInputs — style + font for each resolved slot
//  8. Ensure languages     — call ensureLanguage for any non-default languages
//  9. Compose             — composeDocument
// 10. Layout              — layoutDocument; count overflow
// 11. Render output       — PDF / SVG / RenderedDocument

import type {
  Font,
  FontId,
  FontStyle,
  FontStretch,
  FontRegistry,
  Language,
  TextSpan,
  Frame,
} from '@paragraf/types';
import { resolveWeight } from '@paragraf/types';
import { parseDimension, PageLayout, resolvePageSize } from '@paragraf/layout';
import type { Margins } from '@paragraf/layout';
import { defineStyles } from '@paragraf/style';
import type { CharStyleDef, ResolvedParagraphStyle } from '@paragraf/style';
import { parseInlineMarkup, looksLikeRtl } from './markup.js';
import type { Template, Dimension, DimensionMargins } from '@paragraf/template';

import {
  createParagraphComposer,
  createDefaultFontEngine,
  composeDocument,
  layoutDocument,
  deriveLineWidths,
} from '@paragraf/typography';
import type {
  ParagraphInput,
  Document,
  RenderedDocument,
} from '@paragraf/typography';
import { renderToSvg } from '@paragraf/render-core';
import type { RenderedParagraph } from '@paragraf/render-core';
import type { FontEngine } from '@paragraf/font-engine';
import { createMeasurer } from '@paragraf/font-engine';
import { renderDocumentToPdf } from '@paragraf/render-pdf';
import type { OutputIntent } from '@paragraf/render-pdf';
// Minimal structural type for an ICC color transform — avoids a type-level
// import from @paragraf/color which is an optionalDependency and would cause
// tsc to fail for consumers installing with --no-optional.
type ColorTransform = { apply(input: number[]): number[] };

import type { CompileOptions, CompileResult } from './types.js';
import {
  buildFontRegistry,
  selectVariant,
  _warnedStyleFields,
} from './fonts.js';
import { resolveText } from './interpolate.js';
import { resolveComposerOptions, detectActualShaping } from './shaping.js';
import type { CompilerSession } from './session.js';

const DEFAULT_MAX_PAGES = 100;

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compile a single document from a template and data record.
 *
 * @returns CompileResult with the rendered output and metadata.
 */
export async function compile<T = unknown>(
  options: CompileOptions<T>,
): Promise<CompileResult> {
  const {
    template,
    data,
    normalize,
    output = 'pdf',
    basePath = process.cwd(),
    onOverflow = 'throw',
    shaping = 'auto',
    title,
    lang,
    selectable = false,
    maxPages = DEFAULT_MAX_PAGES,
    outputIntent,
    pdfxConformance,
    session,
    verbose = true,
  } = options;

  if (verbose && selectable && output !== 'pdf') {
    console.warn(
      '[paragraf/compile] selectable: true has no effect when output is not "pdf".',
    );
  }

  if (verbose && outputIntent && output !== 'pdf') {
    console.warn(
      '[paragraf/compile] outputIntent has no effect when output is not "pdf".',
    );
  }

  if (verbose && pdfxConformance && output !== 'pdf') {
    console.warn(
      '[paragraf/compile] pdfxConformance has no effect when output is not "pdf".',
    );
  }

  if (maxPages < 1) {
    throw new RangeError(
      `[paragraf/compile] maxPages must be >= 1 (got ${maxPages}).`,
    );
  }

  // ── 1. Resolve fonts ───────────────────────────────────────────────────────
  // ── 2. Build composer + font engine ────────────────────────────────────
  // When a session is provided both steps are skipped — reuse the pre-built
  // registry, composer, and engine from the session.
  let registry: ReturnType<typeof buildFontRegistry>;
  let composer: Awaited<ReturnType<typeof createParagraphComposer>>;
  let fontEngine: Awaited<ReturnType<typeof createDefaultFontEngine>>;
  let shapingEngine: CompilerSession['shapingEngine'];

  if (session) {
    registry = session.registry;
    composer = session.composer;
    fontEngine = session.fontEngine;
    shapingEngine = session.shapingEngine;
  } else {
    registry = buildFontRegistry(template.fonts, basePath);
    const composerOpts = resolveComposerOptions(shaping);
    shapingEngine = detectActualShaping(composerOpts);
    [composer, fontEngine] = await Promise.all([
      createParagraphComposer(registry, composerOpts),
      createDefaultFontEngine(registry, composerOpts),
    ]);
  }

  // ── 3. Resolve layout ──────────────────────────────────────────────────────
  const layout = buildPageLayout(template.layout);
  const frames = layout.frames(maxPages);
  const [pageWidth, pageHeight] = layout.pageSize;

  // ── 4. Resolve styles ──────────────────────────────────────────────────────
  const styleRegistry = defineStyles(template.styles);
  const charStyles: Record<string, CharStyleDef> | undefined =
    template.charStyles;

  // ── 5. Resolve data ────────────────────────────────────────────────────────
  const record: Record<string, unknown> = normalize
    ? normalize(data as never)
    : (data as Record<string, unknown>);

  // ── 6 + 7. Interpolate slots → ParagraphInputs ────────────────────────────
  const paragraphs: ParagraphInput[] = [];
  const frameAssignments: number[] = [];

  for (const slot of template.content) {
    const slotFrameIndex = getSlotFrameIndex(slot);
    const resolved = resolveText(slot.text, record);

    if (resolved === null) {
      const strategy = slot.onMissing ?? 'skip';
      if (strategy === 'skip') continue;

      if (strategy === 'fallback' && slot.fallbackText !== undefined) {
        paragraphs.push(
          buildInput(
            slot.fallbackText,
            styleRegistry.resolve(slot.style),
            slot.style,
            registry,
            charStyles,
            verbose,
          ),
        );
        frameAssignments.push(slotFrameIndex);
        continue;
      }

      // 'placeholder' or 'fallback' without fallbackText → render a visible placeholder
      const placeholder = `[${slot.style}]`;
      paragraphs.push(
        buildInput(
          placeholder,
          styleRegistry.resolve(slot.style),
          slot.style,
          registry,
          charStyles,
          verbose,
        ),
      );
      frameAssignments.push(slotFrameIndex);
      continue;
    }

    // Skip whitespace-only resolved text (e.g. a binding that resolved to spaces).
    // Intentional spacer slots should use a non-whitespace character or explicit paragraph breaks.
    if (resolved.trim().length === 0) continue;

    paragraphs.push(
      buildInput(
        resolved,
        styleRegistry.resolve(slot.style),
        slot.style,
        registry,
        charStyles,
        verbose,
      ),
    );
    frameAssignments.push(slotFrameIndex);
  }

  if (paragraphs.length === 0) {
    return emptyResult(
      output,
      shapingEngine,
      fontEngine,
      pageWidth,
      pageHeight,
      title,
      lang,
    );
  }

  // ── 8. Ensure languages for non-default styles ────────────────────────────
  const languages = new Set<Language>(
    paragraphs
      .map((p) => p.language)
      .filter((l): l is Language => l !== undefined && l !== 'en-us'),
  );
  for (const language of languages) {
    await composer.ensureLanguage(language);
  }

  // ── 9. Compose document ───────────────────────────────────────────────────
  const doc: Document = {
    paragraphs: deriveLineWidths(paragraphs, frames, frameAssignments),
    frames,
  };
  const composedDoc = composeDocument(doc, composer);

  // ── 10. Layout document ──────────────────────────────────────────────────
  // Reuse the measurer the composer already holds when available — both hit
  // the same font cache, so creating a second one is wasteful and fragile if
  // the cache is ever cleared. Fall back to createMeasurer for mock composers
  // that do not expose a measurer (e.g. in tests).
  const measurer = composer.measurer ?? createMeasurer(registry);
  const renderedDoc = layoutDocument(composedDoc, frames, measurer);

  const overflowLines = renderedDoc.oversetLineCount ?? 0;

  if (onOverflow === 'throw' && overflowLines > 0) {
    throw new Error(
      `[paragraf/compile] Content overflow: ${overflowLines} line(s) did not fit within ${maxPages} page(s).`,
    );
  }

  const pageCount = renderedDoc.pages.length;

  // ── 11. Render output ─────────────────────────────────────────────────────
  if (output === 'rendered') {
    return {
      data: renderedDoc,
      metadata: { pageCount, overflowLines, shapingEngine },
    };
  }

  if (output === 'svg') {
    const svgPages = renderedDoc.pages.map((page) => {
      // Flatten all items on the page into a single RenderedParagraph (array of RenderedLine)
      // to call renderToSvg once per page.
      // Line segment coordinates are page-absolute (layoutDocument applies item.origin
      // while placing lines into RenderedPage.items — no further offset is needed here).
      const allLines: RenderedParagraph = page.items.flatMap(
        (item) => item.rendered,
      );
      return renderToSvg(allLines, fontEngine, {
        width: pageWidth,
        height: pageHeight,
      });
    });
    return {
      data: svgPages.join('\n'),
      metadata: { pageCount, overflowLines, shapingEngine },
    };
  }

  // output === 'pdf'
  let colorTransform: ColorTransform | undefined;
  if (outputIntent) {
    // Only create a color transform for CMYK destination profiles.
    // Non-CMYK profiles (Lab, Gray, RGB) would produce device values that
    // render-pdf cannot encode correctly without additional color-space handling.
    const destColorSpace = outputIntent.profile.colorSpace;
    if (destColorSpace === 'CMYK') {
      const { loadBuiltinSrgb, createTransform } =
        await import('@paragraf/color');
      const srgb = await loadBuiltinSrgb();
      // Try the WASM-accelerated path (optional dependency). Fall back to the
      // pure-TS createTransform when @paragraf/color-wasm is not installed.
      try {
        const { loadColorWasm, createWasmTransform } =
          await import('@paragraf/color-wasm');
        const wasm = loadColorWasm();
        colorTransform = createWasmTransform(wasm, srgb, outputIntent.profile);
      } catch {
        colorTransform = createTransform(srgb, outputIntent.profile);
      }
    }
  }

  const pdfBuf = await renderDocumentToPdf(renderedDoc, fontEngine, {
    pageWidth,
    pageHeight,
    title,
    lang,
    selectable,
    fontRegistry: selectable ? registry : undefined,
    compress: true,
    outputIntent,
    colorTransform,
    pdfxConformance,
  });

  return {
    data: pdfBuf,
    metadata: { pageCount, overflowLines, shapingEngine },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPageLayout(layout: Template['layout']): PageLayout {
  if (layout.pages && layout.pages.length > 0) {
    return buildRegionPageLayout(layout) as unknown as PageLayout;
  }

  const margins = resolveMargins(layout.margins);
  const gutter =
    layout.gutter !== undefined ? parseDimension(layout.gutter) : undefined;
  const bleed =
    layout.bleed !== undefined ? parseDimension(layout.bleed) : undefined;
  return new PageLayout({
    size: layout.size,
    margins,
    columns: layout.columns,
    gutter,
    bleed,
  });
}

function buildRegionPageLayout(layout: Template['layout']): {
  pageSize: [number, number];
  frames(pageCount: number): Frame[];
} {
  const margins = resolveMargins(layout.margins);
  const marginBox: Margins =
    typeof margins === 'number'
      ? { top: margins, right: margins, bottom: margins, left: margins }
      : margins;

  const [trimWidth, trimHeight] = resolvePageSize(layout.size);
  const bleed = layout.bleed !== undefined ? parseDimension(layout.bleed) : 0;
  const textX = bleed + marginBox.left;
  const textY = bleed + marginBox.top;
  const textWidth = trimWidth - marginBox.left - marginBox.right;
  const pageSize: [number, number] = [
    trimWidth + 2 * bleed,
    trimHeight + 2 * bleed,
  ];

  const pageSpecs = layout.pages ?? [];

  return {
    pageSize,
    frames(pageCount: number): Frame[] {
      const allFrames: Frame[] = [];
      for (let page = 0; page < pageCount; page++) {
        const spec = resolveTemplatePageSpec(page + 1, pageSpecs);
        if (!spec) continue;
        let stackY = 0;
        for (const region of spec.regions) {
          const regionHeight = parseDimension(region.height);
          const regionX = region.x !== undefined ? parseDimension(region.x) : 0;
          const regionY =
            region.y !== undefined ? parseDimension(region.y) : stackY;
          const regionWidth =
            region.width !== undefined
              ? parseDimension(region.width)
              : textWidth;
          const regionColumns = region.columns ?? 1;
          const regionGutter =
            region.gutter !== undefined ? parseDimension(region.gutter) : 0;

          if (!Number.isInteger(regionColumns) || regionColumns < 1) {
            throw new RangeError(
              `[paragraf/compile] Invalid region columns (${regionColumns}) for page ${page + 1}.`,
            );
          }

          allFrames.push({
            page,
            x: textX + regionX,
            y: textY + regionY,
            width: regionWidth,
            height: regionHeight,
            ...(regionColumns > 1
              ? { columnCount: regionColumns, gutter: regionGutter }
              : {}),
          });

          stackY += regionHeight;
        }
      }
      return allFrames;
    },
  };
}

function getSlotFrameIndex(slot: Template['content'][number]): number {
  const maybe = (slot as { frameIndex?: unknown }).frameIndex;
  return typeof maybe === 'number' && Number.isInteger(maybe) && maybe >= 0
    ? maybe
    : 0;
}

function resolveTemplatePageSpec(
  pageNumber: number,
  specs: NonNullable<Template['layout']['pages']>,
): NonNullable<Template['layout']['pages']>[number] | undefined {
  let fallback: NonNullable<Template['layout']['pages']>[number] | undefined;

  for (const spec of specs) {
    const range = spec.range;
    if (range === 'default') {
      fallback = spec;
      continue;
    }

    if (typeof range === 'number') {
      if (pageNumber === range) return spec;
      continue;
    }

    if (typeof range === 'string') {
      const plusMatch = /^(\d+)\+$/.exec(range);
      if (plusMatch) {
        if (pageNumber >= Number(plusMatch[1])) return spec;
        continue;
      }

      const spanMatch = /^(\d+)-(\d+)$/.exec(range);
      if (spanMatch) {
        const start = Number(spanMatch[1]);
        const end = Number(spanMatch[2]);
        if (pageNumber >= start && pageNumber <= end) return spec;
      }
    }
  }

  return fallback ?? specs[0];
}

function resolveMargins(m: Dimension | DimensionMargins): number | Margins {
  if (typeof m === 'number') return m;
  if (typeof m === 'string') return parseDimension(m);
  return {
    top: parseDimension(m.top),
    right: parseDimension(m.right),
    bottom: parseDimension(m.bottom),
    left: parseDimension(m.left),
  };
}

function buildFont(
  style: ResolvedParagraphStyle,
  styleName: string,
  registry: FontRegistry,
  verbose = true,
): Font {
  const {
    family,
    size = 12,
    weight = 'normal',
    style: fontStyle = 'normal',
    stretch = 'normal',
    letterSpacing,
    variant,
    ligatures,
  } = style.font;

  if (!family) {
    throw new Error(
      `[paragraf/compile] Style "${styleName}": font.family is not set. ` +
        `Add a font.family that matches a key declared in template.fonts.`,
    );
  }

  const numericWeight = resolveWeight(weight);
  const id: FontId = selectVariant(
    family,
    numericWeight,
    fontStyle as FontStyle,
    registry,
    verbose,
    stretch as FontStretch,
  );

  return {
    id,
    size,
    weight: numericWeight,
    style: fontStyle as FontStyle,
    stretch,
    ...(letterSpacing !== undefined ? { letterSpacing } : {}),
    ...(variant !== undefined ? { variant } : {}),
    ...(ligatures !== undefined ? { ligatures } : {}),
  };
}

function buildInput(
  text: string,
  style: ResolvedParagraphStyle,
  styleName: string,
  registry: FontRegistry,
  charStyles?: Record<string, CharStyleDef>,
  verbose = true,
): ParagraphInput {
  const font = buildFont(style, styleName, registry, verbose);

  // Inline markup: parse <b>, <i>, <bi>, <sup>, <sub>, <span cs="…"> into spans.
  // Spans are only used for LTR paragraphs — RTL does not support span input.
  let spanInput: {
    text?: string;
    font?: ReturnType<typeof buildFont>;
    spans?: TextSpan[];
  } = { text, font };
  if (text.includes('<')) {
    const spans = parseInlineMarkup(text, font, charStyles);
    const sourceText = spans.map((s) => s.text).join('');
    if (!looksLikeRtl(sourceText)) {
      spanInput = { spans };
    } else {
      // RTL: strip markup tags and use plain text mode
      spanInput = { text: sourceText, font };
    }
  }

  // Warn about fields that are accepted by StyleRegistry but have no runtime
  // effect in the current compile pipeline (not yet implemented).
  // Deduplicated per style name to avoid log spam in compileBatch workloads.
  if (verbose) {
    if (style.features && Object.keys(style.features).length > 0) {
      const key = `${styleName}:features`;
      if (!_warnedStyleFields.has(key)) {
        _warnedStyleFields.add(key);
        console.warn(
          `[paragraf/compile] Style "${styleName}": features is set but not yet implemented. ` +
            'OpenType feature tags will have no effect on the rendered output.',
        );
      }
    }
    if (style.nestedStyles && style.nestedStyles.length > 0) {
      const key = `${styleName}:nestedStyles`;
      if (!_warnedStyleFields.has(key)) {
        _warnedStyleFields.add(key);
        console.warn(
          `[paragraf/compile] Style "${styleName}": nestedStyles is set but not yet implemented ` +
            '(requires F027 inline-markup pipeline). Rules will have no effect.',
        );
      }
    }
    if (style.grepStyles && style.grepStyles.length > 0) {
      const key = `${styleName}:grepStyles`;
      if (!_warnedStyleFields.has(key)) {
        _warnedStyleFields.add(key);
        console.warn(
          `[paragraf/compile] Style "${styleName}": grepStyles is set but not yet implemented ` +
            '(requires F027 inline-markup pipeline). Rules will have no effect.',
        );
      }
    }
  }

  return {
    ...spanInput,
    // lineWidth is overridden by composeDocument; 0 is a valid placeholder
    lineWidth: 0,
    alignment: style.alignment,
    language: style.language,
    firstLineIndent: style.firstLineIndent,
    tolerance: style.tolerance,
    looseness: style.looseness,
    ...(style.emergencyStretch !== undefined
      ? { emergencyStretch: style.emergencyStretch }
      : {}),
    // Only forward lineHeight when it is a valid positive finite number; invalid
    // values (zero, negative, NaN, Infinity) would cause overlapping text or
    // unstable layout and should be silently ignored.
    ...(Number.isFinite(style.lineHeight) && style.lineHeight > 0
      ? { lineHeight: style.lineHeight }
      : {}),
    ...(style.spaceBefore > 0 ? { spaceBefore: style.spaceBefore } : {}),
    ...(style.spaceAfter > 0 ? { spaceAfter: style.spaceAfter } : {}),
    ...(style.hyphenation === false ? { hyphenation: false } : {}),
    ...(style.opticalMarginAlignment ? { opticalMarginAlignment: true } : {}),
  };
}

async function emptyResult(
  output: CompileOptions['output'],
  shapingEngine: 'wasm' | 'fontkit',
  fontEngine: FontEngine,
  pageWidth: number,
  pageHeight: number,
  title?: string,
  lang?: string,
): Promise<CompileResult> {
  const metadata = { pageCount: 0, overflowLines: 0, shapingEngine };
  const renderedDoc: RenderedDocument = { pages: [] };

  if (output === 'rendered') return { data: renderedDoc, metadata };
  if (output === 'svg') return { data: '', metadata };

  const pdfBuf = await renderDocumentToPdf(renderedDoc, fontEngine, {
    pageWidth,
    pageHeight,
    title,
    lang,
    compress: true,
  });
  return { data: pdfBuf, metadata };
}
