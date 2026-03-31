// src/engines/fontkit-engine.ts
// FontEngine adapter for fontkit v2 (ESM-native; CJS-free replacement for OpentypeJsEngine)

import { openSync as fontkitOpenSync } from 'fontkit';
import { FontEngine, Glyph, GlyphPath, PathCommand } from '../font-engine.js';
import { Font, FontMetrics } from '@paragraf/types';

export class FontkitEngine implements FontEngine {
  private fontCache = new Map<string, any>();

  async loadFont(id: string, path: string): Promise<void> {
    try {
      const font = fontkitOpenSync(path);
      this.fontCache.set(id, font);
    } catch (err) {
      throw new Error(
        `Failed to load font "${id}" from "${path}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  glyphsForString(fontId: string, text: string, font?: Font): Glyph[] {
    const fkFont = this.getFont(fontId);
    const run = fkFont.layout(text, this.featuresFor(font));
    return run.glyphs.map((g: any, i: number) => ({
      index: g.id,
      advanceWidth: run.positions[i].xAdvance,
      xOffset: run.positions[i].xOffset || undefined,
      yOffset: run.positions[i].yOffset || undefined,
      codePoints: g.codePoints as number[],
    }));
  }

  glyphForCodePoint(fontId: string, codePoint: number): Glyph | null {
    const fkFont = this.getFont(fontId);
    try {
      const g = fkFont.glyphForCodePoint(codePoint);
      if (!g) return null;
      return { index: g.id, advanceWidth: g.advanceWidth };
    } catch {
      return null;
    }
  }

  // No-op: GSUB (liga/rlig/sups/subs) is applied at layout() time in glyphsForString
  applyLigatures(_fontId: string, glyphs: Glyph[]): Glyph[] {
    return glyphs;
  }

  // No-op: single substitution is applied at layout() time in glyphsForString
  applySingleSubstitution(
    _fontId: string,
    glyphs: Glyph[],
    _featureTag: 'sups' | 'subs',
  ): Glyph[] {
    return glyphs;
  }

  // No-op: GPOS kern is already included in advanceWidth from layout() positions
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
    const fkFont = this.getFont(fontId);
    const fkGlyph = fkFont.getGlyph(glyph.index);
    if (!fkGlyph) {
      throw new Error(`Glyph ${glyph.index} not found in font "${fontId}"`);
    }

    // scale + Y-flip + translate: out_x = scale*in_x + x, out_y = -scale*in_y + y
    const scale = fontSize / fkFont.unitsPerEm;
    const path = fkGlyph.path.transform(scale, 0, 0, -scale, x, y);
    const commands = path.commands as PathCommand[];
    const d: string = path.toSVG();

    return {
      commands,
      toSVG: (_precision?: number) => (d.length > 0 ? `<path d="${d}"/>` : ''),
      boundingBox: path.bbox,
    };
  }

  getFontMetrics(
    fontId: string,
    fontSize: number,
    variant?: 'normal' | 'superscript' | 'subscript',
  ): FontMetrics {
    const fkFont = this.getFont(fontId);
    const scale = fontSize / fkFont.unitsPerEm;
    const os2 = fkFont['OS/2'];

    const ascender = (os2?.typoAscender ?? fkFont.ascent ?? 800) * scale;
    const descender = (os2?.typoDescender ?? fkFont.descent ?? -200) * scale;
    const lineGap = (os2?.typoLineGap ?? 0) * scale;
    const xHeight = (os2?.xHeight ?? 0) * scale;
    const capHeight = (os2?.capHeight ?? 0) * scale;

    let baselineShift = 0;
    if (variant === 'superscript') {
      baselineShift = (os2?.ySuperscriptYOffset ?? 0) * scale;
    } else if (variant === 'subscript') {
      baselineShift = -((os2?.ySubscriptYOffset ?? 0) * scale);
    }

    return {
      unitsPerEm: fkFont.unitsPerEm,
      ascender,
      descender,
      xHeight: xHeight > 0 ? xHeight : ascender * 0.5,
      capHeight: capHeight > 0 ? capHeight : ascender * 0.7,
      lineGap,
      baselineShift,
    };
  }

  private getFont(fontId: string): any {
    const font = this.fontCache.get(fontId);
    if (!font) {
      const registered = [...this.fontCache.keys()].join(', ') || '(none)';
      throw new Error(
        `Font id "${fontId}" not loaded. Registered fonts: ${registered}`,
      );
    }
    return font;
  }

  private featuresFor(font?: Font): string[] {
    const features = ['liga', 'rlig'];
    if (font?.variant === 'superscript') features.push('sups');
    else if (font?.variant === 'subscript') features.push('subs');
    return features;
  }
}
