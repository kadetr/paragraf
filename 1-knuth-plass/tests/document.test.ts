// tests/document.test.ts
//
// TDD tests for the v0.9 document model:
//   Phase 1 — types (structure / shape)
//   Phase 2 — composeDocument
//   Phase 3 — layoutDocument

import { describe, it, expect, vi } from 'vitest';
import type {
  Document,
  Frame,
  ComposedDocument,
  RenderedDocument,
  RenderedPage,
} from '../src/document.js';
import {
  composeDocument,
  layoutDocument,
  deriveLineWidths,
} from '../src/document.js';
import type {
  ParagraphComposer,
  ParagraphInput,
  ParagraphOutput,
} from '../src/paragraph.js';
import type { ComposedLine } from '@paragraf/types';
import { mockMeasure, mockSpace, mockMetrics } from '@paragraf/font-engine';
import type { Measurer } from '@paragraf/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function makeParagraphOutput(lineCount: number): ParagraphOutput {
  return {
    lines: Array.from({ length: lineCount }, () => makeLine()),
    lineCount,
    usedEmergency: false,
  };
}

/** Minimal mock composer — returns a deterministic output based on lineWidth. */
function makeMockComposer(linesPerParagraph = 3): ParagraphComposer {
  return {
    compose: (_input: ParagraphInput): ParagraphOutput =>
      makeParagraphOutput(linesPerParagraph),
    ensureLanguage: async () => {},
  };
}

/** Full Measurer using shared mock helpers from measure.ts. */
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

function makeInput(lineWidth = 200): ParagraphInput {
  return { text: 'hello world', font: makeFont(), lineWidth };
}

function makeFrame(overrides?: Partial<Frame>): Frame {
  return {
    page: 0,
    x: 50,
    y: 50,
    width: 200,
    height: 400,
    ...overrides,
  };
}

// ─── Phase 1 — Type shapes ────────────────────────────────────────────────────

describe('Frame type', () => {
  it('accepts required fields', () => {
    const f: Frame = { page: 0, x: 0, y: 0, width: 100, height: 200 };
    expect(f.page).toBe(0);
    expect(f.width).toBe(100);
  });

  it('accepts optional columnCount and gutter', () => {
    const f: Frame = {
      page: 0,
      x: 0,
      y: 0,
      width: 300,
      height: 700,
      columnCount: 3,
      gutter: 12,
    };
    expect(f.columnCount).toBe(3);
    expect(f.gutter).toBe(12);
  });
});

describe('Document type', () => {
  it('accepts paragraphs and frames', () => {
    const doc: Document = {
      paragraphs: [makeInput()],
      frames: [makeFrame()],
    };
    expect(doc.paragraphs).toHaveLength(1);
    expect(doc.frames).toHaveLength(1);
  });

  it('accepts optional styleDefaults', () => {
    const doc: Document = {
      paragraphs: [makeInput()],
      frames: [makeFrame()],
      styleDefaults: { tolerance: 3 },
    };
    expect(doc.styleDefaults?.tolerance).toBe(3);
  });
});

describe('RenderedPage type', () => {
  it('has pageIndex, frame, and items array', () => {
    const page: RenderedPage = {
      pageIndex: 0,
      frame: makeFrame(),
      items: [{ origin: { x: 50, y: 50 }, rendered: [] }],
    };
    expect(page.items).toHaveLength(1);
    expect(page.items[0].origin.x).toBe(50);
  });
});

describe('RenderedDocument type', () => {
  it('has a pages array', () => {
    const doc: RenderedDocument = { pages: [] };
    expect(Array.isArray(doc.pages)).toBe(true);
  });
});

// ─── Phase 2 — composeDocument ───────────────────────────────────────────────

describe('composeDocument', () => {
  it('returns one output per input paragraph', () => {
    const doc: Document = {
      paragraphs: [makeInput(), makeInput(), makeInput()],
      frames: [makeFrame()],
    };
    const result = composeDocument(doc, makeMockComposer(3));
    expect(result.paragraphs).toHaveLength(3);
  });

  it('each output has lines and lineCount', () => {
    const doc: Document = {
      paragraphs: [makeInput()],
      frames: [makeFrame()],
    };
    const result = composeDocument(doc, makeMockComposer(4));
    expect(result.paragraphs[0].output.lineCount).toBe(4);
    expect(result.paragraphs[0].output.lines).toHaveLength(4);
  });

  it('passes the input through on each paragraph output', () => {
    const input = makeInput(300);
    const doc: Document = {
      paragraphs: [input],
      frames: [makeFrame()],
    };
    const result = composeDocument(doc, makeMockComposer());
    expect(result.paragraphs[0].input).toBe(input);
  });

  it('merges styleDefaults (per-paragraph wins)', () => {
    const composer = makeMockComposer();
    const spy = vi.fn(
      (_input: ParagraphInput): ParagraphOutput => makeParagraphOutput(2),
    );
    const spyComposer: ParagraphComposer = {
      compose: spy,
      ensureLanguage: async () => {},
    };

    const doc: Document = {
      paragraphs: [{ ...makeInput(), tolerance: 5 }],
      frames: [makeFrame()],
      styleDefaults: { tolerance: 2, font: makeFont(), lineWidth: 200 },
    };
    composeDocument(doc, spyComposer);

    // tolerance from paragraph (5) must win over default (2)
    expect(spy.mock.calls[0][0].tolerance).toBe(5);
  });

  it('applies styleDefaults when paragraph does not override', () => {
    const spy = vi.fn(
      (_input: ParagraphInput): ParagraphOutput => makeParagraphOutput(2),
    );
    const spyComposer: ParagraphComposer = {
      compose: spy,
      ensureLanguage: async () => {},
    };

    const doc: Document = {
      paragraphs: [makeInput()],
      frames: [makeFrame()],
      styleDefaults: { tolerance: 7, font: makeFont(), lineWidth: 200 },
    };
    composeDocument(doc, spyComposer);

    expect(spy.mock.calls[0][0].tolerance).toBe(7);
  });

  it('derives column width for single-column frame (= frame.width)', () => {
    const spy = vi.fn(
      (_input: ParagraphInput): ParagraphOutput => makeParagraphOutput(2),
    );
    const spyComposer: ParagraphComposer = {
      compose: spy,
      ensureLanguage: async () => {},
    };

    const doc: Document = {
      paragraphs: [makeInput()],
      frames: [makeFrame({ width: 400 })],
    };
    composeDocument(doc, spyComposer);

    expect(spy.mock.calls[0][0].lineWidth).toBe(400);
  });

  it('derives column width for multi-column frame with gutter', () => {
    const spy = vi.fn(
      (_input: ParagraphInput): ParagraphOutput => makeParagraphOutput(2),
    );
    const spyComposer: ParagraphComposer = {
      compose: spy,
      ensureLanguage: async () => {},
    };

    const doc: Document = {
      paragraphs: [makeInput()],
      frames: [makeFrame({ width: 400, columnCount: 2, gutter: 20 })],
    };
    composeDocument(doc, spyComposer);

    // (400 - 20*(2-1)) / 2 = 380/2 = 190
    expect(spy.mock.calls[0][0].lineWidth).toBe(190);
  });
});

// ─── Phase 3 — layoutDocument ────────────────────────────────────────────────

describe('layoutDocument — single frame, single paragraph', () => {
  it('returns a RenderedDocument with at least one page', () => {
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [makeFrame()] },
      makeMockComposer(2),
    );
    const result = layoutDocument(composed, [makeFrame()], mockMeasurer);
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
  });

  it('places items on the correct page', () => {
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [makeFrame({ page: 0 })] },
      makeMockComposer(2),
    );
    const result = layoutDocument(
      composed,
      [makeFrame({ page: 0 })],
      mockMeasurer,
    );
    expect(result.pages[0].pageIndex).toBe(0);
  });
});

describe('layoutDocument — single frame, 3 paragraphs', () => {
  it('produces correct number of rendered items (one RenderedParagraph per paragraph-block-in-column)', () => {
    // 3 paragraphs × 2 lines each = 6 lines total, frame height = 400, lineHeight = 12 → all fit in one column
    const composed = composeDocument(
      {
        paragraphs: [makeInput(), makeInput(), makeInput()],
        frames: [makeFrame({ height: 400 })],
      },
      makeMockComposer(2),
    );
    const result = layoutDocument(
      composed,
      [makeFrame({ height: 400 })],
      mockMeasurer,
    );
    const allItems = result.pages.flatMap((p) => p.items);
    // 3 paragraphs all in one column → 3 items
    expect(allItems).toHaveLength(3);
  });

  it('stacks baselines correctly — each paragraph origin.y follows previous paragraph bottom', () => {
    // lineHeight = 12, 2 lines per paragraph
    // Para 1 origin.y = frame.y = 50, bottom = 50 + 2*12 = 74
    // Para 2 origin.y = 74, Para 3 origin.y = 98
    const composed = composeDocument(
      {
        paragraphs: [makeInput(), makeInput(), makeInput()],
        frames: [makeFrame({ y: 50, height: 400 })],
      },
      makeMockComposer(2),
    );
    const result = layoutDocument(
      composed,
      [makeFrame({ y: 50, height: 400 })],
      mockMeasurer,
    );
    const items = result.pages.flatMap((p) => p.items);
    expect(items[0].origin.y).toBe(50);
    expect(items[1].origin.y).toBeCloseTo(74, 4);
    expect(items[2].origin.y).toBeCloseTo(98, 4);
  });
});

describe('layoutDocument — column overflow', () => {
  it('overflows to second column when first column fills', () => {
    // 2 columns, gutter 0. Frame: x=50, y=50, width=400, height=60
    // lineHeight=12, 2 lines per para → para 1 takes 24px, para 2 also 24px → col 1 holds ~5 lines = 60px
    // col 1 height = 60, 12*2=24 per para → 2 paras fit, 3rd overflows
    const frame: Frame = {
      page: 0,
      x: 50,
      y: 50,
      width: 400,
      height: 60,
      columnCount: 2,
      gutter: 0,
    };
    const composed = composeDocument(
      { paragraphs: [makeInput(), makeInput(), makeInput()], frames: [frame] },
      makeMockComposer(2), // 2 lines × 12 = 24px per paragraph
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const allItems = result.pages.flatMap((p) => p.items);
    // some items must be in col 2 (originX = 50 + 200 = 250)
    const col2Items = allItems.filter((item) => item.origin.x > 200);
    expect(col2Items.length).toBeGreaterThan(0);
  });

  it('second column has correct originX', () => {
    // 2 columns, gutter=0, frame x=50, width=400 → colWidth=200
    // col 1: x=50, col 2: x=50+200=250
    const frame: Frame = {
      page: 0,
      x: 50,
      y: 50,
      width: 400,
      height: 60,
      columnCount: 2,
      gutter: 0,
    };
    const composed = composeDocument(
      { paragraphs: [makeInput(), makeInput(), makeInput()], frames: [frame] },
      makeMockComposer(2),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const allItems = result.pages.flatMap((p) => p.items);
    const col2Items = allItems.filter((item) => item.origin.x === 250);
    expect(col2Items.length).toBeGreaterThan(0);
  });

  it('column 2 items start at frame.y', () => {
    const frame: Frame = {
      page: 0,
      x: 50,
      y: 50,
      width: 400,
      height: 60,
      columnCount: 2,
      gutter: 0,
    };
    const composed = composeDocument(
      { paragraphs: [makeInput(), makeInput(), makeInput()], frames: [frame] },
      makeMockComposer(2),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const allItems = result.pages.flatMap((p) => p.items);
    const col2Items = allItems.filter((item) => item.origin.x === 250);
    expect(col2Items[0].origin.y).toBe(50);
  });
});

describe('layoutDocument — page break', () => {
  it('produces two pages when overflow fills into a frame on page 1', () => {
    // Frame 0 on page 0: height=24 → holds exactly 2 lines (1 paragraph)
    // Frame 1 on page 1: height=400
    // 3 paragraphs of 2 lines each (24px total) → para 1 fits frame 0, paras 2+3 in frame 1
    const frames: Frame[] = [
      { page: 0, x: 50, y: 50, width: 200, height: 24 },
      { page: 1, x: 50, y: 50, width: 200, height: 400 },
    ];
    const composed = composeDocument(
      {
        paragraphs: [makeInput(), makeInput(), makeInput()],
        frames: [frames[0]],
      },
      makeMockComposer(2),
    );
    const result = layoutDocument(composed, frames, mockMeasurer);
    expect(result.pages.length).toBe(2);
  });

  it('page 0 and page 1 have correct pageIndex values', () => {
    const frames: Frame[] = [
      { page: 0, x: 50, y: 50, width: 200, height: 24 },
      { page: 1, x: 50, y: 50, width: 200, height: 400 },
    ];
    const composed = composeDocument(
      {
        paragraphs: [makeInput(), makeInput(), makeInput()],
        frames: [frames[0]],
      },
      makeMockComposer(2),
    );
    const result = layoutDocument(composed, frames, mockMeasurer);
    const pageIndices = result.pages.map((p) => p.pageIndex);
    expect(pageIndices).toContain(0);
    expect(pageIndices).toContain(1);
  });
});

describe('layoutDocument — paragraph split across columns', () => {
  it('splits a paragraph across columns into two separate items', () => {
    // 1 paragraph of 5 lines (5×12=60px), column height=36 → 3 lines in col1, 2 lines in col2
    const frame: Frame = {
      page: 0,
      x: 50,
      y: 50,
      width: 400,
      height: 36,
      columnCount: 2,
      gutter: 0,
    };
    const mockOutput: ParagraphOutput = {
      lines: Array.from({ length: 5 }, () => makeLine()),
      lineCount: 5,
      usedEmergency: false,
    };
    const splitComposer: ParagraphComposer = {
      compose: () => mockOutput,
      ensureLanguage: async () => {},
    };
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      splitComposer,
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const allItems = result.pages.flatMap((p) => p.items);
    // 1 paragraph split into 2 items (one per column)
    expect(allItems.length).toBe(2);
    expect(allItems[0].origin.x).toBe(50); // col 1
    expect(allItems[1].origin.x).toBe(250); // col 2 (50 + 200)
  });

  it('split items have different origins', () => {
    const frame: Frame = {
      page: 0,
      x: 50,
      y: 50,
      width: 400,
      height: 36,
      columnCount: 2,
      gutter: 0,
    };
    const mockOutput: ParagraphOutput = {
      lines: Array.from({ length: 5 }, () => makeLine()),
      lineCount: 5,
      usedEmergency: false,
    };
    const splitComposer: ParagraphComposer = {
      compose: () => mockOutput,
      ensureLanguage: async () => {},
    };
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      splitComposer,
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const allItems = result.pages.flatMap((p) => p.items);
    expect(allItems[0].origin).not.toEqual(allItems[1].origin);
  });
});

describe('layoutDocument — edge cases', () => {
  it('does not infinite-loop on a line taller than column height', () => {
    const frame: Frame = { page: 0, x: 0, y: 0, width: 200, height: 5 }; // height < lineHeight (12)
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      makeMockComposer(1),
    );
    // Should terminate and place the oversized line anyway
    const result = layoutDocument(composed, [frame], mockMeasurer);
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Phase 4 — paragraphSpacing ──────────────────────────────────────────────

describe('layoutDocument — paragraphSpacing on Frame', () => {
  it('adds spacing after each paragraph', () => {
    // lineHeight=12, 2 lines per para, paragraphSpacing=10
    // para 1: origin.y=50, bottom=50+24=74; spacing → cursor=84
    // para 2: origin.y=84
    const frame = makeFrame({ y: 50, height: 400, paragraphSpacing: 10 });
    const composed = composeDocument(
      { paragraphs: [makeInput(), makeInput()], frames: [frame] },
      makeMockComposer(2),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const items = result.pages.flatMap((p) => p.items);
    expect(items[0].origin.y).toBe(50);
    expect(items[1].origin.y).toBeCloseTo(84, 4);
  });

  it('three paragraphs: spacing accumulates correctly', () => {
    const frame = makeFrame({ y: 50, height: 400, paragraphSpacing: 10 });
    const composed = composeDocument(
      { paragraphs: [makeInput(), makeInput(), makeInput()], frames: [frame] },
      makeMockComposer(2),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const items = result.pages.flatMap((p) => p.items);
    expect(items[0].origin.y).toBe(50);
    expect(items[1].origin.y).toBeCloseTo(84, 4); // 50 + 24 + 10
    expect(items[2].origin.y).toBeCloseTo(118, 4); // 84 + 24 + 10
  });

  it('paragraphSpacing=0 matches no-spacing behaviour', () => {
    const frameNoSpacing = makeFrame({ y: 50, height: 400 });
    const frameZero = makeFrame({ y: 50, height: 400, paragraphSpacing: 0 });

    const composedNo = composeDocument(
      { paragraphs: [makeInput(), makeInput()], frames: [frameNoSpacing] },
      makeMockComposer(2),
    );
    const composedZero = composeDocument(
      { paragraphs: [makeInput(), makeInput()], frames: [frameZero] },
      makeMockComposer(2),
    );

    const itemsNo = layoutDocument(
      composedNo,
      [frameNoSpacing],
      mockMeasurer,
    ).pages.flatMap((p) => p.items);
    const itemsZero = layoutDocument(
      composedZero,
      [frameZero],
      mockMeasurer,
    ).pages.flatMap((p) => p.items);

    expect(itemsNo[1].origin.y).toBeCloseTo(itemsZero[1].origin.y, 4);
  });

  it('spacing causes overflow to next column when column is tight', () => {
    // col height=36, para1 takes 24+6=30 (height + spacing), only 6pt left
    // para2 needs 24pt → overflows to col 2
    const frame: Frame = {
      page: 0,
      x: 0,
      y: 0,
      width: 400,
      height: 36,
      columnCount: 2,
      gutter: 0,
      paragraphSpacing: 6,
    };
    const composed = composeDocument(
      { paragraphs: [makeInput(), makeInput()], frames: [frame] },
      makeMockComposer(2),
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const allItems = result.pages.flatMap((p) => p.items);
    const col2Items = allItems.filter((item) => item.origin.x === 200);
    expect(col2Items.length).toBeGreaterThan(0);
  });

  it('spacing is NOT applied mid-split when a paragraph continues into the next column', () => {
    // 1 paragraph of 5 lines (5*12=60px) in a 2-col frame, col height=36, spacing=20.
    // Col1: 3 lines fit (36px), paragraph continues into col2.
    // Mid-split: spacing must NOT be applied after the col1 batch (paragraph hasn't ended).
    // Col2 origin.y must equal frame.y (=0), not frame.y + spacing (=20).
    const frame: Frame = {
      page: 0,
      x: 0,
      y: 0,
      width: 400,
      height: 36,
      columnCount: 2,
      gutter: 0,
      paragraphSpacing: 20,
    };
    const mockOutput: ParagraphOutput = {
      lines: Array.from({ length: 5 }, () => makeLine()),
      lineCount: 5,
      usedEmergency: false,
    };
    const splitComposer: ParagraphComposer = {
      compose: () => mockOutput,
      ensureLanguage: async () => {},
    };
    const composed = composeDocument(
      { paragraphs: [makeInput()], frames: [frame] },
      splitComposer,
    );
    const result = layoutDocument(composed, [frame], mockMeasurer);
    const allItems = result.pages.flatMap((p) => p.items);
    // col2 item starts at frame.y (0), not frame.y + paragraphSpacing (20)
    const col2Item = allItems.find((item) => item.origin.x === 200);
    expect(col2Item).toBeDefined();
    expect(col2Item!.origin.y).toBe(0);
  });
});

// ─── Phase 5 — deriveLineWidths ───────────────────────────────────────────────

describe('deriveLineWidths', () => {
  it('all paragraphs get colWidth of frames[0] when no assignments given', () => {
    const frame = makeFrame({ width: 300 });
    const inputs = [makeInput(), makeInput()];
    const result = deriveLineWidths(inputs, [frame]);
    expect(result[0].lineWidth).toBe(300);
    expect(result[1].lineWidth).toBe(300);
  });

  it('multi-column frame: lineWidth = (width - gutter*(cols-1)) / cols', () => {
    // (400 - 20*1) / 2 = 190
    const frame = makeFrame({ width: 400, columnCount: 2, gutter: 20 });
    const result = deriveLineWidths([makeInput()], [frame]);
    expect(result[0].lineWidth).toBe(190);
  });

  it('frameAssignments routes each paragraph to the correct frame', () => {
    const frame0 = makeFrame({ width: 200 });
    const frame1 = makeFrame({ width: 400 });
    const inputs = [makeInput(), makeInput()];
    const result = deriveLineWidths(inputs, [frame0, frame1], [0, 1]);
    expect(result[0].lineWidth).toBe(200);
    expect(result[1].lineWidth).toBe(400);
  });

  it('does not mutate the original ParagraphInput objects', () => {
    const input = makeInput(999);
    const frame = makeFrame({ width: 300 });
    const result = deriveLineWidths([input], [frame]);
    expect(input.lineWidth).toBe(999); // original unchanged
    expect(result[0].lineWidth).toBe(300); // new object has overridden width
    expect(result[0]).not.toBe(input); // different reference
  });

  it('falls back gracefully when frameAssignments index is out of range', () => {
    const frame = makeFrame({ width: 200 });
    const result = deriveLineWidths([makeInput()], [frame], [99]); // no frame at index 99
    expect(result[0]).toBeDefined();
  });
});
