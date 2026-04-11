// demo/tests/pages/layout.test.ts
// Phase 5: pure-logic unit tests for the Layout page helpers.

import { describe, it, expect } from 'vitest';
import {
  paperSize,
  applyOrientation,
  computeTextArea,
  buildLayoutSvg,
  PAPER_SIZES,
} from '../../src/pages/layout.js';

describe('PAPER_SIZES', () => {
  it('exports A4, A5, Letter', () => {
    expect(Object.keys(PAPER_SIZES)).toEqual(
      expect.arrayContaining(['A4', 'A5', 'Letter']),
    );
  });
});

describe('paperSize()', () => {
  it('A4 is 595.28 × 841.89 pt', () => {
    const s = paperSize('A4');
    expect(s.width).toBeCloseTo(595.28, 2);
    expect(s.height).toBeCloseTo(841.89, 2);
  });

  it('A5 is 419.53 × 595.28 pt', () => {
    const s = paperSize('A5');
    expect(s.width).toBeCloseTo(419.53, 2);
    expect(s.height).toBeCloseTo(595.28, 2);
  });

  it('Letter is 612 × 792 pt', () => {
    const s = paperSize('Letter');
    expect(s.width).toBeCloseTo(612, 2);
    expect(s.height).toBeCloseTo(792, 2);
  });
});

describe('applyOrientation()', () => {
  it('portrait keeps width < height unchanged', () => {
    const r = applyOrientation({ width: 100, height: 200 }, 'portrait');
    expect(r).toEqual({ width: 100, height: 200 });
  });

  it('landscape swaps width and height', () => {
    const r = applyOrientation({ width: 100, height: 200 }, 'landscape');
    expect(r).toEqual({ width: 200, height: 100 });
  });

  it('landscape on already-landscape dims keeps them', () => {
    const r = applyOrientation({ width: 200, height: 100 }, 'landscape');
    expect(r).toEqual({ width: 200, height: 100 });
  });
});

describe('computeTextArea()', () => {
  it('single column: width = pageWidth − marginL − marginR', () => {
    const cols = computeTextArea(500, 50, 50, 1, 0);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toBeCloseTo(400, 2);
  });

  it('two equal columns with gutter', () => {
    // pageWidth=500, margins=50 each → text=400; 2 cols, gutter=20 → each = (400−20)/2 = 190
    const cols = computeTextArea(500, 50, 50, 2, 20);
    expect(cols).toHaveLength(2);
    expect(cols[0]).toBeCloseTo(190, 2);
    expect(cols[1]).toBeCloseTo(190, 2);
  });

  it('three columns with gutter', () => {
    // pageWidth=620, margins=60 each → text=500; 3 cols, gutter=10 → each = (500−20)/3 ≈ 160
    const cols = computeTextArea(620, 60, 60, 3, 10);
    expect(cols).toHaveLength(3);
    expect(cols[0]).toBeCloseTo(160, 2);
  });
});

describe('buildLayoutSvg()', () => {
  it('returns a string starting with <svg', () => {
    const svg = buildLayoutSvg(
      { width: 595.28, height: 841.89 },
      50,
      50,
      50,
      50,
      1,
      0,
    );
    expect(svg).toMatch(/^<svg/);
  });

  it('contains one <rect class="column-area">', () => {
    const svg = buildLayoutSvg(
      { width: 595.28, height: 841.89 },
      50,
      50,
      50,
      50,
      1,
      0,
    );
    const matches = svg.match(/class="column-area"/g);
    expect(matches).toHaveLength(1);
  });

  it('two-column layout contains two <rect class="column-area">', () => {
    const svg = buildLayoutSvg(
      { width: 595.28, height: 841.89 },
      50,
      50,
      50,
      50,
      2,
      20,
    );
    const matches = svg.match(/class="column-area"/g);
    expect(matches).toHaveLength(2);
  });
});
