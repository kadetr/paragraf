// @paragraf/linebreak — public API

// ─── Algorithm ───────────────────────────────────────────────────────────────
export { computeBreakpoints } from './linebreak';
export type { BreakpointResult } from './linebreak';

export { traceback } from './traceback';
export type { LineBreak } from './traceback';

export { buildNodeSequence } from './nodes';
export type { HyphenatedWordWithFont } from './nodes';

export { composeParagraph } from './compose';

// ─── Hyphenation ─────────────────────────────────────────────────────────────
export {
  hyphenateWord,
  hyphenateParagraph,
  loadHyphenator,
  loadLanguages,
  deriveMinLeft,
  deriveMinRight,
  DEFAULT_HYPHENATE_OPTIONS,
} from './hyphenate';
export type { HyphenateOptions, HyphenatedWord } from './hyphenate';

// ─── Test utilities ──────────────────────────────────────────────────────────
export { mockMeasure, mockSpace, mockMetrics } from './testing';
