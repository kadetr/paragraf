// demo/src/browser-engine.ts
// Browser-compatible FontEngine backed by the pkg-bundler WASM module.
// No 'fs' import — fonts loaded via loadFontBytes() (fetch + ArrayBuffer).

import type { Font, FontMetrics } from '@paragraf/types';
import type {
  FontEngine,
  Glyph,
  GlyphPath,
  PathCommand,
} from '@paragraf/font-engine';
import {
  register_font,
  shape_text_wasm,
  get_glyph_path,
  font_metrics_wasm,
} from '../../2a-shaping-wasm/wasm/pkg-bundler/knuth_plass_wasm.js';

export class BrowserWasmFontEngine implements FontEngine {
  async loadFont(_id: string, _path: string): Promise<void> {
    throw new Error(
      '[paragraf-demo] Use loadFontBytes() — browser cannot read file paths.',
    );
  }

  loadFontBytes(id: string, bytes: Uint8Array): void {
    register_font(id, bytes);
  }

  glyphsForString(fontId: string, text: string, font?: Font): Glyph[] {
    const shapeFont: Font = font ?? {
      id: fontId,
      size: 12,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
    };
    const raw = JSON.parse(shape_text_wasm(text, JSON.stringify(shapeFont)));
    if ('error' in raw) throw new Error(`shape_text_wasm: ${raw.error}`);
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
      xOffset: g.xOffset || undefined,
      yOffset: g.yOffset || undefined,
    }));
  }

  // GSUB ligatures applied at shape time by rustybuzz — identity here
  applyLigatures(_fontId: string, glyphs: Glyph[]): Glyph[] {
    return glyphs;
  }

  // GSUB sups/subs applied at shape time — identity here
  applySingleSubstitution(
    _fontId: string,
    glyphs: Glyph[],
    _featureTag: 'sups' | 'subs',
  ): Glyph[] {
    return glyphs;
  }

  // GPOS kern included in advanceWidth from shape_text_wasm
  getKerning(_fontId: string, _g1: Glyph, _g2: Glyph): number {
    return 0;
  }

  getGlyphPath(
    fontId: string,
    glyph: Glyph,
    x: number,
    y: number,
    fontSize: number,
  ): GlyphPath {
    const raw = JSON.parse(get_glyph_path(fontId, glyph.index, x, y, fontSize));
    if ('error' in raw) throw new Error(`get_glyph_path: ${raw.error}`);
    const commands: PathCommand[] = raw.ok.commands;
    const d: string = raw.ok.d;
    return {
      commands,
      toSVG: () => (d.length > 0 ? `<path d="${d}"/>` : ''),
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
      variant: variant ?? 'normal',
    });
    const raw = JSON.parse(font_metrics_wasm(fontJson));
    if ('error' in raw) throw new Error(`font_metrics_wasm: ${raw.error}`);
    return raw.ok as FontMetrics;
  }
}
