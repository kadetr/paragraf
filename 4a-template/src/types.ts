// types.ts — Template schema types for @paragraf/template.
// Pure data types; no functions, no side effects.

import type { ParagraphStyleDef, CharStyleDef } from '@paragraf/style';
import type { FontStyle, FontStretch } from '@paragraf/types';
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
  /**
   * Number of text columns per page. Defaults to 1.
   * @deprecated Use `pages` with `TemplatePageSpec` for per-page region layouts.
   */
  columns?: number;
  /**
   * Space between columns — number (points) or Dimension string.
   * @deprecated Use `pages` with `TemplatePageSpec` for per-page region layouts.
   */
  gutter?: Dimension;
  /** Bleed on all four sides — number (points) or Dimension string. */
  bleed?: Dimension;
  /**
   * Per-page region layouts. When set, each entry defines the region geometry
   * for a set of pages identified by `range`. `columns` and `gutter` on this
   * TemplateLayout are deprecated when `pages` is used.
   */
  pages?: TemplatePageSpec[];
}

// ─── Region Layout ───────────────────────────────────────────────────────────

/**
 * A rectangular area on a page, sub-divided into one or more columns.
 * Mirrors `RegionSpec` from `@paragraf/layout` but uses `Dimension` strings.
 * `@paragraf/compile` resolves all Dimension values to points at compile time.
 */
export interface TemplateRegionSpec {
  /** Height of the region. Required. */
  height: Dimension;
  /** Number of columns within this region. Defaults to 1. */
  columns?: number;
  /** Space between columns. Defaults to 0. */
  gutter?: Dimension;
  /** Horizontal offset from the left edge of the text area. Defaults to 0. */
  x?: Dimension;
  /**
   * Vertical offset from the top of the text area.
   * When omitted, the region is auto-stacked below the previous one.
   */
  y?: Dimension;
  /** Width of the region. Defaults to the full text-area width. */
  width?: Dimension;
}

/**
 * Region layout for a set of pages identified by `range`.
 *
 * `range` accepts:
 * - `number`  — exact 1-based page number (e.g. `1` = first page only)
 * - `'N+'`    — page N and all subsequent pages (e.g. `'2+'`)
 * - `'N-M'`   — pages N through M inclusive (e.g. `'2-5'`)
 * - `'default'` — fallback for any page not matched by other entries
 *
 * Resolution order and conflict handling is delegated to `@paragraf/compile`.
 */
export interface TemplatePageSpec {
  range: number | string;
  regions: TemplateRegionSpec[];
}

// ─── Fonts ───────────────────────────────────────────────────────────────────

/**
 * A font variant entry: either a file path string (shorthand) or an object
 * with explicit path and optional weight/style/stretch metadata.
 *
 * The four standard keys (regular, bold, italic, boldItalic) have conventional
 * defaults applied by @paragraf/compile:
 *   regular    → weight 400, style 'normal'
 *   bold       → weight 700, style 'normal'
 *   italic     → weight 400, style 'italic'
 *   boldItalic → weight 700, style 'italic'
 *
 * Custom keys (e.g. 'light', 'semiBold') require the object form with explicit
 * metadata so @paragraf/compile can select the correct variant when resolving
 * a style's font: { family, weight, style } against the registry.
 */
export type FontVariantEntry =
  | string
  | {
      path: string;
      weight?: number;
      style?: FontStyle;
      stretch?: FontStretch;
    };

/**
 * File paths for each named variant of a font family.
 * Use a plain string for the four standard variants; use the object form
 * with metadata for custom weight/style/stretch variants.
 *
 * @example
 * ```ts
 * {
 *   regular:    './fonts/Serif-Regular.ttf',          // string shorthand
 *   bold:       './fonts/Serif-Bold.ttf',
 *   italic:     './fonts/Serif-Italic.ttf',
 *   boldItalic: './fonts/Serif-BoldItalic.ttf',
 *   light: { path: './fonts/Serif-Light.ttf', weight: 300 },  // object form
 *   semiBold: { path: './fonts/Serif-SemiBold.ttf', weight: 600 },
 * }
 * ```
 */
export interface TemplateFontVariants {
  regular?: FontVariantEntry;
  bold?: FontVariantEntry;
  italic?: FontVariantEntry;
  boldItalic?: FontVariantEntry;
  [variant: string]: FontVariantEntry | undefined;
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
  /**
   * Character style definitions. Used by the compile layer to resolve inline
   * markup tags (`<span cs="NAME">`) to font overrides.
   * Optional — omit when no inline markup character styles are needed.
   */
  charStyles?: Record<string, CharStyleDef>;
  /** Ordered list of content slots. */
  content: ContentSlot[];
}
