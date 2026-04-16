// paragraph compositor
export {
  createParagraphComposer,
  createDefaultFontEngine,
  wasmStatus,
  clearMeasureCache,
  getMeasureCacheStats,
  configureMeasureCache,
} from './paragraph.js';
export type {
  ParagraphInput,
  ParagraphOutput,
  ParagraphComposer,
  ComposerOptions,
  MeasureCacheOptions,
  MeasureCacheStats,
} from './paragraph.js';

// optical margin alignment
export {
  PROTRUSION_TABLE,
  lookupProtrusion,
  buildOmaAdjustments,
  buildOmaInput,
} from './optical-margin.js';

// document model
export {
  snapCursorToGrid,
  gridAdvance,
  deriveLineWidths,
  composeDocument,
  layoutDocument,
} from './document.js';
export type {
  BaselineGrid,
  Frame,
  Document,
  ComposedDocument,
  RenderedItem,
  RenderedPage,
  RenderedDocument,
} from './document.js';
