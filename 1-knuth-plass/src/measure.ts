// measure.ts

import { openSync as fontkitOpenSync } from 'fontkit';
import {
  Font,
  FontRegistry,
  FontMetrics,
  GetFontMetrics,
} from '@paragraf/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MeasureText = (content: string, font: Font) => number;
export type GlueSpaceFn = (font: Font) => GlueSpaceMetrics;
export type { GetFontMetrics };

export interface GlueSpaceMetrics {
  width: number;
  stretch: number;
  shrink: number;
}

export interface Measurer {
  measure: MeasureText;
  space: GlueSpaceFn;
  metrics: GetFontMetrics;
  registry: FontRegistry;
}

// ─── Mock implementations ────────────────────────────────────────────────────

export const mockMeasure: MeasureText = (content, font): number => {
  const base = content.length * font.size * 0.6;
  const spacing = (font.letterSpacing ?? 0) * Math.max(0, content.length - 1);
  return base + spacing;
};

export const mockSpace: GlueSpaceFn = (font): GlueSpaceMetrics => {
  const width = font.size * 0.25;
  const stretch = width * 0.5;
  const shrink = width * 0.3;
  return { width, stretch, shrink };
};

export const mockMetrics: GetFontMetrics = (font): FontMetrics => ({
  unitsPerEm: 1000,
  ascender: font.size * 0.8,
  descender: -font.size * 0.2,
  xHeight: font.size * 0.5,
  capHeight: font.size * 0.7,
  lineGap: 0,
  baselineShift:
    font.variant === 'superscript'
      ? font.size * 0.35
      : font.variant === 'subscript'
        ? -font.size * 0.15
        : 0,
});

// ─── Fontkit font cache ───────────────────────────────────────────────────────
//
// Exported so other modules can share the same loaded instances.

const fontCache = new Map<string, any>();

export const loadFontkitFont = (filePath: string, fontId: string): any => {
  if (fontCache.has(fontId)) return fontCache.get(fontId)!;
  let loaded: any;
  try {
    loaded = fontkitOpenSync(filePath);
  } catch (err) {
    throw new Error(
      `Failed to load font "${fontId}" from "${filePath}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  fontCache.set(fontId, loaded);
  return loaded;
};

export const resolveFontkitFont = (font: Font, registry: FontRegistry): any => {
  const descriptor = registry.get(font.id);
  if (!descriptor) {
    const registered = [...registry.keys()].join(', ') || '(none)';
    throw new Error(
      `Font id "${font.id}" not found in registry. Registered fonts: ${registered}`,
    );
  }
  return loadFontkitFont(descriptor.filePath, font.id);
};

// ─── Real implementations ────────────────────────────────────────────────────

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
    for (const pos of run.positions) {
      width += pos.xAdvance;
    }

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

    return {
      width: safeWidth,
      stretch: em / 6,
      shrink: em / 9,
    };
  };

// ─── OS/2 metrics ────────────────────────────────────────────────────────────

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

// ─── Factory ─────────────────────────────────────────────────────────────────

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
