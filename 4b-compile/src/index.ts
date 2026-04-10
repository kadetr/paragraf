// index.ts — Public API for @paragraf/compile.

// ─── Main entry points ────────────────────────────────────────────────────────
export { compile } from './compile.js';
export { compileBatch } from './batch.js';

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
} from './fonts.js';

// ─── Interpolation ────────────────────────────────────────────────────────────
export { resolveText } from './interpolate.js';
