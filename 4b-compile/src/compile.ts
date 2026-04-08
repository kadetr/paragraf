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
  FontRegistry,
  Language,
} from '@paragraf/types';
import { resolveWeight } from '@paragraf/types';
import { parseDimension, PageLayout } from '@paragraf/layout';
import type { Margins } from '@paragraf/layout';
import { defineStyles } from '@paragraf/style';
import type { ResolvedParagraphStyle } from '@paragraf/style';
import type { Template, Dimension, DimensionMargins } from '@paragraf/template';
import { createMeasurer } from '@paragraf/font-engine';
import {
  createParagraphComposer,
  createDefaultFontEngine,
  composeDocument,
  layoutDocument,
} from '@paragraf/typography';
import type {
  ParagraphInput,
  Document,
  RenderedDocument,
} from '@paragraf/typography';
import { renderToSvg } from '@paragraf/render-core';
import type { RenderedParagraph } from '@paragraf/render-core';
import type { FontEngine } from '@paragraf/font-engine';
import { renderDocumentToPdf } from '@paragraf/render-pdf';

import type { CompileOptions, CompileResult } from './types.js';
import { buildFontRegistry, selectVariant } from './fonts.js';
import { resolveText } from './interpolate.js';
import { resolveComposerOptions, detectActualShaping } from './shaping.js';

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
    onOverflow = 'silent',
    shaping = 'auto',
    title,
    lang,
    selectable = false,
    maxPages = DEFAULT_MAX_PAGES,
  } = options;

  if (selectable && output !== 'pdf') {
    console.warn(
      '[paragraf/compile] selectable: true has no effect when output is not "pdf".',
    );
  }

  // ── 1. Resolve fonts ───────────────────────────────────────────────────────
  const registry = buildFontRegistry(template.fonts, basePath);

  // ── 2. Build composer + font engine ───────────────────────────────────────
  const composerOpts = resolveComposerOptions(shaping);
  const shapingEngine = detectActualShaping(composerOpts);

  const [composer, fontEngine] = await Promise.all([
    createParagraphComposer(registry, composerOpts),
    createDefaultFontEngine(registry, composerOpts),
  ]);

  // ── 3. Resolve layout ──────────────────────────────────────────────────────
  const layout = buildPageLayout(template.layout);
  const frames = layout.frames(maxPages);
  const [pageWidth, pageHeight] = layout.pageSize;

  // ── 4. Resolve styles ──────────────────────────────────────────────────────
  const styleRegistry = defineStyles(template.styles);

  // ── 5. Resolve data ────────────────────────────────────────────────────────
  const record: Record<string, unknown> = normalize
    ? normalize(data as never)
    : (data as Record<string, unknown>);

  // ── 6 + 7. Interpolate slots → ParagraphInputs ────────────────────────────
  const paragraphs: ParagraphInput[] = [];

  for (const slot of template.content) {
    const resolved = resolveText(slot.text, record);

    if (resolved === null) {
      const strategy = slot.onMissing ?? 'skip';
      if (strategy === 'skip') continue;

      if (strategy === 'fallback' && slot.fallbackText !== undefined) {
        paragraphs.push(
          buildInput(
            slot.fallbackText,
            styleRegistry.resolve(slot.style),
            registry,
          ),
        );
        continue;
      }

      // 'placeholder' or 'fallback' without fallbackText → render a visible placeholder
      const placeholder = `[${slot.style}]`;
      paragraphs.push(
        buildInput(placeholder, styleRegistry.resolve(slot.style), registry),
      );
      continue;
    }

    // Skip whitespace-only resolved text (e.g. a binding that resolved to spaces).
    // Intentional spacer slots should use a non-whitespace character or explicit paragraph breaks.
    if (resolved.trim().length === 0) continue;

    paragraphs.push(
      buildInput(resolved, styleRegistry.resolve(slot.style), registry),
    );
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
  const doc: Document = { paragraphs, frames };
  const composedDoc = composeDocument(doc, composer);

  // ── 10. Layout document ──────────────────────────────────────────────────
  const measurer = createMeasurer(registry);
  const renderedDoc = layoutDocument(composedDoc, frames, measurer);

  // Count overflow lines (lines composed but not placed due to page limit)
  const totalComposedLines = composedDoc.paragraphs.reduce(
    (sum, p) => sum + p.output.lineCount,
    0,
  );
  const totalRenderedLines = renderedDoc.pages
    .flatMap((p) => p.items)
    .reduce((sum, item) => sum + item.rendered.length, 0);
  const overflowLines = Math.max(0, totalComposedLines - totalRenderedLines);

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
  const pdfBuf = await renderDocumentToPdf(renderedDoc, fontEngine, {
    pageWidth,
    pageHeight,
    title,
    lang,
    selectable,
    fontRegistry: selectable ? registry : undefined,
    compress: true,
  });

  return {
    data: pdfBuf,
    metadata: { pageCount, overflowLines, shapingEngine },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPageLayout(layout: Template['layout']): PageLayout {
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
  registry: FontRegistry,
): Font {
  const {
    family = 'serif',
    size = 12,
    weight = 'normal',
    style: fontStyle = 'normal',
    stretch = 'normal',
    letterSpacing,
    variant,
  } = style.font;

  const numericWeight = resolveWeight(weight);
  const id: FontId = selectVariant(
    family,
    numericWeight,
    fontStyle as FontStyle,
    registry,
  );

  return {
    id,
    size,
    weight: numericWeight,
    style: fontStyle as FontStyle,
    stretch,
    ...(letterSpacing !== undefined ? { letterSpacing } : {}),
    ...(variant !== undefined ? { variant } : {}),
  };
}

function buildInput(
  text: string,
  style: ResolvedParagraphStyle,
  registry: FontRegistry,
): ParagraphInput {
  return {
    text,
    font: buildFont(style, registry),
    // lineWidth is overridden by composeDocument; 0 is a valid placeholder
    lineWidth: 0,
    alignment: style.alignment,
    language: style.language,
    firstLineIndent: style.firstLineIndent,
    tolerance: style.tolerance,
    looseness: style.looseness,
    // NOTE v0.6: style.hyphenation === false is not yet supported by ParagraphInput;
    // all paragraphs are hyphenated according to their language setting.
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
