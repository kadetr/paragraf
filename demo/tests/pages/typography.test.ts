// demo/tests/pages/typography.test.ts
// Phase 6: pure-logic unit tests for the Typography page helpers.

import { describe, it, expect } from 'vitest';
import {
  clampFontSize,
  clampLeading,
  clampLetterSpacing,
  formatLetterSpacing,
  buildTypographySpecLine,
  FONT_SIZE_SLIDER,
  LEADING_SLIDER,
  LETTER_SPACING_SLIDER,
} from '../../src/pages/typography.js';

describe('FONT_SIZE_SLIDER', () => {
  it('has min=6, max=72, step=0.5', () => {
    expect(FONT_SIZE_SLIDER.min).toBe(6);
    expect(FONT_SIZE_SLIDER.max).toBe(72);
    expect(FONT_SIZE_SLIDER.step).toBe(0.5);
  });
});

describe('LEADING_SLIDER', () => {
  it('has min=0.8, max=3.0, step=0.05', () => {
    expect(LEADING_SLIDER.min).toBe(0.8);
    expect(LEADING_SLIDER.max).toBe(3.0);
    expect(LEADING_SLIDER.step).toBe(0.05);
  });
});

describe('LETTER_SPACING_SLIDER', () => {
  it('has min=-0.1, max=0.4, step=0.01', () => {
    expect(LETTER_SPACING_SLIDER.min).toBe(-0.1);
    expect(LETTER_SPACING_SLIDER.max).toBe(0.4);
    expect(LETTER_SPACING_SLIDER.step).toBe(0.01);
  });
});

describe('clampFontSize()', () => {
  it('clamps below min to min', () => {
    expect(clampFontSize(0)).toBe(FONT_SIZE_SLIDER.min);
  });

  it('clamps above max to max', () => {
    expect(clampFontSize(999)).toBe(FONT_SIZE_SLIDER.max);
  });

  it('passes through valid value', () => {
    expect(clampFontSize(12)).toBe(12);
  });
});

describe('clampLeading()', () => {
  it('clamps below min to min', () => {
    expect(clampLeading(0)).toBe(LEADING_SLIDER.min);
  });

  it('passes through valid value', () => {
    expect(clampLeading(1.5)).toBe(1.5);
  });
});

describe('clampLetterSpacing()', () => {
  it('clamps above max to max', () => {
    expect(clampLetterSpacing(1)).toBe(LETTER_SPACING_SLIDER.max);
  });

  it('passes through zero', () => {
    expect(clampLetterSpacing(0)).toBe(0);
  });
});

describe('formatLetterSpacing()', () => {
  it('formats 0 as "0 em"', () => {
    expect(formatLetterSpacing(0)).toBe('0 em');
  });

  it('formats 0.05 as "+0.05 em"', () => {
    expect(formatLetterSpacing(0.05)).toBe('+0.05 em');
  });

  it('formats -0.02 as "−0.02 em"', () => {
    // Uses proper minus sign U+2212
    expect(formatLetterSpacing(-0.02)).toBe('\u22120.02 em');
  });
});

describe('buildTypographySpecLine()', () => {
  it('returns a non-empty string with size and leading', () => {
    const line = buildTypographySpecLine(12, 1.4, 0);
    expect(line).toContain('12');
    expect(line).toContain('1.4');
  });

  it('includes letter-spacing when non-zero', () => {
    const line = buildTypographySpecLine(12, 1.4, 0.05);
    expect(line).toContain('0.05');
  });

  it('omits letter-spacing section when zero', () => {
    const line = buildTypographySpecLine(12, 1.4, 0);
    expect(line).not.toContain('em');
  });
});
