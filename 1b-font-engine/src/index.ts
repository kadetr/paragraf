// Core interface
export type { FontEngine, Glyph, GlyphPath, PathCommand } from './font-engine';

// fontkit adapter
export { FontkitEngine } from './engines/fontkit-engine';

// Measurer factory + fontkit helpers
export {
  createMeasurer,
  loadFontkitFont,
  resolveFontkitFont,
  createFontRegistry,
} from './measure';

// Testing utilities
export { mockMeasure, mockSpace, mockMetrics } from './testing';
