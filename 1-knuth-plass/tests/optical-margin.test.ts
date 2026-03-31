// tests/optical-margin.test.ts
//
// TDD tests for src/optical-margin.ts:
//   Phase A — PROTRUSION_TABLE + lookupProtrusion
//   Phase B — buildOmaAdjustments
//   Phase C — buildOmaInput
//   Phase D — ParagraphInput.opticalMarginAlignment integration

import { describe, it, expect, vi } from 'vitest';
import {
  PROTRUSION_TABLE,
  lookupProtrusion,
  buildOmaAdjustments,
  buildOmaInput,
} from '../src/optical-margin';
import type { ComposedLine, ComposedParagraph } from '@paragraf/types';
import type { ParagraphInput } from '../src/paragraph';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeFont(size = 12) {
  return {
    id: 'f',
    size,
    weight: 400,
    style: 'normal' as const,
    stretch: 'normal' as const,
  };
}

function makeLine(
  firstWord: string,
  lastWord: string,
  fontSize = 12,
  lineWidth = 300,
): ComposedLine {
  const font = makeFont(fontSize);
  const words = firstWord === lastWord ? [firstWord] : [firstWord, lastWord];
  return {
    words,
    fonts: words.map(() => font),
    wordRuns: words.map((w) => [{ text: w, font }]),
    wordSpacing: 3,
    hyphenated: false,
    ratio: 0,
    alignment: 'justified',
    isWidow: false,
    lineWidth,
    lineHeight: 14.4,
    baseline: 11.52,
  };
}

function makeHyphenatedLine(lastWord: string, fontSize = 12): ComposedLine {
  const font = makeFont(fontSize);
  return {
    words: ['hello', lastWord],
    fonts: [font, font],
    wordRuns: [[{ text: 'hello', font }], [{ text: lastWord, font }]],
    wordSpacing: 3,
    hyphenated: true,
    ratio: 0,
    alignment: 'justified',
    isWidow: false,
    lineWidth: 300,
    lineHeight: 14.4,
    baseline: 11.52,
  };
}

function makeInput(lineWidth = 300): ParagraphInput {
  return { text: 'hello world', font: makeFont(), lineWidth };
}

// ─── Phase A — PROTRUSION_TABLE + lookupProtrusion ───────────────────────────

describe('PROTRUSION_TABLE', () => {
  it('is a Map', () => {
    expect(PROTRUSION_TABLE).toBeInstanceOf(Map);
  });

  it('contains hyphen entry', () => {
    expect(PROTRUSION_TABLE.has('-')).toBe(true);
  });

  it('contains comma entry', () => {
    expect(PROTRUSION_TABLE.has(',')).toBe(true);
  });

  it('contains period entry', () => {
    expect(PROTRUSION_TABLE.has('.')).toBe(true);
  });

  it('contains open double quote entry', () => {
    expect(PROTRUSION_TABLE.has('\u201C')).toBe(true); // "
  });

  it('all values are fractions in [0, 1]', () => {
    for (const [, v] of PROTRUSION_TABLE) {
      expect(v.left).toBeGreaterThanOrEqual(0);
      expect(v.left).toBeLessThanOrEqual(1);
      expect(v.right).toBeGreaterThanOrEqual(0);
      expect(v.right).toBeLessThanOrEqual(1);
    }
  });
});

describe('lookupProtrusion', () => {
  it('returns {0.5, 0.5} for hyphen', () => {
    const p = lookupProtrusion('-');
    expect(p.left).toBeCloseTo(0.5, 5);
    expect(p.right).toBeCloseTo(0.5, 5);
  });

  it('returns {0, 0.7} for comma', () => {
    const p = lookupProtrusion(',');
    expect(p.left).toBeCloseTo(0, 5);
    expect(p.right).toBeCloseTo(0.7, 5);
  });

  it('returns {0, 0.7} for period', () => {
    const p = lookupProtrusion('.');
    expect(p.left).toBeCloseTo(0, 5);
    expect(p.right).toBeCloseTo(0.7, 5);
  });

  it('returns {0.7, 0} for open double curly quote', () => {
    const p = lookupProtrusion('\u201C'); // "
    expect(p.left).toBeCloseTo(0.7, 5);
    expect(p.right).toBeCloseTo(0, 5);
  });

  it('returns {0, 0.7} for close double curly quote', () => {
    const p = lookupProtrusion('\u201D'); // "
    expect(p.left).toBeCloseTo(0, 5);
    expect(p.right).toBeCloseTo(0.7, 5);
  });

  it('returns {0, 0} for a normal letter', () => {
    const p = lookupProtrusion('A');
    expect(p.left).toBe(0);
    expect(p.right).toBe(0);
  });

  it('returns {0, 0} for empty string', () => {
    const p = lookupProtrusion('');
    expect(p.left).toBe(0);
    expect(p.right).toBe(0);
  });

  it('returns {0, 0} for a digit', () => {
    const p = lookupProtrusion('5');
    expect(p.left).toBe(0);
    expect(p.right).toBe(0);
  });

  it('returns {0.5, 0.5} for em dash', () => {
    const p = lookupProtrusion('\u2014'); // —
    expect(p.left).toBeCloseTo(0.5, 5);
    expect(p.right).toBeCloseTo(0.5, 5);
  });

  it('returns {0.3, 0} for open parenthesis', () => {
    const p = lookupProtrusion('(');
    expect(p.left).toBeCloseTo(0.3, 5);
    expect(p.right).toBeCloseTo(0, 5);
  });

  it('returns {0, 0.3} for close parenthesis', () => {
    const p = lookupProtrusion(')');
    expect(p.left).toBeCloseTo(0, 5);
    expect(p.right).toBeCloseTo(0.3, 5);
  });
});

// ─── Phase B — buildOmaAdjustments ───────────────────────────────────────────

describe('buildOmaAdjustments', () => {
  it('returns arrays of same length as lines', () => {
    const lines: ComposedParagraph = [
      makeLine('hello', 'world'),
      makeLine('foo', 'bar'),
    ];
    const { lineWidths, xOffsets } = buildOmaAdjustments(lines, 300);
    expect(lineWidths).toHaveLength(2);
    expect(xOffsets).toHaveLength(2);
  });

  it('lineWidth is unchanged for lines with no protruding chars', () => {
    const line = makeLine('hello', 'world', 12, 300);
    const { lineWidths } = buildOmaAdjustments([line], 300);
    expect(lineWidths[0]).toBeCloseTo(300, 5);
  });

  it('lineWidth widens when line ends with comma (right protrusion)', () => {
    // last word ends with comma → right protrusion = 0.7 * 12 = 8.4
    const line = makeLine('hello', 'end,', 12, 300);
    const { lineWidths } = buildOmaAdjustments([line], 300);
    expect(lineWidths[0]).toBeGreaterThan(300);
    expect(lineWidths[0]).toBeCloseTo(308.4, 3);
  });

  it('lineWidth widens when line starts with open double quote (left protrusion)', () => {
    // first word starts with " → left protrusion = 0.7 * 12 = 8.4
    const line = makeLine('\u201Chello', 'world', 12, 300);
    const { lineWidths } = buildOmaAdjustments([line], 300);
    expect(lineWidths[0]).toBeGreaterThan(300);
    expect(lineWidths[0]).toBeCloseTo(308.4, 3);
  });

  it('xOffset is negative when line starts with open double quote', () => {
    const line = makeLine('\u201Chello', 'world', 12, 300);
    const { xOffsets } = buildOmaAdjustments([line], 300);
    expect(xOffsets[0]).toBeLessThan(0);
    expect(xOffsets[0]).toBeCloseTo(-8.4, 3);
  });

  it('xOffset is 0 for lines with no left protrusion', () => {
    const line = makeLine('hello', 'end,', 12, 300);
    const { xOffsets } = buildOmaAdjustments([line], 300);
    expect(xOffsets[0]).toBeCloseTo(0, 5);
  });

  it('both left and right protrude: lineWidths = baseWidth + left + right', () => {
    // starts with ", ends with ,
    const line = makeLine('\u201Chello', 'end,', 12, 300);
    const { lineWidths, xOffsets } = buildOmaAdjustments([line], 300);
    // left = 0.7*12 = 8.4, right = 0.7*12 = 8.4 → lineWidth = 316.8
    expect(lineWidths[0]).toBeCloseTo(316.8, 3);
    expect(xOffsets[0]).toBeCloseTo(-8.4, 3);
  });

  it('hyphenated last word: trailing hyphen protrudes at 0.5 * fontSize', () => {
    // The visible '-' at the right margin is in PROTRUSION_TABLE at 0.5; 0.5*12 = 6
    const line = makeHyphenatedLine('part-', 12);
    const { lineWidths } = buildOmaAdjustments([line], 300);
    // hyphen on right: +6
    expect(lineWidths[0]).toBeCloseTo(306, 3);
  });

  it('works for font size 14', () => {
    const line = makeLine(',hello', 'world.', 14, 300);
    const { lineWidths, xOffsets } = buildOmaAdjustments([line], 300);
    // left: ',' → 0.0 (comma is right-only), right: '.' → 0.7*14=9.8
    expect(lineWidths[0]).toBeCloseTo(309.8, 3);
    expect(xOffsets[0]).toBeCloseTo(0, 5);
  });

  it('empty lines array returns empty arrays', () => {
    const { lineWidths, xOffsets } = buildOmaAdjustments([], 300);
    expect(lineWidths).toHaveLength(0);
    expect(xOffsets).toHaveLength(0);
  });

  it('line with empty words has no protrusion (no crash)', () => {
    const font = makeFont();
    const line: ComposedLine = {
      words: [],
      fonts: [],
      wordRuns: [],
      wordSpacing: 0,
      hyphenated: false,
      ratio: 0,
      alignment: 'left',
      isWidow: false,
      lineWidth: 300,
      lineHeight: 12,
      baseline: 9.6,
    };
    const { lineWidths, xOffsets } = buildOmaAdjustments([line], 300);
    expect(lineWidths[0]).toBeCloseTo(300, 5);
    expect(xOffsets[0]).toBeCloseTo(0, 5);
  });
});

// ─── Phase C — buildOmaInput ─────────────────────────────────────────────────

describe('buildOmaInput', () => {
  it('returns a ParagraphInput with lineWidths set', () => {
    const lines: ComposedParagraph = [makeLine('hello', 'world,')];
    const input = makeInput(300);
    const result = buildOmaInput(input, lines);
    expect(result.lineWidths).toBeDefined();
    expect(result.lineWidths!).toHaveLength(1);
  });

  it('sets opticalMarginAlignment to false to prevent infinite two-pass loop', () => {
    const lines: ComposedParagraph = [makeLine('hello', 'world')];
    const result = buildOmaInput(
      { ...makeInput(), opticalMarginAlignment: true },
      lines,
    );
    expect(result.opticalMarginAlignment).toBe(false);
  });

  it('preserves all other input fields', () => {
    const input: ParagraphInput = {
      ...makeInput(),
      tolerance: 5,
      alignment: 'left',
      opticalMarginAlignment: true,
    };
    const result = buildOmaInput(input, [makeLine('hello', 'world')]);
    expect(result.tolerance).toBe(5);
    expect(result.alignment).toBe('left');
  });

  it('lineWidths from buildOmaInput match those from buildOmaAdjustments', () => {
    const lines: ComposedParagraph = [
      makeLine('\u201Chello', 'world,', 12, 300),
    ];
    const input = makeInput(300);
    const result = buildOmaInput(input, lines);
    const { lineWidths } = buildOmaAdjustments(lines, 300);
    expect(result.lineWidths![0]).toBeCloseTo(lineWidths[0], 5);
  });
});

// ─── Phase D — ParagraphInput.opticalMarginAlignment flag ────────────────────

describe('ParagraphInput.opticalMarginAlignment type', () => {
  it('accepts opticalMarginAlignment: true', () => {
    const input: ParagraphInput = {
      text: 'hello',
      font: makeFont(),
      lineWidth: 300,
      opticalMarginAlignment: true,
    };
    expect(input.opticalMarginAlignment).toBe(true);
  });

  it('accepts opticalMarginAlignment: false', () => {
    const input: ParagraphInput = {
      text: 'hello',
      font: makeFont(),
      lineWidth: 300,
      opticalMarginAlignment: false,
    };
    expect(input.opticalMarginAlignment).toBe(false);
  });

  it('is optional (undefined by default)', () => {
    const input: ParagraphInput = {
      text: 'hello',
      font: makeFont(),
      lineWidth: 300,
    };
    expect(input.opticalMarginAlignment).toBeUndefined();
  });
});
