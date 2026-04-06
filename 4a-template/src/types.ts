// types.ts — Template schema types for @paragraf/template.
// Pure data types; no functions, no side effects.

import type { ParagraphStyleDef } from '@paragraf/style';
import type { PageSize, Dimension } from '@paragraf/layout';

export type { PageSize, Dimension };

// ─── Layout ──────────────────────────────────────────────────────────────────

/**
 * Per-side margin object accepting Dimension values.
 * Each side can be a number (points) or a string like '20mm', '1in', '36pt'.
 */
export interface DimensionMargins {
  top: Dimension;
  right: Dimension;
  bottom: Dimension;
  left: Dimension;
}

/**
 * Page layout configuration for a template.
 * Accepts Dimension strings throughout — @paragraf/compile resolves them to
 * points before constructing PageLayout.
 */
export interface TemplateLayout {
  /** Named page size or explicit [width, height] tuple in points. */
  size: PageSize;
  /**
   * Margins in points or Dimension strings.
   * Single value → equal on all sides. Per-side object for independent control.
   */
  margins: Dimension | DimensionMargins;
  /** Number of text columns per page. Defaults to 1. */
  columns?: number;
  /** Space between columns — number (points) or Dimension string. */
  gutter?: Dimension;
  /** Bleed on all four sides — number (points) or Dimension string. */
  bleed?: Dimension;
}

// ─── Fonts ───────────────────────────────────────────────────────────────────

/**
 * File paths for each named variant of a font family.
 * The four common variants are typed explicitly; additional weight/stretch
 * variants can be added as arbitrary string keys.
 *
 * @example
 * ```ts
 * {
 *   regular:    './fonts/Serif-Regular.ttf',
 *   bold:       './fonts/Serif-Bold.ttf',
 *   italic:     './fonts/Serif-Italic.ttf',
 *   boldItalic: './fonts/Serif-BoldItalic.ttf',
 *   light:      './fonts/Serif-Light.ttf',   // custom variant
 * }
 * ```
 */
export interface TemplateFontVariants {
  regular?: string;
  bold?: string;
  italic?: string;
  boldItalic?: string;
  [variant: string]: string | undefined;
}

/**
 * Font registry for a template: family name → variant → file path.
 * Family names must match those used in style definitions.
 */
export type TemplateFonts = Record<string, TemplateFontVariants>;

// ─── Content ─────────────────────────────────────────────────────────────────

/**
 * How to handle a content slot when a data binding resolves to undefined/null.
 * - 'skip'        — omit the slot entirely
 * - 'placeholder' — render a visible placeholder string (handled by compile layer)
 * - 'fallback'    — render fallbackText (must be set when this value is used)
 */
export type OnMissing = 'skip' | 'placeholder' | 'fallback';

/**
 * A single content slot in a template.
 * `text` may contain `{{binding.path}}` interpolations; literal text is also valid.
 * Multiple bindings and mixed literal+binding strings are supported.
 */
export interface ContentSlot {
  /** Style name from this template's styles map. */
  style: string;
  /**
   * Text content — literal or with `{{path.to.field}}` bindings.
   * @example 'Article: {{product.sku}}'
   * @example '{{product.description}}'
   * @example 'Static heading text'
   */
  text: string;
  /** Behaviour when any binding in this slot resolves to missing. Defaults to 'skip'. */
  onMissing?: OnMissing;
  /** Required when onMissing is 'fallback'. Rendered as-is by the compile layer. */
  fallbackText?: string;
}

// ─── Template ────────────────────────────────────────────────────────────────

/**
 * A complete document template.
 * Pass to defineTemplate() to validate; pass the result to @paragraf/compile.
 */
export interface Template {
  /** Page geometry configuration. */
  layout: TemplateLayout;
  /**
   * Font family declarations. Keys are family names; values map variant
   * names to file paths. File path resolution is handled by @paragraf/compile.
   */
  fonts: TemplateFonts;
  /**
   * Paragraph style definitions, using the same shape as @paragraf/style's
   * defineStyles() input. Inheritance chains are fully supported.
   */
  styles: Record<string, ParagraphStyleDef>;
  /** Ordered list of content slots. */
  content: ContentSlot[];
}
