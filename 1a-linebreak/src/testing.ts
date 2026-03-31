// testing.ts — mock Measurer implementations for use in tests.
// No fontkit dependency — safe to import anywhere.

import {
  MeasureText,
  GlueSpaceFn,
  GlueSpaceMetrics,
  GetFontMetrics,
  FontMetrics,
} from '@paragraf/types';

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
