export { defineStyles } from './paragraph-styles.js';
export type { StyleRegistry } from './paragraph-styles.js';
export { defineCharStyles } from './char-styles.js';
export type { CharStyleRegistry } from './char-styles.js';
export type {
  FontSpec,
  ParagraphStyleDef,
  CharStyleDef,
  ResolvedParagraphStyle,
  ResolvedCharStyle,
} from './types.js';

// Re-export font-descriptor types and helpers from @paragraf/types.
// Consumers of @paragraf/style work with FontWeight in resolved styles
// and should not need a separate @paragraf/types import for these.
export type {
  FontWeight,
  FontStyle,
  FontStretch,
  FontVariant,
} from '@paragraf/types';
export { resolveWeight } from '@paragraf/types';
