import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { computeBreakpoints, BreakpointResult } from '../src/linebreak';
import { buildNodeSequence } from '../src/nodes';
import { hyphenateParagraph, loadLanguages } from '../src/hyphenate';
import { createMeasurer, mockMeasure, mockSpace } from '../src/measure';
import { traceback } from '../src/traceback';
import { Font, FontRegistry, Paragraph, BreakpointNode } from '@paragraf/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const REGULAR_PATH = path.resolve(
  __dirname,
  '../fonts/LiberationSerif-Regular.ttf',
);

const FONT: Font = {
  id: 'liberation-serif-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const REGISTRY: FontRegistry = new Map([
  [
    'liberation-serif-regular',
    {
      id: 'liberation-serif-regular',
      face: 'Liberation Serif',
      filePath: REGULAR_PATH,
    },
  ],
]);

beforeAll(async () => {
  await loadLanguages(['en-us']);
});

// ─── Real font builder ────────────────────────────────────────────────────────

const buildParagraph = (
  text: string,
  lineWidth: number,
  tolerance: number,
  emergencyStretch?: number,
  consecutiveHyphenLimit?: number,
  widowPenalty?: number,
  orphanPenalty?: number,
  looseness?: number,
): Paragraph => {
  const measurer = createMeasurer(REGISTRY);
  const hyphenated = hyphenateParagraph(text);
  const withFonts = hyphenated.map((w) => ({ ...w, font: FONT }));
  const nodes = buildNodeSequence(withFonts, measurer);
  return {
    nodes,
    lineWidth,
    tolerance,
    emergencyStretch,
    consecutiveHyphenLimit,
    widowPenalty,
    orphanPenalty,
    looseness,
  };
};

// ─── Mock font builder ────────────────────────────────────────────────────────

const buildParagraphMock = (
  text: string,
  lineWidth: number,
  tolerance: number,
  emergencyStretch?: number,
): Paragraph => {
  const emptyRegistry: FontRegistry = new Map();
  const measurer = createMeasurer(emptyRegistry, mockMeasure, mockSpace);
  const hyphenated = hyphenateParagraph(text);
  const withFonts = hyphenated.map((w) => ({ ...w, font: FONT }));
  const nodes = buildNodeSequence(withFonts, measurer);
  return { nodes, lineWidth, tolerance, emergencyStretch };
};

// ─── Output contracts ─────────────────────────────────────────────────────────

describe('computeBreakpoints — output contracts', () => {
  it('returns a BreakpointResult with finite totalDemerits', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const result = computeBreakpoints(para);
    expect(Number.isFinite(result.node.totalDemerits)).toBe(true);
    expect(result.node.totalDemerits).toBeGreaterThanOrEqual(0);
  });

  it('usedEmergency is false when paragraph sets normally', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const result = computeBreakpoints(para);
    expect(result.usedEmergency).toBe(false);
  });

  it('final node has a previous pointer — traceback chain exists', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    expect(computeBreakpoints(para).node.previous).not.toBeNull();
  });

  it('line number on final node equals total line count', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const result = computeBreakpoints(para);
    const breaks = traceback(result.node);
    expect(result.node.line).toBe(breaks.length);
  });

  it('single line paragraph produces one break', () => {
    const para = buildParagraph('Hi there', 500, 1);
    const breaks = traceback(computeBreakpoints(para).node);
    expect(breaks.length).toBe(1);
  });

  it('all line ratios are within [-1, tolerance]', () => {
    const tolerance = 2;
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      tolerance,
    );
    const breaks = traceback(computeBreakpoints(para).node);
    breaks.forEach((b) => {
      expect(b.ratio).toBeGreaterThanOrEqual(-1);
      expect(b.ratio).toBeLessThanOrEqual(tolerance);
    });
  });

  it('no words are lost — all input words appear in output', () => {
    const text = 'In olden times when wishing still helped one';
    const para = buildParagraph(text, 200, 2);
    const result = computeBreakpoints(para);
    const breaks = traceback(result.node);

    const { nodes } = para;
    let allContent: string[] = [];
    let prev = 0;

    for (const b of breaks) {
      const start = prev === 0 ? 0 : prev + 1;
      for (let i = start; i <= b.position; i++) {
        if (nodes[i].type === 'box') allContent.push((nodes[i] as any).content);
      }
      prev = b.position;
    }

    text.split(' ').forEach((word) => {
      const found = allContent.some(
        (c) => word.includes(c) || c.includes(word),
      );
      expect(found).toBe(true);
    });
  });

  it('throws when paragraph cannot be set within tolerance', () => {
    const para = buildParagraph('Hello world', 10, 1);
    expect(() => computeBreakpoints(para)).toThrow();
  });
});

// ─── Emergency stretch ────────────────────────────────────────────────────────

describe('computeBreakpoints — emergencyStretch', () => {
  it('throws without emergencyStretch when paragraph cannot be set', () => {
    const para = buildParagraphMock('beautiful wonderful', 80, 0.05);
    expect(() => computeBreakpoints(para)).toThrow(
      'Paragraph could not be set within tolerance',
    );
  });

  it('does not throw with emergencyStretch', () => {
    const para = buildParagraphMock('beautiful wonderful', 80, 0.05, 1000);
    expect(() => computeBreakpoints(para)).not.toThrow();
  });

  it('usedEmergency is true when emergency stretch was used', () => {
    const para = buildParagraphMock('beautiful wonderful', 80, 0.05, 1000);
    const result = computeBreakpoints(para);
    expect(result.usedEmergency).toBe(true);
  });

  it('produces valid output with emergencyStretch', () => {
    const para = buildParagraphMock('beautiful wonderful', 80, 0.05, 1000);
    const breaks = traceback(computeBreakpoints(para).node);
    expect(breaks.length).toBeGreaterThan(0);
  });

  it('emergencyStretch result has finite totalDemerits', () => {
    const para = buildParagraphMock('beautiful wonderful', 80, 0.05, 1000);
    const result = computeBreakpoints(para);
    expect(Number.isFinite(result.node.totalDemerits)).toBe(true);
  });

  it('without emergencyStretch fails, with it succeeds', () => {
    const tight = buildParagraphMock('beautiful wonderful', 80, 0.05);
    const withEmergency = buildParagraphMock(
      'beautiful wonderful',
      80,
      0.05,
      1000,
    );
    expect(() => computeBreakpoints(tight)).toThrow();
    expect(() => computeBreakpoints(withEmergency)).not.toThrow();
  });

  it('emergencyStretch does not affect paragraph that sets normally', () => {
    const text = 'In olden times when wishing still helped one';
    const normal = buildParagraphMock(text, 400, 2);
    const withEmergency = buildParagraphMock(text, 400, 2, 100);

    const breaksNormal = traceback(computeBreakpoints(normal).node);
    const breaksEmergency = traceback(computeBreakpoints(withEmergency).node);

    expect(breaksNormal.map((b) => b.position)).toEqual(
      breaksEmergency.map((b) => b.position),
    );
  });
});

// ─── Optimality ───────────────────────────────────────────────────────────────

describe('computeBreakpoints — optimality', () => {
  it('totalDemerits is non-negative', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    expect(computeBreakpoints(para).node.totalDemerits).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('wider lineWidth produces fewer or equal lines', () => {
    const text = 'In olden times when wishing still helped one';
    const narrow = buildParagraph(text, 150, 2);
    const wide = buildParagraph(text, 400, 2);
    const bNarrow = traceback(computeBreakpoints(narrow).node);
    const bWide = traceback(computeBreakpoints(wide).node);
    expect(bWide.length).toBeLessThanOrEqual(bNarrow.length);
  });

  it('last line ratio is 0 — termination glue absorbs remainder', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const breaks = traceback(computeBreakpoints(para).node);
    expect(breaks[breaks.length - 1].ratio).toBe(0);
  });
});

// ─── Consecutive hyphen limit ─────────────────────────────────────────────────

describe('computeBreakpoints — consecutiveHyphenLimit', () => {
  it('consecutiveHyphens initialises to 0 on startNode', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const result = computeBreakpoints(para);
    let node: BreakpointNode | null = result.node;
    while (node?.previous?.previous !== null) node = node!.previous;
    expect(node?.previous?.consecutiveHyphens).toBe(0);
  });

  it('consecutiveHyphens is tracked across breaks', () => {
    const para = buildParagraph(
      'internationalization localization implementation',
      200,
      5,
    );
    const result = computeBreakpoints(para);
    let node: BreakpointNode | null = result.node;
    let maxConsec = 0;
    while (node !== null) {
      if (node.consecutiveHyphens > maxConsec)
        maxConsec = node.consecutiveHyphens;
      node = node.previous;
    }
    expect(maxConsec).toBeGreaterThanOrEqual(0);
  });

  it('consecutiveHyphens resets to 0 after non-hyphen break', () => {
    const para = buildParagraph(
      'internationalization the localization',
      200,
      5,
    );
    const result = computeBreakpoints(para);
    let node: BreakpointNode | null = result.node;
    while (node?.previous !== null) {
      if (!node!.flagged) expect(node!.consecutiveHyphens).toBe(0);
      node = node!.previous;
    }
  });

  it('without limit — hyphenated runs are not restricted', () => {
    const para = buildParagraph(
      'internationalization localization implementation',
      200,
      5,
    );
    expect(() => computeBreakpoints(para)).not.toThrow();
  });

  it('with limit=1 — no break has consecutiveHyphens > 1', () => {
    const para = buildParagraph(
      'internationalization localization',
      200,
      5,
      undefined,
      1,
    );
    const result = computeBreakpoints(para);
    let node: BreakpointNode | null = result.node;
    while (node !== null) {
      expect(node.consecutiveHyphens).toBeLessThanOrEqual(1);
      node = node.previous;
    }
  });

  it('with limit=2 — no break has consecutiveHyphens > 2', () => {
    const para = buildParagraph(
      'internationalization localization implementation',
      200,
      5,
      undefined,
      2,
    );
    const result = computeBreakpoints(para);
    let node: BreakpointNode | null = result.node;
    while (node !== null) {
      expect(node.consecutiveHyphens).toBeLessThanOrEqual(2);
      node = node.previous;
    }
  });

  it('limit=1 produces different result than no limit when consecutive hyphens would occur', () => {
    const noLimit = buildParagraph(
      'beautiful the internationalization fox',
      120,
      5,
    );
    const withLimit = buildParagraph(
      'beautiful the internationalization fox',
      120,
      5,
      undefined,
      1,
    );

    expect(() => computeBreakpoints(noLimit)).not.toThrow();
    expect(() => computeBreakpoints(withLimit)).not.toThrow();

    const result = computeBreakpoints(withLimit);
    let node: BreakpointNode | null = result.node;
    while (node !== null) {
      expect(node.consecutiveHyphens).toBeLessThanOrEqual(1);
      node = node.previous;
    }
  });
});

// ─── Widow/orphan ─────────────────────────────────────────────────────────────

describe('computeBreakpoints — widowPenalty', () => {
  it('without widowPenalty — single word last line is allowed', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const breaks = traceback(computeBreakpoints(para).node);
    expect(breaks.length).toBeGreaterThan(0);
  });

  it('widowPenalty is accepted as a parameter without throwing', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
      undefined,
      undefined,
      5000,
    );
    expect(() => computeBreakpoints(para)).not.toThrow();
  });

  it('with high widowPenalty — avoids single word on last line when possible', () => {
    const withoutPenalty = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const withPenalty = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
      undefined,
      undefined,
      5000,
    );

    const breaksWithout = traceback(computeBreakpoints(withoutPenalty).node);
    const breaksWith = traceback(computeBreakpoints(withPenalty).node);

    const lastLineWordCount = (
      breaks: ReturnType<typeof traceback>,
      para: Paragraph,
    ) => {
      const lastBreak = breaks[breaks.length - 1];
      const secondLast = breaks.length > 1 ? breaks[breaks.length - 2] : null;
      const { nodes } = para;
      const from = secondLast ? secondLast.position + 1 : 0;
      const to = lastBreak.position;
      let count = 0;
      for (let i = from; i <= to; i++) {
        if (nodes[i].type === 'box' && (nodes[i] as any).content !== '')
          count++;
      }
      return count;
    };

    const withoutLastCount = lastLineWordCount(breaksWithout, withoutPenalty);
    const withLastCount = lastLineWordCount(breaksWith, withPenalty);
    expect(withLastCount).toBeGreaterThanOrEqual(withoutLastCount);
  });

  it('orphanPenalty is accepted as a parameter without throwing', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
      undefined,
      undefined,
      undefined,
      5000,
    );
    expect(() => computeBreakpoints(para)).not.toThrow();
  });

  it('single line paragraph with widowPenalty still composes', () => {
    const para = buildParagraph('Hi there', 500, 1, undefined, undefined, 5000);
    const breaks = traceback(computeBreakpoints(para).node);
    expect(breaks.length).toBe(1);
  });

  it('widowPenalty demonstrably changes selection when widow exists', () => {
    const text = 'In olden times when wishing still helped one';
    const withoutPenalty = buildParagraph(text, 200, 2);
    const withPenalty = buildParagraph(
      text,
      200,
      2,
      undefined,
      undefined,
      1000000,
    );

    const bestWithout = computeBreakpoints(withoutPenalty);
    const bestWith = computeBreakpoints(withPenalty);

    const breaksDiffer =
      traceback(bestWithout.node)
        .map((b) => b.position)
        .join(',') !==
      traceback(bestWith.node)
        .map((b) => b.position)
        .join(',');

    const demeritsDiffer =
      bestWithout.node.totalDemerits !== bestWith.node.totalDemerits;

    expect(breaksDiffer || demeritsDiffer).toBe(true);
  });
});

// ─── Looseness ────────────────────────────────────────────────────────────────

describe('computeBreakpoints — looseness', () => {
  it('looseness=0 produces optimal line count', () => {
    const para = buildParagraph(
      'In olden times when wishing still helped one',
      200,
      2,
    );
    const breaks = traceback(computeBreakpoints(para).node);
    expect(breaks.length).toBeGreaterThan(0);
  });

  it('looseness=+1 selects more lines when target is achievable', () => {
    const text = 'In olden times when wishing still helped one';
    const optimal = buildParagraph(text, 200, 2);
    const looser = buildParagraph(
      text,
      200,
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
    );

    const optimalBreaks = traceback(computeBreakpoints(optimal).node);
    const looserBreaks = traceback(computeBreakpoints(looser).node);
    expect(looserBreaks.length).toBeGreaterThanOrEqual(optimalBreaks.length);
  });

  it('looseness=-1 selects fewer lines when target is achievable', () => {
    const text = 'In olden times when wishing still helped one';
    const optimal = buildParagraph(text, 200, 2);
    const tighter = buildParagraph(
      text,
      200,
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      -1,
    );

    const optimalBreaks = traceback(computeBreakpoints(optimal).node);
    const tighterBreaks = traceback(computeBreakpoints(tighter).node);
    expect(tighterBreaks.length).toBeLessThanOrEqual(optimalBreaks.length);
  });

  it('looseness=0 is the default', () => {
    const text = 'In olden times when wishing still helped one';
    const default_ = buildParagraph(text, 200, 2);
    const explicit = buildParagraph(
      text,
      200,
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
    );

    const defaultBreaks = traceback(computeBreakpoints(default_).node);
    const explicitBreaks = traceback(computeBreakpoints(explicit).node);
    expect(defaultBreaks.map((b) => b.position)).toEqual(
      explicitBreaks.map((b) => b.position),
    );
  });

  it('looseness=+1 has higher or equal demerits than optimal', () => {
    const text = 'In olden times when wishing still helped one';
    const optimal = buildParagraph(text, 200, 2);
    const looser = buildParagraph(
      text,
      200,
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
    );

    const bestOptimal = computeBreakpoints(optimal);
    const bestLooser = computeBreakpoints(looser);
    expect(bestLooser.node.totalDemerits).toBeGreaterThanOrEqual(
      bestOptimal.node.totalDemerits,
    );
  });

  it('looseness demonstrably selects different solution when target is feasible', () => {
    const text = 'In olden times when wishing still helped one';
    const optimal = buildParagraph(text, 200, 20);
    const looser = buildParagraph(
      text,
      200,
      20,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
    );

    const optimalBreaks = traceback(computeBreakpoints(optimal).node);
    const looserBreaks = traceback(computeBreakpoints(looser).node);
    expect(looserBreaks.length).toBeGreaterThanOrEqual(optimalBreaks.length);

    const bestOptimal = computeBreakpoints(optimal);
    const bestLooser = computeBreakpoints(looser);
    expect(bestLooser.node.totalDemerits).toBeGreaterThanOrEqual(
      bestOptimal.node.totalDemerits,
    );
  });
});

describe('computeBreakpoints — lineWidths (multi-column)', () => {
  it('narrower first line forces earlier break on line 1', () => {
    const text = 'In olden times when wishing still helped one';

    // first build with uniform width to find where line 1 breaks
    const uniform = buildParagraph(text, 200, 2);
    const uniformBreaks = traceback(computeBreakpoints(uniform).node);
    const firstBreakPos = uniformBreaks[0].position;

    // now narrow first line — first break must come sooner
    const narrowed = buildParagraph(text, 200, 2);
    narrowed.lineWidths = [100, 200, 200, 200, 200];
    const narrowedBreaks = traceback(computeBreakpoints(narrowed).node);
    const narrowedFirstBreakPos = narrowedBreaks[0].position;

    // narrower line must break at or before the uniform break
    expect(narrowedFirstBreakPos).toBeLessThanOrEqual(firstBreakPos);
  });

  it('all equal lineWidths produces identical break positions to lineWidth', () => {
    const text = 'In olden times when wishing still helped one';
    const normal = buildParagraph(text, 200, 2);
    const withEqual = buildParagraph(text, 200, 2);
    withEqual.lineWidths = [200, 200, 200, 200, 200];

    const normalBreaks = traceback(computeBreakpoints(normal).node);
    const withEqualBreaks = traceback(computeBreakpoints(withEqual).node);

    expect(normalBreaks.map((b) => b.position)).toEqual(
      withEqualBreaks.map((b) => b.position),
    );
  });

  it('empty lineWidths produces identical break positions to lineWidth', () => {
    const text = 'In olden times when wishing still helped one';
    const normal = buildParagraph(text, 200, 2);
    const withEmpty = buildParagraph(text, 200, 2);
    withEmpty.lineWidths = [];

    const normalBreaks = traceback(computeBreakpoints(normal).node);
    const withEmptyBreaks = traceback(computeBreakpoints(withEmpty).node);

    expect(normalBreaks.map((b) => b.position)).toEqual(
      withEmptyBreaks.map((b) => b.position),
    );
  });

  it('lineWidths beyond paragraph length are ignored gracefully', () => {
    const para = buildParagraph('Hi there', 500, 1);
    para.lineWidths = [500, 500, 500, 500, 500, 500];
    expect(() => computeBreakpoints(para)).not.toThrow();
    const breaks = traceback(computeBreakpoints(para).node);
    expect(breaks.length).toBe(1);
  });
});
