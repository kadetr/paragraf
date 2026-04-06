import type { Template } from './types.js';
import { validateTemplate } from './validate.js';

export type {
  Template,
  TemplateLayout,
  DimensionMargins,
  TemplateFonts,
  TemplateFontVariants,
  ContentSlot,
  OnMissing,
  PageSize,
  Dimension,
} from './types.js';

export type { Token } from './interpolate.js';
export { parseTokens } from './interpolate.js';

// Re-exported so consumers can type their styles object without a separate
// @paragraf/style import. Template.styles is Record<string, ParagraphStyleDef>.
export type { ParagraphStyleDef } from '@paragraf/style';

/**
 * Validate a template object and return it.
 *
 * Validates:
 * - Style inheritance chains (no cycles, no missing extends/next refs)
 * - Content slot style references (must exist in template.styles)
 * - `onMissing: 'fallback'` slots must have `fallbackText`
 * - All `text` fields must have valid `{{binding.path}}` syntax
 *
 * @throws if any validation rule is violated
 * @returns the template object unchanged
 */
export function defineTemplate(input: Template): Template {
  validateTemplate(input);
  return input;
}
