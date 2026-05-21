// studio/src/schema/types.ts
// Studio-internal schema types. These are NOT the @paragraf/template types —
// they describe the structure of studio's template.json on disk.

import type { ContentSlot } from '@paragraf/template';
import type { PageSize, Dimension } from '@paragraf/layout';
import type { ParagraphStyleDef } from '@paragraf/style';

export type { PageSize, Dimension, ContentSlot };

// ─── Validation ───────────────────────────────────────────────────────────────

/** A single schema or semantic validation error. */
export interface ValidationError {
  /** Dotted path to the offending field (e.g. "pages.first.frames[1]"). */
  field: string;
  /** Human-readable description of the error. */
  message: string;
}

// ─── StudioFrame ──────────────────────────────────────────────────────────────

/**
 * A named frame in the studio frames registry.
 * `height: "auto"` is a studio-only concept — translator computes it numerically.
 */
export interface StudioFrame {
  /** "text" renders content; "image" is excluded from ContentSlot output. Defaults to "text". */
  type?: 'text' | 'image';
  /** Fixed height (Dimension string or number in points) or "auto" (computed by translator). */
  height: Dimension | 'auto';
  /** Number of columns within this frame. Defaults to 1. */
  columns?: number;
  /** Space between columns. Defaults to 0. */
  gutter?: Dimension;
  /** Horizontal offset from left edge of text area. Defaults to 0. */
  x?: Dimension;
  /** Vertical offset from top of text area (when omitted, stacked below previous). */
  y?: Dimension;
  /** Width of frame. Defaults to full text-area width. */
  width?: Dimension;
}

// ─── StudioPage ───────────────────────────────────────────────────────────────

/**
 * A named page spec in studio's `pages` dictionary.
 * `frames` is an ordered list of frame names referencing entries in `StudioTemplate.frames`.
 */
export interface StudioPage {
  frames: string[];
}

// ─── StudioCompileSection ─────────────────────────────────────────────────────

/**
 * The `compile` section of studio's template.json.
 * Only keys in the studio allowlist are valid.
 */
export interface StudioCompileSection {
  shaping?: 'js' | 'wasm';
  selectable?: boolean;
  maxPages?: number;
  onOverflow?: 'truncate' | 'error';
  /** Studio-specific: passed to style layer, not CompileOptions. */
  opticalMargins?: boolean;
  /** Studio-specific: passed to style layer, not CompileOptions. */
  hyphenation?: boolean;
}

// ─── StudioTemplate ───────────────────────────────────────────────────────────

/** Per-side margins for studio layout. Each side is a Dimension or number in points. */
export interface StudioMargins {
  top: Dimension;
  right: Dimension;
  bottom: Dimension;
  left: Dimension;
}

/** Page geometry section of studio's template.json. */
export interface StudioLayout {
  /** Named page size (e.g. "A4") or [width, height] tuple in points. */
  size: PageSize;
  /**
   * Page margins. Single Dimension value → equal on all sides.
   * Per-side object for independent control.
   */
  margins: Dimension | StudioMargins;
}

/** Font variant entry in studio's fonts registry. */
export interface StudioFontVariant {
  path: string;
  style?: string;
  weight?: number | string;
}

/**
 * The root studio template.json schema object.
 * This is studio's own representation — NOT @paragraf/template's Template type.
 * Use translateToTemplate() to produce a compile-ready Template.
 */
export interface StudioTemplate {
  layout: StudioLayout;
  /** Font family declarations. */
  fonts: Record<string, Record<string, string>>;
  /** Paragraph style definitions (same shape as @paragraf/style). */
  styles: Record<string, ParagraphStyleDef>;
  /** Named frame definitions. */
  frames: Record<string, StudioFrame>;
  /**
   * Named page specs. Keys are page identifiers:
   * "first" → range: 1, "default" → range: 'default', other → range: key.
   */
  pages: Record<string, StudioPage>;
  /** Optional compile settings section. */
  compile?: StudioCompileSection;
}

// ─── StudioCompileSettings ────────────────────────────────────────────────────

/**
 * Studio-specific compile settings extracted from the `compile` section.
 * These fields are NOT part of @paragraf/compile's CompileOptions —
 * they are handled at the style layer.
 */
export interface StudioCompileSettings {
  opticalMargins?: boolean;
  hyphenation?: boolean;
}

// ─── StudioImageFrame ─────────────────────────────────────────────────────────

/**
 * Metadata for an image frame extracted during template translation.
 * Consumed by the preview layer (Plan 119) — not passed to compile().
 */
export interface StudioImageFrame {
  /** Frame name as declared in StudioTemplate.frames. */
  name: string;
  /** Page key (e.g. "first", "default") where this frame appears. */
  pageKey: string;
  /** 0-based index of this frame in the page's `frames[]` array. */
  frameIndex: number;
}

// ─── StudioContentSlot ────────────────────────────────────────────────────────

/**
 * Extends ContentSlot with a frame index for content-parser output.
 * `frameIndex` is the 0-based position of the frame in the active page's
 * `frames[]` array. Stripped by the compile worker (Plan 118) before compile().
 */
export interface StudioContentSlot extends ContentSlot {
  frameIndex: number;
}

// ─── TranslationResult ────────────────────────────────────────────────────────

/**
 * Return type of translateToTemplate() in translate.ts.
 * Carries the compile-ready Template and associated metadata.
 */
export type {
  Template,
  TemplatePageSpec,
  TemplateRegionSpec,
} from '@paragraf/template';
export type { CompileOptions } from '@paragraf/compile';
