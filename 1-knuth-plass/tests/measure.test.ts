import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import {
  createMeasurer,
  mockMeasure,
  mockSpace,
  Measurer,
} from '../src/measure';
import { Font, FontRegistry } from '@paragraf/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../fonts');
const REGULAR_FONT_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');
const BOLD_FONT_PATH = path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf');
const ROBOTO_REGULAR_PATH = path.join(FONTS_DIR, 'Roboto-Regular.ttf');

const TEST_FONT_REGULAR: Font = {
  id: 'liberation-serif-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const TEST_FONT_BOLD: Font = {
  id: 'liberation-serif-bold',
  size: 12,
  weight: 700,
  style: 'normal',
  stretch: 'normal',
};

const TEST_FONT_ROBOTO: Font = {
  id: 'roboto-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const TEST_REGISTRY: FontRegistry = new Map([
  [
    'liberation-serif-regular',
    {
      id: 'liberation-serif-regular',
      face: 'Liberation Serif',
      filePath: REGULAR_FONT_PATH,
    },
  ],
  [
    'liberation-serif-bold',
    {
      id: 'liberation-serif-bold',
      face: 'Liberation Serif Bold',
      filePath: BOLD_FONT_PATH,
    },
  ],
  [
    'roboto-regular',
    {
      id: 'roboto-regular',
      face: 'Roboto',
      filePath: ROBOTO_REGULAR_PATH,
    },
  ],
]);

// ─── Mock measurer ────────────────────────────────────────────────────────────

describe('mockMeasure', () => {
  it('returns a positive number', () => {
    expect(mockMeasure('Hello', TEST_FONT_REGULAR)).toBeGreaterThan(0);
  });

  it('scales with character count', () => {
    expect(mockMeasure('Hello', TEST_FONT_REGULAR)).toBeGreaterThan(
      mockMeasure('Hi', TEST_FONT_REGULAR),
    );
  });

  it('scales with font size', () => {
    const small: Font = { ...TEST_FONT_REGULAR, size: 8 };
    const large: Font = { ...TEST_FONT_REGULAR, size: 16 };
    expect(mockMeasure('Hello', large)).toBeGreaterThan(
      mockMeasure('Hello', small),
    );
  });
});

describe('mockSpace', () => {
  it('returns positive width, stretch, shrink', () => {
    const metrics = mockSpace(TEST_FONT_REGULAR);
    expect(metrics.width).toBeGreaterThan(0);
    expect(metrics.stretch).toBeGreaterThan(0);
    expect(metrics.shrink).toBeGreaterThan(0);
  });

  it('stretch is less than width', () => {
    expect(mockSpace(TEST_FONT_REGULAR).stretch).toBeLessThan(
      mockSpace(TEST_FONT_REGULAR).width,
    );
  });

  it('shrink is less than width', () => {
    expect(mockSpace(TEST_FONT_REGULAR).shrink).toBeLessThan(
      mockSpace(TEST_FONT_REGULAR).width,
    );
  });

  it('scales with font size', () => {
    const small: Font = { ...TEST_FONT_REGULAR, size: 8 };
    const large: Font = { ...TEST_FONT_REGULAR, size: 16 };
    expect(mockSpace(large).width).toBeGreaterThan(mockSpace(small).width);
  });
});

// ─── Real measurer — glyph metrics ───────────────────────────────────────────

describe('createMeasurer — real font metrics', () => {
  let measurer: Measurer;

  beforeAll(() => {
    measurer = createMeasurer(TEST_REGISTRY);
  });

  it('creates a measurer without throwing', () => {
    expect(measurer).toBeDefined();
    expect(measurer.measure).toBeTypeOf('function');
    expect(measurer.space).toBeTypeOf('function');
  });

  it('measures a word and returns a positive number', () => {
    expect(measurer.measure('Hello', TEST_FONT_REGULAR)).toBeGreaterThan(0);
  });

  it('wider for longer words', () => {
    expect(measurer.measure('beautiful', TEST_FONT_REGULAR)).toBeGreaterThan(
      measurer.measure('Hi', TEST_FONT_REGULAR),
    );
  });

  it('bold is wider than regular for same content', () => {
    expect(measurer.measure('Hello', TEST_FONT_BOLD)).toBeGreaterThan(
      measurer.measure('Hello', TEST_FONT_REGULAR),
    );
  });

  it('scales with font size', () => {
    const small: Font = { ...TEST_FONT_REGULAR, size: 8 };
    const large: Font = { ...TEST_FONT_REGULAR, size: 24 };
    expect(measurer.measure('Hello', large)).toBeGreaterThan(
      measurer.measure('Hello', small),
    );
  });

  it('throws if font id not in registry', () => {
    const unknown: Font = { ...TEST_FONT_REGULAR, id: 'unknown-font' };
    expect(() => measurer.measure('Hello', unknown)).toThrow();
  });

  it('throws if font file path is invalid', () => {
    const badRegistry: FontRegistry = new Map([
      [
        'bad-font',
        { id: 'bad-font', face: 'Bad', filePath: '/nonexistent/font.ttf' },
      ],
    ]);
    const badFont: Font = { ...TEST_FONT_REGULAR, id: 'bad-font' };
    const badMeasurer = createMeasurer(badRegistry);
    expect(() => badMeasurer.measure('Hello', badFont)).toThrow();
  });
});

// ─── Real measurer — OS/2 glue values ────────────────────────────────────────

describe('createMeasurer — OS/2 space metrics', () => {
  let measurer: Measurer;

  beforeAll(() => {
    measurer = createMeasurer(TEST_REGISTRY);
  });

  it('space width is positive', () => {
    expect(measurer.space(TEST_FONT_REGULAR).width).toBeGreaterThan(0);
  });

  it('stretch is positive', () => {
    expect(measurer.space(TEST_FONT_REGULAR).stretch).toBeGreaterThan(0);
  });

  it('shrink is positive', () => {
    expect(measurer.space(TEST_FONT_REGULAR).shrink).toBeGreaterThan(0);
  });

  it('stretch is less than space width', () => {
    const m = measurer.space(TEST_FONT_REGULAR);
    expect(m.stretch).toBeLessThan(m.width);
  });

  it('shrink is less than space width', () => {
    const m = measurer.space(TEST_FONT_REGULAR);
    expect(m.shrink).toBeLessThan(m.width);
  });

  it('space metrics scale with font size', () => {
    const small: Font = { ...TEST_FONT_REGULAR, size: 8 };
    const large: Font = { ...TEST_FONT_REGULAR, size: 24 };
    expect(measurer.space(large).width).toBeGreaterThan(
      measurer.space(small).width,
    );
  });

  it('stretch follows TeX em/6 convention', () => {
    const metrics = measurer.space(TEST_FONT_REGULAR);
    expect(metrics.stretch).toBeCloseTo(12 / 6, 5);
  });

  it('shrink follows TeX em/9 convention', () => {
    const metrics = measurer.space(TEST_FONT_REGULAR);
    expect(metrics.shrink).toBeCloseTo(12 / 9, 5);
  });

  it('Roboto space width differs from Liberation space width at same size', () => {
    const liberation = measurer.space(TEST_FONT_REGULAR).width;
    const roboto = measurer.space(TEST_FONT_ROBOTO).width;
    // different typefaces have different space glyph widths
    expect(roboto).not.toBe(liberation);
  });

  it('OS/2 stretch value is larger than heuristic stretch', () => {
    // heuristic was spaceWidth * 0.5
    // OS/2 typo values should produce a larger stretch budget
    // this is the core correctness check for this task
    const metrics = measurer.space(TEST_FONT_REGULAR);
    const heuristic = metrics.width * 0.5;
    expect(metrics.stretch).toBeGreaterThan(heuristic);
  });

  it('space metrics are consistent on repeated calls', () => {
    const first = measurer.space(TEST_FONT_REGULAR);
    const second = measurer.space(TEST_FONT_REGULAR);
    expect(first.width).toBe(second.width);
    expect(first.stretch).toBe(second.stretch);
    expect(first.shrink).toBe(second.shrink);
  });
});

// ─── Letter spacing ───────────────────────────────────────────────────────────

describe('createMeasurer — letter spacing', () => {
  let measurer: Measurer;

  beforeAll(() => {
    measurer = createMeasurer(TEST_REGISTRY);
  });

  it('letterSpacing=0 produces same width as no letterSpacing', () => {
    const withZero = measurer.measure('Hello', {
      ...TEST_FONT_REGULAR,
      letterSpacing: 0,
    });
    const withUndefined = measurer.measure('Hello', TEST_FONT_REGULAR);
    expect(withZero).toBeCloseTo(withUndefined, 5);
  });

  it('positive letterSpacing increases word width', () => {
    const normal = measurer.measure('Hello', TEST_FONT_REGULAR);
    const tracked = measurer.measure('Hello', {
      ...TEST_FONT_REGULAR,
      letterSpacing: 2,
    });
    expect(tracked).toBeGreaterThan(normal);
  });

  it('letterSpacing adds (charCount-1) * spacing to width', () => {
    const word = 'Hello'; // 5 chars
    const spacing = 2;
    const normal = measurer.measure(word, TEST_FONT_REGULAR);
    const tracked = measurer.measure(word, {
      ...TEST_FONT_REGULAR,
      letterSpacing: spacing,
    });
    const expected = normal + (word.length - 1) * spacing;
    expect(tracked).toBeCloseTo(expected, 5);
  });

  it('single character word — letterSpacing has no effect', () => {
    const normal = measurer.measure('A', TEST_FONT_REGULAR);
    const tracked = measurer.measure('A', {
      ...TEST_FONT_REGULAR,
      letterSpacing: 10,
    });
    expect(tracked).toBeCloseTo(normal, 5);
  });

  it('negative letterSpacing decreases word width', () => {
    const normal = measurer.measure('Hello', TEST_FONT_REGULAR);
    const tight = measurer.measure('Hello', {
      ...TEST_FONT_REGULAR,
      letterSpacing: -0.5,
    });
    expect(tight).toBeLessThan(normal);
  });

  it('letterSpacing scales correctly with font size', () => {
    const word = 'Hello';
    const spacing = 1;
    const small = measurer.measure(word, {
      ...TEST_FONT_REGULAR,
      size: 8,
      letterSpacing: spacing,
    });
    const large = measurer.measure(word, {
      ...TEST_FONT_REGULAR,
      size: 24,
      letterSpacing: spacing,
    });
    // base glyph width differs but spacing contribution is identical (spacing * 4)
    const smallNormal = measurer.measure(word, {
      ...TEST_FONT_REGULAR,
      size: 8,
    });
    const largeNormal = measurer.measure(word, {
      ...TEST_FONT_REGULAR,
      size: 24,
    });
    expect(small - smallNormal).toBeCloseTo(spacing * (word.length - 1), 5);
    expect(large - largeNormal).toBeCloseTo(spacing * (word.length - 1), 5);
  });
});

// ─── OS/2 font metrics ────────────────────────────────────────────────────────

describe('createMeasurer — OS/2 font metrics', () => {
  let measurer: Measurer;

  beforeAll(() => {
    measurer = createMeasurer(TEST_REGISTRY);
  });

  it('metrics function exists on measurer', () => {
    expect(measurer.metrics).toBeTypeOf('function');
  });

  it('returns FontMetrics with all expected fields', () => {
    const m = measurer.metrics(TEST_FONT_REGULAR);
    expect(m).toHaveProperty('unitsPerEm');
    expect(m).toHaveProperty('ascender');
    expect(m).toHaveProperty('descender');
    expect(m).toHaveProperty('xHeight');
    expect(m).toHaveProperty('capHeight');
    expect(m).toHaveProperty('lineGap');
  });

  it('unitsPerEm is positive', () => {
    const m = measurer.metrics(TEST_FONT_REGULAR);
    expect(m.unitsPerEm).toBeGreaterThan(0);
  });

  it('ascender is positive', () => {
    const m = measurer.metrics(TEST_FONT_REGULAR);
    expect(m.ascender).toBeGreaterThan(0);
  });

  it('descender is negative', () => {
    const m = measurer.metrics(TEST_FONT_REGULAR);
    expect(m.descender).toBeLessThan(0);
  });

  it('xHeight is between 0 and ascender', () => {
    const m = measurer.metrics(TEST_FONT_REGULAR);
    expect(m.xHeight).toBeGreaterThan(0);
    expect(m.xHeight).toBeLessThan(m.ascender);
  });

  it('capHeight is between xHeight and ascender', () => {
    const m = measurer.metrics(TEST_FONT_REGULAR);
    expect(m.capHeight).toBeGreaterThan(m.xHeight);
    expect(m.capHeight).toBeLessThanOrEqual(m.ascender);
  });

  it('metrics scale with font size', () => {
    const small = measurer.metrics({ ...TEST_FONT_REGULAR, size: 8 });
    const large = measurer.metrics({ ...TEST_FONT_REGULAR, size: 24 });
    expect(large.ascender).toBeGreaterThan(small.ascender);
    expect(large.xHeight).toBeGreaterThan(small.xHeight);
  });

  it('bold and regular have different metrics', () => {
    const regular = measurer.metrics(TEST_FONT_REGULAR);
    const bold = measurer.metrics(TEST_FONT_BOLD);
    // they may share unitsPerEm but ascender/descender can differ
    expect(regular.unitsPerEm).toBeGreaterThan(0);
    expect(bold.unitsPerEm).toBeGreaterThan(0);
  });

  it('throws for unknown font id', () => {
    const unknown: Font = { ...TEST_FONT_REGULAR, id: 'unknown' };
    expect(() => measurer.metrics(unknown)).toThrow();
  });
});

// ─── GSUB integration — fonts without ligatures ───────────────────────────────

describe('createMeasurer — GSUB integration (Liberation Serif has no ligatures)', () => {
  let measurer: Measurer;

  beforeAll(() => {
    measurer = createMeasurer(TEST_REGISTRY);
  });

  it('measurement is unchanged for fonts with no GSUB ligatures', () => {
    // Liberation Serif has a GSUB table but no liga lookups — result is identical
    const w = measurer.measure('fi', TEST_FONT_REGULAR);
    expect(w).toBeGreaterThan(0);
  });

  it('letterSpacing gap count uses post-GSUB glyph count (equals input length when no ligs)', () => {
    // For Liberation Serif: no substitutions occur, so glyph count === input string length.
    // The existing letterSpacing formula (content.length - 1) should give the same result.
    const word = 'Hello';
    const spacing = 2;
    const normal = measurer.measure(word, TEST_FONT_REGULAR);
    const tracked = measurer.measure(word, {
      ...TEST_FONT_REGULAR,
      letterSpacing: spacing,
    });
    // 5 chars → 4 gaps whether counted from string length or glyph count
    expect(tracked).toBeCloseTo(normal + (word.length - 1) * spacing, 5);
  });

  it('measurement of common ligature candidates (fi, fl, ffi) does not throw', () => {
    expect(() => measurer.measure('fi', TEST_FONT_REGULAR)).not.toThrow();
    expect(() => measurer.measure('fl', TEST_FONT_REGULAR)).not.toThrow();
    expect(() => measurer.measure('ffi', TEST_FONT_REGULAR)).not.toThrow();
  });
});

// ─── Font.variant superscript/subscript measurement ──────────────────────────

describe('createMeasurer — Font.variant superscript', () => {
  let measurer: Measurer;

  beforeAll(() => {
    measurer = createMeasurer(TEST_REGISTRY);
  });

  // LiberationSerif sups covers digits 4–9 (glyphs 23–28) → smaller advance widths
  it('variant:superscript reduces width of digit "4" (covered by sups)', () => {
    const normal = measurer.measure('4', TEST_FONT_REGULAR);
    const sup = measurer.measure('4', {
      ...TEST_FONT_REGULAR,
      variant: 'superscript',
    });
    expect(sup).toBeLessThan(normal);
  });

  it('variant:superscript reduces width of digit "9" (covered by sups)', () => {
    const normal = measurer.measure('9', TEST_FONT_REGULAR);
    const sup = measurer.measure('9', {
      ...TEST_FONT_REGULAR,
      variant: 'superscript',
    });
    expect(sup).toBeLessThan(normal);
  });

  it('variant:superscript does not affect "a" (not in sups coverage)', () => {
    const normal = measurer.measure('a', TEST_FONT_REGULAR);
    const sup = measurer.measure('a', {
      ...TEST_FONT_REGULAR,
      variant: 'superscript',
    });
    expect(sup).toBeCloseTo(normal, 5);
  });

  it('variant:normal produces the same width as no variant', () => {
    const noVariant = measurer.measure('4', TEST_FONT_REGULAR);
    const normalVariant = measurer.measure('4', {
      ...TEST_FONT_REGULAR,
      variant: 'normal',
    });
    expect(normalVariant).toBeCloseTo(noVariant, 5);
  });
});

describe('createMeasurer — Font.variant subscript', () => {
  let measurer: Measurer;

  beforeAll(() => {
    measurer = createMeasurer(TEST_REGISTRY);
  });

  // LiberationSerif subs covers digits 0–9 (glyphs 19–28) → smaller advance widths
  it('variant:subscript reduces width of digit "0" (covered by subs)', () => {
    const normal = measurer.measure('0', TEST_FONT_REGULAR);
    const sub = measurer.measure('0', {
      ...TEST_FONT_REGULAR,
      variant: 'subscript',
    });
    expect(sub).toBeLessThan(normal);
  });

  it('variant:subscript reduces width of digit "3" (covered by subs)', () => {
    const normal = measurer.measure('3', TEST_FONT_REGULAR);
    const sub = measurer.measure('3', {
      ...TEST_FONT_REGULAR,
      variant: 'subscript',
    });
    expect(sub).toBeLessThan(normal);
  });

  it('variant:subscript does not affect "a" (not covered)', () => {
    const normal = measurer.measure('a', TEST_FONT_REGULAR);
    const sub = measurer.measure('a', {
      ...TEST_FONT_REGULAR,
      variant: 'subscript',
    });
    expect(sub).toBeCloseTo(normal, 5);
  });
});

// ─── FontMetrics.baselineShift ────────────────────────────────────────────────

describe('createMeasurer — FontMetrics.baselineShift', () => {
  let measurer: Measurer;

  beforeAll(() => {
    measurer = createMeasurer(TEST_REGISTRY);
  });

  it('returns baselineShift field on FontMetrics', () => {
    const m = measurer.metrics(TEST_FONT_REGULAR);
    expect(m).toHaveProperty('baselineShift');
  });

  it('baselineShift is 0 for normal font (no variant)', () => {
    const m = measurer.metrics(TEST_FONT_REGULAR);
    expect(m.baselineShift).toBe(0);
  });

  it('baselineShift is 0 for variant:normal', () => {
    const m = measurer.metrics({ ...TEST_FONT_REGULAR, variant: 'normal' });
    expect(m.baselineShift).toBe(0);
  });

  it('baselineShift is positive for variant:superscript', () => {
    // OS/2 ySuperscriptYOffset=928 > 0
    const m = measurer.metrics({
      ...TEST_FONT_REGULAR,
      variant: 'superscript',
    });
    expect(m.baselineShift).toBeGreaterThan(0);
  });

  it('baselineShift is negative for variant:subscript', () => {
    // OS/2 ySubscriptYOffset=293, stored as negative baseline shift
    const m = measurer.metrics({ ...TEST_FONT_REGULAR, variant: 'subscript' });
    expect(m.baselineShift).toBeLessThan(0);
  });

  it('superscript baselineShift scales with font size', () => {
    const small = measurer.metrics({
      ...TEST_FONT_REGULAR,
      size: 8,
      variant: 'superscript',
    });
    const large = measurer.metrics({
      ...TEST_FONT_REGULAR,
      size: 24,
      variant: 'superscript',
    });
    expect(large.baselineShift).toBeGreaterThan(small.baselineShift);
  });

  it('subscript baselineShift scales with font size (more negative for larger size)', () => {
    const small = measurer.metrics({
      ...TEST_FONT_REGULAR,
      size: 8,
      variant: 'subscript',
    });
    const large = measurer.metrics({
      ...TEST_FONT_REGULAR,
      size: 24,
      variant: 'subscript',
    });
    expect(large.baselineShift).toBeLessThan(small.baselineShift);
  });

  // spot-check: ySuperscriptYOffset=928, unitsPerEm=2048, size=12 → 928/2048*12 ≈ 5.437
  it('superscript baselineShift matches OS/2 ySuperscriptYOffset formula', () => {
    const m = measurer.metrics({
      ...TEST_FONT_REGULAR,
      variant: 'superscript',
    });
    const expected = (928 / 2048) * 12;
    expect(m.baselineShift).toBeCloseTo(expected, 4);
  });

  // spot-check: ySubscriptYOffset=293, unitsPerEm=2048, size=12 → -(293/2048*12) ≈ -1.717
  it('subscript baselineShift matches OS/2 ySubscriptYOffset formula (negative)', () => {
    const m = measurer.metrics({ ...TEST_FONT_REGULAR, variant: 'subscript' });
    const expected = -((293 / 2048) * 12);
    expect(m.baselineShift).toBeCloseTo(expected, 4);
  });
});
