// index.ts — Public API for @paragraf/compile.

// ─── Main entry points ────────────────────────────────────────────────────────
export { compile } from './compile.js';
export { compileBatch } from './batch.js';
export { createCompilerSession } from './session.js';
export type { CompilerSession, SessionOptions } from './session.js';
export { parseInlineMarkup } from './markup.js';

// ─── Option and result types ──────────────────────────────────────────────────
export type {
  CompileOptions,
  CompileResult,
  CompileBatchOptions,
  CompileBatchResult,
  OutputFormat,
  OverflowBehavior,
  ShapingMode,
  Template,
} from './types.js';

// ─── Font utilities ───────────────────────────────────────────────────────────
export {
  buildFontRegistry,
  selectVariant,
  resolveVariantEntry,
  VARIANT_CONVENTIONS,
  clearCompileWarnings,
} from './fonts.js';

// ─── Template ────────────────────────────────────────────────────────────────
export { defineTemplate } from '@paragraf/template';

// ─── Interpolation ────────────────────────────────────────────────────────────
export { resolveText } from './interpolate.js';

// ─── Re-exports from lower layers ────────────────────────────────────────────
// Consumers that depend only on @paragraf/compile get everything below
// without reaching into individual layer packages.

// Core types
export type {
  Font,
  FontId,
  FontMetrics,
  FontRegistry,
  FontDescriptor,
  Language,
  AlignmentMode,
  ComposedLine,
  ComposedParagraph,
  Measurer,
  GlueSpaceMetrics,
  MeasureText,
  TextSpan,
  SpanSegment,
} from '@paragraf/types';

// Font engine
export type {
  FontEngine,
  Glyph,
  GlyphPath,
  PathCommand,
} from '@paragraf/font-engine';

// Linebreak — algorithm primitives + hyphenation
export {
  computeBreakpoints,
  traceback,
  buildNodeSequence,
  composeParagraph,
  loadHyphenator,
  loadLanguages,
  hyphenateParagraph,
  hyphenateWord,
  DEFAULT_HYPHENATE_OPTIONS,
} from '@paragraf/linebreak';
export type {
  HyphenatedWordWithFont,
  HyphenateOptions,
  HyphenatedWord,
} from '@paragraf/linebreak';

// Typography — high-level paragraph composition
export {
  createParagraphComposer,
  createDefaultFontEngine,
  buildOmaAdjustments,
  buildOmaInput,
  lookupProtrusion,
} from '@paragraf/typography';
export type {
  ParagraphInput,
  ParagraphOutput,
  ParagraphComposer,
  ComposerOptions,
} from '@paragraf/typography';

// Layout + SVG render
export { layoutParagraph, renderToSvg } from '@paragraf/render-core';

// Color / ICC
export type { OutputIntent } from '@paragraf/render-pdf';
