// tests/baseline-grid.test.ts
//
// TDD tests for the v0.10 Baseline Grid feature.
//   Phase A — snapCursorToGrid / gridAdvance helpers (exported for testing)
//   Phase B — layoutDocument with frame.grid set

import { describe, it, expect } from 'vitest';
import {
  snapCursorToGrid,
  gridAdvance,
  layoutDocument,
  composeDocument,
  type Frame,
  type BaselineGrid,
  type Document,
} from '../src/document';
import type { ComposedLine } from '@paragraf/types';
import type {
  ParagraphComposer,
  ParagraphInput,
  ParagraphOutput,
} from '../src/paragraph';
import {
  mockMeasure,
  mockSpace,
  mockMetrics,
  type Measurer,
} from '../src/measure';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeLine(lineHeight = 12, baseline = 9.6): ComposedLine {
  return {
    words: ['hello'],
    fonts: [
      { id: 'f', size: 12, weight: 400, style: 'normal', stretch: 'normal' },
    ],
    wordRuns: [
      [
        {
          text: 'hello',
          font: {
            id: 'f',
            size: 12,
            weight: 400,
            style: 'normal',
            stretch: 'normal',
          },
        },
      ],
    ],
    wordSpacing: 0,
    hyphenated: false,
    ratio: 0,
    alignment: 'left',
    isWidow: false,
    lineWidth: 200,
    lineHeight,
    baseline,
  };
}

function makeParagraphOutput(
  lineCount: number,
  lineHeight = 12,
  baseline = 9.6,
): ParagraphOutput {
  return {
    lines: Array.from({ length: lineCount }, () =>
      makeLine(lineHeight, baseline),
    ),
    lineCount,
    usedEmergency: false,
  };
}

function makeMockComposer(
  lineCount = 3,
  lineHeight = 12,
  baseline = 9.6,
): ParagraphComposer {
  return {
    compose: (): ParagraphOutput =>
      makeParagraphOutput(lineCount, lineHeight, baseline),
    ensureLanguage: async () => {},
  };
}

const mockMeasurer: Measurer = {
  measure: mockMeasure,
  space: mockSpace,
  metrics: mockMetrics,
  registry: new Map(),
};

function makeFont() {
  return {
    id: 'f',
    size: 12,
    weight: 400,
    style: 'normal' as const,
    stretch: 'normal' as const,
  };
}

function makeInput(): ParagraphInput {
  return { text: 'hello world', font: makeFont(), lineWidth: 200 };
}

function makeFrame(overrides?: Partial<Frame>): Frame {
  return { page: 0, x: 50, y: 100, width: 200, height: 400, ...overrides };
}

// ─── Phase A — snapCursorToGrid helper ───────────────────────────────────────

describe('snapCursorToGrid', () => {
  // Grid: origin = frame.y + grid.first = 100 + 0 = 100, interval = 12
  // Grid lines are at: 100, 112, 124, 136, …
  // baseline (relative to line top) = 9.6
  // For cursorY such that cursorY + 9.6 already hits a grid line: no snap needed.
  // For cursorY = 100, absoluteBaseline = 109.6 → next grid line = 112 → cursorY = 112 - 9.6 = 102.4

  const frame: Frame = makeFrame({ y: 100 });
  const grid: BaselineGrid = { first: 0, interval: 12 };

  it('does not move cursor when baseline already falls on a grid line', () => {
    // grid lines at 100, 112, 124 …
    // cursorY=102.4: absoluteBaseline = 102.4 + 9.6 = 112 → already on grid
    const result = snapCursorToGrid(102.4, 9.6, frame, grid);
    expect(result).toBeCloseTo(102.4, 5);
  });

  it('snaps cursorY forward when baseline is between grid lines', () => {
    // cursorY=100: absoluteBaseline = 109.6 → next grid line = 112 → cursorY = 102.4
    const result = snapCursorToGrid(100, 9.6, frame, grid);
    expect(result).toBeCloseTo(102.4, 4);
  });

  it('snaps to the first grid line when cursor is at frame top', () => {
    // cursorY = frame.y = 100, baseline = 0 → absoluteBaseline = 100 → already on grid (first line)
    const result = snapCursorToGrid(100, 0, frame, grid);
    expect(result).toBeCloseTo(100, 5);
  });

  it('handles grid.first offset', () => {
    // first = 6: grid lines at 106, 118, 130 …
    // cursorY=100, baseline=9.6 → absBaseline=109.6 → next grid line=118 → cursorY=108.4
    const gridWithFirst: BaselineGrid = { first: 6, interval: 12 };
    const result = snapCursorToGrid(100, 9.6, frame, gridWithFirst);
    expect(result).toBeCloseTo(108.4, 4);
  });

  it('handles large interval', () => {
    // interval=24, first=0: grid lines at 100, 124, 148 …
    // cursorY=100, baseline=9.6 → absBaseline=109.6 → next grid line=124 → cursorY=114.4
    const gridLarge: BaselineGrid = { first: 0, interval: 24 };
    const result = snapCursorToGrid(100, 9.6, frame, gridLarge);
    expect(result).toBeCloseTo(114.4, 4);
  });

  it('already snapped cursor is not moved further', () => {
    // cursorY such that cursorY + baseline = 124 (3rd grid line)
    // → cursorY = 114.4
    const result = snapCursorToGrid(114.4, 9.6, frame, grid);
    expect(result).toBeCloseTo(114.4, 5);
  });
});

// ─── Phase A — gridAdvance helper ────────────────────────────────────────────

describe('gridAdvance', () => {
  it('returns interval when lineHeight equals interval', () => {
    expect(gridAdvance(12, 12)).toBeCloseTo(12, 5);
  });

  it('rounds up to next interval multiple when lineHeight < interval', () => {
    expect(gridAdvance(10, 12)).toBeCloseTo(12, 5);
  });

  it('rounds up to double interval when lineHeight just exceeds interval', () => {
    expect(gridAdvance(13, 12)).toBeCloseTo(24, 5);
  });

  it('exact double interval stays at double', () => {
    expect(gridAdvance(24, 12)).toBeCloseTo(24, 5);
  });

  it('zero lineHeight returns 0', () => {
    // degenerate; lineHeight <= 0 has no height to round up
    expect(gridAdvance(0, 12)).toBeCloseTo(0, 5);
  });
});

// ─── Phase B — layoutDocument with grid ──────────────────────────────────────

describe('layoutDocument — with baseline grid', () => {
  const GRID: BaselineGrid = { first: 0, interval: 12 };
  // line: lineHeight=12, baseline=9.6
  // frame.y=100, origin=100, grid lines: 100, 112, 124 …
  // First line: absBaseline before snap = 100+9.6=109.6 → snapped to 112 → cursorY=102.4
  // baseline in rendered line = cursorY + line.baseline = 102.4 + 9.6 = 112

  it('first baseline lands on the first grid line', () => {
    const frame = makeFrame({ y: 100, height: 400, grid: GRID });
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      makeMockComposer(1, 12, 9.6),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const items = result.pages.flatMap((p) => p.items);
    expect(items[0].rendered[0].baseline).toBeCloseTo(112, 4);
  });

  it('consecutive baselines are multiples of interval from grid origin', () => {
    // 3 lines; each should have baseline at 112, 124, 136
    const frame = makeFrame({ y: 100, height: 400, grid: GRID });
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      makeMockComposer(3, 12, 9.6),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const lines = result.pages
      .flatMap((p) => p.items)
      .flatMap((i) => i.rendered);
    expect(lines[0].baseline).toBeCloseTo(112, 4);
    expect(lines[1].baseline).toBeCloseTo(124, 4);
    expect(lines[2].baseline).toBeCloseTo(136, 4);
  });

  it('baselines across multiple paragraphs stay on the grid', () => {
    const frame = makeFrame({ y: 100, height: 400, grid: GRID });
    const doc: Document = {
      paragraphs: [makeInput(), makeInput()],
      frames: [frame],
    };
    const composed = composeDocument(doc, makeMockComposer(2, 12, 9.6));
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const lines = result.pages
      .flatMap((p) => p.items)
      .flatMap((i) => i.rendered);
    // All 4 baselines should be exact multiples of 12 from 100 (i.e. 112, 124, 136, 148)
    const gridOrigin = 100;
    for (const line of lines) {
      const offset = line.baseline - gridOrigin;
      expect(offset % 12).toBeCloseTo(0, 3);
    }
  });

  it('grid resets to frame.y on column overflow', () => {
    // 2-column frame, height=24 (holds 2 lines each at gridAdvance=12)
    // col1: baselines at 112, 124; col2: baselines restart from frame.y=100
    const frame = makeFrame({
      y: 100,
      height: 60,
      width: 400,
      columnCount: 2,
      gutter: 0,
      grid: GRID,
    });
    const composed = composeDocument(
      { paragraphs: [makeInput(), makeInput(), makeInput()], frames: [frame] },
      makeMockComposer(2, 12, 9.6),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const allItems = result.pages.flatMap((p) => p.items);
    const col2Items = allItems.filter(
      (item) => item.origin.x === frame.x + 200,
    );
    expect(col2Items.length).toBeGreaterThan(0);
    // first line of col2 baseline should also be 112
    expect(col2Items[0].rendered[0].baseline).toBeCloseTo(112, 4);
  });

  it('grid.first shifts the origin — first baseline lands at frame.y + first + (snapped)', () => {
    // first=6: grid lines at 106, 118, 130 …
    // cursorY=100, baseline=9.6 → absBaseline=109.6 → next grid line=118 → cursorY=108.4 → baseline=118
    const gridWithFirst: BaselineGrid = { first: 6, interval: 12 };
    const frame = makeFrame({ y: 100, height: 400, grid: gridWithFirst });
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      makeMockComposer(1, 12, 9.6),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const lines = result.pages
      .flatMap((p) => p.items)
      .flatMap((i) => i.rendered);
    expect(lines[0].baseline).toBeCloseTo(118, 4);
  });

  it('does not change layout when grid is undefined (regression)', () => {
    // Without grid: baselines are at frame.y + baseline + n*lineHeight
    // frame.y=100, baseline=9.6, lineHeight=12 → 109.6, 121.6, 133.6
    const frame = makeFrame({ y: 100, height: 400 }); // no grid
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      makeMockComposer(3, 12, 9.6),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const lines = result.pages
      .flatMap((p) => p.items)
      .flatMap((i) => i.rendered);
    expect(lines[0].baseline).toBeCloseTo(109.6, 4);
    expect(lines[1].baseline).toBeCloseTo(121.6, 4);
    expect(lines[2].baseline).toBeCloseTo(133.6, 4);
  });

  it('oversized line on grid is force-placed without infinite loop', () => {
    // lineHeight=30 > frame height=5 — should terminate and place anyway
    const frame = makeFrame({ y: 0, height: 5, grid: GRID });
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      makeMockComposer(1, 30, 9.6),
    );
    // must not throw / hang
    const result = layoutDocument(composed, [frame], mockMeasurer);
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
  });
});
