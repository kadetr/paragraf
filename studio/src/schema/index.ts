// studio/src/schema/index.ts
// Public API for the studio schema translation layer.

export { validateStudioSchema } from './validate.js';
export { translateToTemplate, computeFrameGeometry } from './translate.js';
export type { TranslationResult } from './translate.js';
export { parseContentXml } from './content-parser.js';
export type { ParseContentResult } from './content-parser.js';

export type {
  StudioTemplate,
  StudioFrame,
  StudioPage,
  StudioLayout,
  StudioMargins,
  StudioFontVariant,
  StudioCompileSection,
  StudioCompileSettings,
  StudioImageFrame,
  StudioContentSlot,
  ValidationError,
  // Re-exported from @paragraf/* for convenience
  Template,
  TemplatePageSpec,
  TemplateRegionSpec,
  CompileOptions,
  ContentSlot,
  PageSize,
  Dimension,
} from './types.js';
