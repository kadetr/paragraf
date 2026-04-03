// @paragraf/linebreak — public API

// ─── Algorithm ───────────────────────────────────────────────────────────────
export { computeBreakpoints } from './linebreak.js';
export type { BreakpointResult } from './linebreak.js';

export { traceback } from './traceback.js';
export type { LineBreak } from './traceback.js';

export { buildNodeSequence } from './nodes.js';
export type { HyphenatedWordWithFont } from './nodes.js';

export { composeParagraph } from './compose.js';

// ─── Hyphenation ─────────────────────────────────────────────────────────────
export {
  hyphenateWord,
  hyphenateParagraph,
  loadHyphenator,
  loadLanguages,
  deriveMinLeft,
  deriveMinRight,
  DEFAULT_HYPHENATE_OPTIONS,
} from './hyphenate.js';
export type { HyphenateOptions, HyphenatedWord } from './hyphenate.js';

// ─── Test utilities ──────────────────────────────────────────────────────────
export { mockMeasure, mockSpace, mockMetrics } from './testing.js';
