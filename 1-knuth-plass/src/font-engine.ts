// src/font-engine.ts
// FontEngine abstraction: pluggable backends for glyph access and metrics

import { Font, FontMetrics } from '@paragraf/types';

export interface PathCommand {
  command:
    | 'moveTo'
    | 'lineTo'
    | 'quadraticCurveTo'
    | 'bezierCurveTo'
    | 'closePath';
  args: number[];
}

export interface GlyphPath {
  commands: PathCommand[];
  toSVG(precision?: number): string;
  boundingBox?: { minX: number; minY: number; maxX: number; maxY: number };
}

/**
 * A Glyph is an opaque handle to a specific glyph in a font.
 * Different font engines may represent this differently.
 */
export interface Glyph {
  index: number; // Glyph index in the font (required for all engines)
  advanceWidth: number;
  xOffset?: number; // font units; GPOS positional x adjustment
  yOffset?: number; // font units; GPOS positional y adjustment
  codePoints?: number[];
}

/**
 * FontEngine: pluggable abstraction for font access.
 * Implementations: FontkitEngine, WasmFontEngine, HarfbuzzWasmEngine, etc.
 *
 * Separation of concerns:
 * - FontEngine provides glyphs and metrics
 * - Renderers (SVG/Canvas/PDF) consume FontEngine to draw
 * - Neither renderers nor this interface care about the underlying library
 */
export interface FontEngine {
  /**
   * Load a font from file path and register it by id.
   * Called once per font during initialization.
   */
  loadFont(id: string, path: string): Promise<void>;

  /**
   * Convert text to glyphs, applying layout and shaping.
   * Does NOT apply GSUB features (ligatures, sups/subs) —
   * the caller applies those via applyLigatures() / applySingleSubstitution().
   * Pass `font` so engines that apply GSUB at shape time (e.g. WasmFontEngine)
   * can access Font.variant for sups/subs.
   */
  glyphsForString(fontId: string, text: string, font?: Font): Glyph[];

  /**
   * Get a single glyph for a Unicode code point.
   * Returns null if not found.
   * Optional — engines that shape full strings (e.g. WasmFontEngine) need not implement this.
   * Callers must guard: engine.glyphForCodePoint?.(fontId, cp)
   */
  glyphForCodePoint?(fontId: string, codePoint: number): Glyph | null;

  /**
   * Apply GSUB ligature substitution (liga, rlig features).
   * Modifies glyph sequence in place; returns the substituted glyphs.
   * If GSUB not supported or no rules match, returns [glyphs unchanged].
   */
  applyLigatures(fontId: string, glyphs: Glyph[]): Glyph[];

  /**
   * Apply GSUB single substitution (sups, subs features).
   * Maps each input glyph to its substituted form, if a rule exists.
   * If GSUB not supported or no rules match, returns [glyphs unchanged].
   */
  applySingleSubstitution(
    fontId: string,
    glyphs: Glyph[],
    featureTag: 'sups' | 'subs',
  ): Glyph[];

  /**
   * Get kerning offset between two glyphs in a font.
   * Returns 0 if no kern pair exists or kerning not supported.
   * Result is in font units (scale by fontSize / unitsPerEm).
   */
  getKerning(fontId: string, glyph1: Glyph, glyph2: Glyph): number;

  /**
   * Get glyph outline (path) for rendering.
   * Position (x, y) and fontSize are applied; returned path is ready to draw.
   */
  getGlyphPath(
    fontId: string,
    glyph: Glyph,
    x: number,
    y: number,
    fontSize: number,
  ): GlyphPath;

  /**
   * Get font-level metrics (ascender, descender, x-height, cap-height, line gap, baseline shift).
   * Result is scaled to fontSize. Pass variant to get the correct baselineShift for
   * superscript (positive) or subscript (negative) positioning.
   */
  getFontMetrics(
    fontId: string,
    fontSize: number,
    variant?: 'normal' | 'superscript' | 'subscript',
  ): FontMetrics;
}

// FontMetrics type is re-exported from src/types.ts for consistency
export type { FontMetrics };
