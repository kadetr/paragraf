// tests/helpers/measure.ts
// Real fontkit-backed Measurer factory for use in tests only.
// Not part of @paragraf/linebreak's public API.

import { openSync as fontkitOpenSync } from 'fontkit';
import {
  Font,
  FontRegistry,
  FontMetrics,
  GetFontMetrics,
  MeasureText,
  GlueSpaceFn,
  GlueSpaceMetrics,
  Measurer,
} from '@paragraf/types';

const fontCache = new Map<string, any>();

const loadFontkitFont = (filePath: string, fontId: string): any => {
  if (fontCache.has(fontId)) return fontCache.get(fontId)!;
  const loaded = fontkitOpenSync(filePath);
  fontCache.set(fontId, loaded);
  return loaded;
};

const resolveFontkitFont = (font: Font, registry: FontRegistry): any => {
  const descriptor = registry.get(font.id);
  if (!descriptor) throw new Error(`Font id "${font.id}" not in registry`);
  return loadFontkitFont(descriptor.filePath, font.id);
};

const featuresFor = (font: Font): string[] => {
  const features = ['liga', 'rlig'];
  if (font.variant === 'superscript') features.push('sups');
  else if (font.variant === 'subscript') features.push('subs');
  return features;
};

const realMeasure =
  (registry: FontRegistry): MeasureText =>
  (content, font): number => {
    const fkFont = resolveFontkitFont(font, registry);
    const scale = font.size / fkFont.unitsPerEm;
    const run = fkFont.layout(content, featuresFor(font));
    let width = 0;
    for (const pos of run.positions) width += pos.xAdvance;
    const letterSpacing = font.letterSpacing ?? 0;
    if (letterSpacing !== 0 && run.positions.length > 1) {
      width += (run.positions.length - 1) * (letterSpacing / scale);
    }
    return width * scale;
  };

const realSpace =
  (registry: FontRegistry): GlueSpaceFn =>
  (font): GlueSpaceMetrics => {
    const fkFont = resolveFontkitFont(font, registry);
    const scale = font.size / fkFont.unitsPerEm;
    const spaceGlyph = fkFont.glyphForCodePoint(0x20);
    const spaceWidth = (spaceGlyph?.advanceWidth ?? 0) * scale;
    const em = font.size;
    const safeWidth = spaceWidth > 0 ? spaceWidth : em / 3;
    return { width: safeWidth, stretch: em / 6, shrink: em / 9 };
  };

const realMetrics =
  (registry: FontRegistry): GetFontMetrics =>
  (font): FontMetrics => {
    const fkFont = resolveFontkitFont(font, registry);
    const scale = font.size / fkFont.unitsPerEm;
    const os2 = fkFont['OS/2'];
    const ascender = (os2?.typoAscender ?? fkFont.ascent ?? 800) * scale;
    const descender = (os2?.typoDescender ?? fkFont.descent ?? -200) * scale;
    const lineGap = (os2?.typoLineGap ?? 0) * scale;
    const xHeight = (os2?.xHeight ?? 0) * scale;
    const capHeight = (os2?.capHeight ?? 0) * scale;
    let baselineShift = 0;
    if (font.variant === 'superscript') {
      baselineShift = (os2?.ySuperscriptYOffset ?? 0) * scale;
    } else if (font.variant === 'subscript') {
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
  };

export const createMeasurer = (
  registry: FontRegistry,
  measure?: MeasureText,
  space?: GlueSpaceFn,
  metrics?: GetFontMetrics,
): Measurer => ({
  measure: measure ?? realMeasure(registry),
  space: space ?? realSpace(registry),
  metrics: metrics ?? realMetrics(registry),
  registry,
});
