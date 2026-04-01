import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as path from 'path';
import {
  layoutParagraph,
  renderToSvg,
  renderToCanvas,
  RenderedParagraph,
} from '@paragraf/render-core';
import { ComposedLine, Font, FontRegistry, Measurer } from '@paragraf/types';
import {
  mockMeasure,
  mockMetrics,
  mockSpace,
  createMeasurer,
  FontEngine,
  FontkitEngine,
} from '@paragraf/font-engine';
import { createParagraphComposer } from '@paragraf/typography';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../../fonts');
const SERIF_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');

const FONT_12: Font = {
  id: 'test',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};
const FONT_8: Font = {
  id: 'test',
  size: 8,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const SERIF_FONT: Font = {
  id: 'liberation-serif',
  size: 14,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const SERIF_REGISTRY: FontRegistry = new Map([
  [
    'liberation-serif',
    { id: 'liberation-serif', face: 'Liberation Serif', filePath: SERIF_PATH },
  ],
]);

const MOCK_MEASURER: Measurer = {
  measure: mockMeasure,
  space: mockSpace,
  metrics: mockMetrics,
  registry: new Map(),
};

// mockMeasure('hello', FONT_12) = 5 * 12 * 0.6 = 36
// mockMetrics(FONT_12)          → lineHeight = 12 * (0.8 + 0.2) = 12, baseline = 12 * 0.8 = 9.6

const LINE_A: ComposedLine = {
  words: ['hello', 'world'],
  fonts: [FONT_12, FONT_12],
  wordRuns: [
    [{ text: 'hello', font: FONT_12 }],
    [{ text: 'world', font: FONT_12 }],
  ],
  wordSpacing: 5,
  hyphenated: false,
  ratio: 0,
  alignment: 'left',
  isWidow: false,
  lineWidth: 200,
  lineHeight: 12, // ascender(9.6) - descender(-2.4) + lineGap(0)
  baseline: 9.6, // ascender = size * 0.8
};

// Multi-segment word: H + 2 (subscript, verticalOffset=-3) + O
const LINE_MSEG: ComposedLine = {
  words: ['H2O'],
  fonts: [FONT_12],
  wordRuns: [
    [
      { text: 'H', font: FONT_12 },
      { text: '2', font: FONT_8, verticalOffset: -3 },
      { text: 'O', font: FONT_12 },
    ],
  ],
  wordSpacing: 0,
  hyphenated: false,
  ratio: 0,
  alignment: 'left',
  isWidow: false,
  lineWidth: 200,
  lineHeight: 12,
  baseline: 9.6,
};

// Superscript word: mc + 2 (positive verticalOffset = above baseline)
const LINE_SUP: ComposedLine = {
  words: ['mc2'],
  fonts: [FONT_12],
  wordRuns: [
    [
      { text: 'mc', font: FONT_12 },
      { text: '2', font: FONT_8, verticalOffset: 5 },
    ],
  ],
  wordSpacing: 0,
  hyphenated: false,
  ratio: 0,
  alignment: 'left',
  isWidow: false,
  lineWidth: 200,
  lineHeight: 12,
  baseline: 9.6,
};

const ORIGIN = { x: 10, y: 20 };

// ─── layoutParagraph ─────────────────────────────────────────────────────────

describe('layoutParagraph — single line, single-segment words', () => {
  let rendered: RenderedParagraph;

  beforeAll(() => {
    rendered = layoutParagraph([LINE_A], MOCK_MEASURER, ORIGIN);
  });

  it('produces one rendered line', () => {
    expect(rendered).toHaveLength(1);
  });

  it('produces one segment per word', () => {
    expect(rendered[0].segments).toHaveLength(2);
  });

  it('first segment x equals origin.x', () => {
    expect(rendered[0].segments[0].x).toBeCloseTo(10);
  });

  it('first segment y = origin.y + baseline', () => {
    // 20 + 9.6 = 29.6
    expect(rendered[0].segments[0].y).toBeCloseTo(29.6);
  });

  it('second word x = origin.x + measure(word1) + wordSpacing', () => {
    // 10 + 36 + 5 = 51
    expect(rendered[0].segments[1].x).toBeCloseTo(51);
  });

  it('second word y is the same baseline', () => {
    expect(rendered[0].segments[1].y).toBeCloseTo(29.6);
  });

  it('preserves font reference on each segment', () => {
    expect(rendered[0].segments[0].font).toBe(FONT_12);
    expect(rendered[0].segments[1].font).toBe(FONT_12);
  });

  it('preserves text on each segment', () => {
    expect(rendered[0].segments[0].text).toBe('hello');
    expect(rendered[0].segments[1].text).toBe('world');
  });

  it('baseline equals origin.y + line.baseline', () => {
    expect(rendered[0].baseline).toBeCloseTo(29.6);
  });

  it('lineHeight is propagated to RenderedLine', () => {
    expect(rendered[0].lineHeight).toBe(12);
  });
});

describe('layoutParagraph — two lines, vertical stacking', () => {
  let rendered: RenderedParagraph;

  beforeAll(() => {
    rendered = layoutParagraph([LINE_A, LINE_A], MOCK_MEASURER, ORIGIN);
  });

  it('produces two rendered lines', () => {
    expect(rendered).toHaveLength(2);
  });

  it('second line baseline = origin.y + lineHeight[0] + baseline[1]', () => {
    // 20 + 12 + 9.6 = 41.6
    expect(rendered[1].baseline).toBeCloseTo(41.6);
  });

  it('second line first segment x resets to origin.x', () => {
    expect(rendered[1].segments[0].x).toBeCloseTo(10);
  });
});

describe('layoutParagraph — multi-segment word with verticalOffset', () => {
  let rendered: RenderedParagraph;

  beforeAll(() => {
    rendered = layoutParagraph([LINE_MSEG], MOCK_MEASURER, ORIGIN);
  });

  it('produces three segments for H+2+O', () => {
    expect(rendered[0].segments).toHaveLength(3);
  });

  it('H segment y = baseline (no verticalOffset)', () => {
    expect(rendered[0].segments[0].y).toBeCloseTo(29.6);
  });

  it('2 segment y = baseline - verticalOffset', () => {
    // verticalOffset = -3 (subscript = below baseline)
    // y = 29.6 - (-3) = 32.6 (larger y = below baseline in screen coords)
    expect(rendered[0].segments[1].y).toBeCloseTo(32.6);
  });

  it('O segment y = baseline (no verticalOffset)', () => {
    expect(rendered[0].segments[2].y).toBeCloseTo(29.6);
  });

  it('segment x positions advance by measure within the word', () => {
    // H:  x=10,       width = 1*12*0.6 = 7.2
    // 2:  x=10+7.2    width = 1*8*0.6  = 4.8
    // O:  x=10+7.2+4.8=22
    expect(rendered[0].segments[0].x).toBeCloseTo(10);
    expect(rendered[0].segments[1].x).toBeCloseTo(17.2);
    expect(rendered[0].segments[2].x).toBeCloseTo(22);
  });
});

describe('layoutParagraph — empty paragraph', () => {
  it('returns empty array', () => {
    expect(layoutParagraph([], MOCK_MEASURER, ORIGIN)).toEqual([]);
  });
});

describe('layoutParagraph — positive verticalOffset (superscript)', () => {
  let rendered: RenderedParagraph;

  beforeAll(() => {
    rendered = layoutParagraph([LINE_SUP], MOCK_MEASURER, ORIGIN);
  });

  it('base segment y = baseline (no verticalOffset)', () => {
    // 20 + 9.6 = 29.6
    expect(rendered[0].segments[0].y).toBeCloseTo(29.6);
  });

  it('superscript segment y = baseline - verticalOffset (above baseline)', () => {
    // verticalOffset = 5 → y = 29.6 - 5 = 24.6 (smaller y = above baseline in screen coords)
    expect(rendered[0].segments[1].y).toBeCloseTo(24.6);
  });
});

// ─── renderToSvg ─────────────────────────────────────────────────────────────

describe('renderToSvg', () => {
  let rendered: RenderedParagraph;
  let fontEngine: FontkitEngine;
  const VIEWPORT = { width: 400, height: 200 };

  beforeAll(async () => {
    fontEngine = new FontkitEngine();
    await fontEngine.loadFont('liberation-serif', SERIF_PATH);

    const composer = await createParagraphComposer(SERIF_REGISTRY);
    const output = composer.compose({
      text: 'Hello world',
      font: SERIF_FONT,
      lineWidth: 600, // wide enough for one line
    });
    const measurer = createMeasurer(SERIF_REGISTRY);
    rendered = layoutParagraph(output.lines, measurer, { x: 10, y: 30 });
  });

  it('returns a string', () => {
    const svg = renderToSvg(rendered, fontEngine, VIEWPORT);
    expect(typeof svg).toBe('string');
  });

  it('starts with <svg', () => {
    const svg = renderToSvg(rendered, fontEngine, VIEWPORT);
    expect(svg).toMatch(/^<svg /);
  });

  it('ends with </svg>', () => {
    const svg = renderToSvg(rendered, fontEngine, VIEWPORT);
    expect(svg.trim()).toMatch(/<\/svg>$/);
  });

  it('encodes width and height in opening tag', () => {
    const svg = renderToSvg(rendered, fontEngine, VIEWPORT);
    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="200"');
  });

  it('contains at least one <path element', () => {
    const svg = renderToSvg(rendered, fontEngine, VIEWPORT);
    expect(svg).toContain('<path');
  });

  it('paths contain M (moveTo) commands — real glyph outlines', () => {
    const svg = renderToSvg(rendered, fontEngine, VIEWPORT);
    expect(svg).toMatch(/d="[^"]*M/);
  });

  it('path count is at least one per segment (one path per glyph after GSUB)', () => {
    const svg = renderToSvg(rendered, fontEngine, VIEWPORT);
    const segmentCount = rendered.reduce((n, l) => n + l.segments.length, 0);
    const pathCount = (svg.match(/<path /g) ?? []).length;
    expect(pathCount).toBeGreaterThanOrEqual(segmentCount);
  });

  it('renders variant (subscript) font segments via GSUB substitution', () => {
    const subFont: Font = {
      id: 'liberation-serif',
      size: 8,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
      variant: 'subscript',
    };
    const variantLine: ComposedLine = {
      words: ['H2O'],
      fonts: [SERIF_FONT],
      wordRuns: [
        [
          { text: 'H', font: SERIF_FONT },
          { text: '2', font: subFont },
          { text: 'O', font: SERIF_FONT },
        ],
      ],
      wordSpacing: 0,
      hyphenated: false,
      ratio: 0,
      alignment: 'left',
      isWidow: false,
      lineWidth: 200,
      lineHeight: 20,
      baseline: 14,
    };
    const measurer = createMeasurer(SERIF_REGISTRY);
    const rend = layoutParagraph([variantLine], measurer, { x: 10, y: 30 });
    const svg = renderToSvg(rend, fontEngine, VIEWPORT);
    const pathCount = (svg.match(/<path /g) ?? []).length;
    // 3 segments (H, 2, O) → at least 3 paths
    expect(pathCount).toBeGreaterThanOrEqual(3);
  });
});

// ─── renderToCanvas ───────────────────────────────────────────────────────────

describe('renderToCanvas', () => {
  let rendered: RenderedParagraph;
  let fontEngine: FontkitEngine;
  let ctx: {
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    quadraticCurveTo: ReturnType<typeof vi.fn>;
    bezierCurveTo: ReturnType<typeof vi.fn>;
    closePath: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
  };

  beforeAll(async () => {
    fontEngine = new FontkitEngine();
    await fontEngine.loadFont('liberation-serif', SERIF_PATH);

    const composer = await createParagraphComposer(SERIF_REGISTRY);
    const output = composer.compose({
      text: 'Hello world',
      font: SERIF_FONT,
      lineWidth: 600,
    });
    const measurer = createMeasurer(SERIF_REGISTRY);
    rendered = layoutParagraph(output.lines, measurer, { x: 0, y: 20 });
  });

  beforeEach(() => {
    ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
    };
  });

  it('calls ctx.moveTo at least once — glyphs have outlines', () => {
    renderToCanvas(rendered, fontEngine, ctx);
    expect(ctx.moveTo.mock.calls.length).toBeGreaterThan(0);
  });

  it('calls ctx.fill at least once per rendered segment', () => {
    renderToCanvas(rendered, fontEngine, ctx);
    const segmentCount = rendered.reduce((n, l) => n + l.segments.length, 0);
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(segmentCount);
  });

  it('moveTo is called with finite numeric coordinates', () => {
    renderToCanvas(rendered, fontEngine, ctx);
    for (const [x, y] of ctx.moveTo.mock.calls) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }
  });

  it('renders variant (subscript) segments — fill called at least once per glyph', () => {
    const subFont: Font = {
      id: 'liberation-serif',
      size: 8,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
      variant: 'subscript',
    };
    const variantLine: ComposedLine = {
      words: ['H2O'],
      fonts: [SERIF_FONT],
      wordRuns: [
        [
          { text: 'H', font: SERIF_FONT },
          { text: '2', font: subFont, verticalOffset: -3 },
          { text: 'O', font: SERIF_FONT },
        ],
      ],
      wordSpacing: 0,
      hyphenated: false,
      ratio: 0,
      alignment: 'left',
      isWidow: false,
      lineWidth: 200,
      lineHeight: 20,
      baseline: 14,
    };
    const measurer = createMeasurer(SERIF_REGISTRY);
    const rend = layoutParagraph([variantLine], measurer, { x: 0, y: 20 });
    renderToCanvas(rend, fontEngine, ctx);
    // H, 2, O — at least 3 fill calls (one per glyph minimum)
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
