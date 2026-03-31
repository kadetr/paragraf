// src/engines/wasm-engine.ts
// FontEngine implementation backed by the Rust/WASM core (rustybuzz).
// GSUB features (liga, sups/subs) and GPOS kern are applied at shape time,
// so applyLigatures / applySingleSubstitution / getKerning are no-ops.

import { readFileSync } from 'fs';
import {
  FontEngine,
  Glyph,
  GlyphPath,
  PathCommand,
} from '@paragraf/font-engine';
import { Font, FontMetrics } from '@paragraf/types';

export class WasmFontEngine implements FontEngine {
  private readonly wasm: any;

  constructor(wasm: any) {
    this.wasm = wasm;
  }

  async loadFont(id: string, path: string): Promise<void> {
    try {
      const data = readFileSync(path);
      this.wasm.register_font(id, data);
    } catch (err) {
      throw new Error(
        `WasmFontEngine: failed to load font "${id}" from "${path}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Shape `text` using rustybuzz, returning per-glyph info in font units.
   * `font` provides the font id, variant, and letter spacing.
   * When omitted, falls back to normal shaping (liga/rlig, no sups/subs).
   */
  glyphsForString(fontId: string, text: string, font?: Font): Glyph[] {
    const shapeFont: Font = font ?? {
      id: fontId,
      size: 12,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
    };

    const raw = JSON.parse(
      this.wasm.shape_text_wasm(text, JSON.stringify(shapeFont)),
    );
    if ('error' in raw)
      throw new Error(`WasmFontEngine shape_text_wasm: ${raw.error}`);

    return (
      raw.ok.glyphs as Array<{
        glyphId: number;
        advanceWidth: number;
        xOffset: number;
        yOffset: number;
      }>
    ).map((g) => ({
      index: g.glyphId,
      advanceWidth: g.advanceWidth,
      xOffset: g.xOffset,
      yOffset: g.yOffset,
    }));
  }

  // glyphForCodePoint intentionally omitted — WasmFontEngine shapes full strings via
  // shape_text_wasm; per-codepoint lookup is not needed by the rendering pipeline.
  // The FontEngine interface marks this method optional for this reason.

  // GSUB ligatures are applied by rustybuzz during shape_text_wasm — identity here
  applyLigatures(_fontId: string, glyphs: Glyph[]): Glyph[] {
    return glyphs;
  }

  // GSUB single substitution (sups/subs) is applied by rustybuzz via Font.variant — identity here
  applySingleSubstitution(
    _fontId: string,
    glyphs: Glyph[],
    _featureTag: 'sups' | 'subs',
  ): Glyph[] {
    return glyphs;
  }

  // GPOS kern is included in x_advance from shape_text_wasm — no separate adjustment needed
  getKerning(_fontId: string, _glyph1: Glyph, _glyph2: Glyph): number {
    return 0;
  }

  getGlyphPath(
    fontId: string,
    glyph: Glyph,
    x: number,
    y: number,
    fontSize: number,
  ): GlyphPath {
    const raw = JSON.parse(
      this.wasm.get_glyph_path(fontId, glyph.index, x, y, fontSize),
    );
    if ('error' in raw)
      throw new Error(`WasmFontEngine get_glyph_path: ${raw.error}`);

    const commands: PathCommand[] = raw.ok.commands;
    const d: string = raw.ok.d;

    return {
      commands,
      toSVG: (_precision?: number) => (d.length > 0 ? `<path d="${d}"/>` : ''),
      boundingBox: undefined,
    };
  }

  getFontMetrics(
    fontId: string,
    fontSize: number,
    variant?: 'normal' | 'superscript' | 'subscript',
  ): FontMetrics {
    const fontJson = JSON.stringify({
      id: fontId,
      size: fontSize,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
      variant,
    });
    const raw = JSON.parse(this.wasm.font_metrics_wasm(fontJson));
    if ('error' in raw)
      throw new Error(`WasmFontEngine font_metrics_wasm: ${raw.error}`);
    return raw.ok as FontMetrics;
  }
}
