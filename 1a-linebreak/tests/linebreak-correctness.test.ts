// linebreak-correctness.test.ts
//
// Checks the line breaker against first principles rather than against its
// own earlier output:
//
//   1. Line measure. A line runs from the first box after the previous break
//      to the break itself. The glue that was broken at belongs to neither
//      line. (Knuth & Plass 1981, "Breaking Paragraphs into Lines", §2.)
//   2. Optimality. For small paragraphs every legal set of breaks can be
//      enumerated, so the breaker's total demerits must equal the minimum
//      found by brute force — with and without adjacent-line demerits.

import { describe, it, expect } from 'vitest';
import { computeBreakpoints } from '../src/linebreak';
import { traceback } from '../src/traceback';
import {
  Node,
  Font,
  Paragraph,
  FORCED_BREAK,
  DOUBLE_HYPHEN_PENALTY,
} from '@paragraf/types';

// ─── Node builders ───────────────────────────────────────────────────────────

const FONT: Font = {
  id: 'test',
  size: 10,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const box = (width: number, content = 'x'): Node => ({
  type: 'box',
  width,
  content,
  font: FONT,
});
const glue = (width: number, stretch: number, shrink: number): Node => ({
  type: 'glue',
  kind: 'word',
  width,
  stretch,
  shrink,
});
const hyphen = (width: number, penalty: number): Node => ({
  type: 'penalty',
  width,
  penalty,
  flagged: true,
});
const END: Node[] = [
  { type: 'glue', kind: 'termination', width: 0, stretch: Infinity, shrink: 0 },
  { type: 'penalty', width: 0, penalty: FORCED_BREAK, flagged: false },
];

// ─── Independent reference implementation ────────────────────────────────────

interface Measured {
  ratio: number;
  natural: number;
  stretch: number;
  shrink: number;
}

/** Index of the first node of the line that follows a break at `prev`. */
const firstNodeAfterBreak = (nodes: Node[], prev: number, to: number) => {
  if (prev < 0) return 0;
  let s = prev + 1;
  while (s < to) {
    const n = nodes[s];
    if (n.type === 'box') break;
    if (n.type === 'penalty' && n.penalty === FORCED_BREAK) break;
    s++;
  }
  return s;
};

/** Measure the line that starts after break `prev` (−1 = start) and ends at `to`. */
const measureLine = (
  nodes: Node[],
  prev: number,
  to: number,
  lineWidth: number,
): Measured => {
  let natural = 0;
  let stretch = 0;
  let shrink = 0;
  for (let i = firstNodeAfterBreak(nodes, prev, to); i < to; i++) {
    const n = nodes[i];
    if (n.type === 'box') natural += n.width;
    else if (n.type === 'glue') {
      natural += n.width;
      stretch += n.stretch;
      shrink += n.shrink;
    }
  }
  const brk = nodes[to];
  if (brk.type === 'penalty') natural += brk.width;

  const gap = lineWidth - natural;
  let ratio = 0;
  if (gap > 0) ratio = stretch > 0 ? gap / stretch : Infinity;
  else if (gap < 0) ratio = shrink > 0 ? gap / shrink : -Infinity;
  return { ratio, natural, stretch, shrink };
};

const fitness = (r: number): number =>
  r < -0.5 ? 0 : r <= 0.5 ? 1 : r <= 1 ? 2 : 3;

const legalBreaks = (nodes: Node[]): number[] => {
  const out: number[] = [];
  nodes.forEach((n, i) => {
    if (n.type === 'penalty' && n.penalty !== Infinity) out.push(i);
    else if (n.type === 'glue' && i > 0 && nodes[i - 1].type === 'box')
      out.push(i);
  });
  return out;
};

/** Minimum total demerits over every legal set of breaks, or null if none is feasible. */
const bruteForce = (
  nodes: Node[],
  lineWidth: number,
  tolerance: number,
  adjDemerits: number,
): number | null => {
  const last = nodes.length - 1;
  const optional = legalBreaks(nodes).filter((i) => i !== last);
  let best: number | null = null;

  for (let mask = 0; mask < 1 << optional.length; mask++) {
    const breaks = optional.filter((_, k) => mask & (1 << k));
    breaks.push(last);

    let total = 0;
    let prev = -1;
    let prevFlagged = false;
    let prevFitness = 1;
    let ok = true;

    for (const b of breaks) {
      const { ratio } = measureLine(nodes, prev, b, lineWidth);
      if (ratio < -1 || ratio > tolerance) {
        ok = false;
        break;
      }
      const n = nodes[b];
      const penalty = n.type === 'penalty' ? n.penalty : 0;
      const flagged = n.type === 'penalty' && n.flagged;
      const badness = Math.min(
        10000,
        Math.round(100 * Math.abs(ratio) ** 3),
      );
      let d: number;
      if (penalty === FORCED_BREAK) d = (1 + badness) ** 2;
      else if (penalty >= 0) d = (1 + badness + penalty) ** 2;
      else d = (1 + badness) ** 2 - penalty ** 2;
      if (prevFlagged && flagged) d += DOUBLE_HYPHEN_PENALTY;
      const fc = fitness(ratio);
      if (adjDemerits > 0 && Math.abs(fc - prevFitness) > 1) d += adjDemerits;

      total += d;
      prev = b;
      prevFlagged = flagged;
      prevFitness = fc;
    }

    if (ok && (best === null || total < best)) best = total;
  }
  return best;
};

// ─── Deterministic random paragraphs ─────────────────────────────────────────

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const randomParagraph = (seed: number): Node[] => {
  const r = rng(seed);
  const words = 6 + Math.floor(r() * 5); // 6–10 words
  const nodes: Node[] = [];
  for (let w = 0; w < words; w++) {
    if (w > 0) nodes.push(glue(4 + r() * 2, 2 + r() * 2, 1 + r()));
    const width = 8 + r() * 28;
    if (r() < 0.3) {
      // a word with one hyphenation point
      nodes.push(box(width * 0.5), hyphen(3, 50), box(width * 0.5));
    } else {
      nodes.push(box(width));
    }
  }
  return [...nodes, ...END];
};

const solve = (p: Paragraph): number | null => {
  try {
    return computeBreakpoints(p).node.totalDemerits;
  } catch {
    return null;
  }
};

// ─── 1. Line measure ─────────────────────────────────────────────────────────

describe('line measure excludes the glue at the previous break', () => {
  it('sets "10 10 | 10 10" in two exact lines at width 25', () => {
    // Each line is box 10 + glue 5 + box 10 = 25: a perfect fit, ratio 0.
    const g = () => glue(5, 5, 2);
    const nodes = [box(10), g(), box(10), g(), box(10), g(), box(10), ...END];
    const result = computeBreakpoints({ nodes, lineWidth: 25, tolerance: 2 });
    const breaks = traceback(result.node);

    expect(breaks.length).toBe(2);
    expect(breaks[0].position).toBe(3); // the glue between word 2 and word 3
    expect(breaks[0].ratio).toBeCloseTo(0, 10);
    expect(result.node.totalDemerits).toBe(2); // (1 + 0)² per line
  });

  it('every non-last line fills its measure exactly at the reported ratio', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const nodes = randomParagraph(seed);
      const lineWidth = 70 + (seed % 5) * 10;
      let result;
      try {
        result = computeBreakpoints({ nodes, lineWidth, tolerance: 4 });
      } catch {
        continue; // infeasible paragraphs are covered by the optimality test
      }
      const breaks = traceback(result.node);
      let prev = -1;
      breaks.slice(0, -1).forEach((b) => {
        const m = measureLine(nodes, prev, b.position, lineWidth);
        const set =
          m.natural + b.ratio * (b.ratio >= 0 ? m.stretch : m.shrink);
        expect(set, `seed ${seed}, break at ${b.position}`).toBeCloseTo(
          lineWidth,
          6,
        );
        prev = b.position;
      });
    }
  });

  it('measures a line that follows a hyphen break from the next fragment', () => {
    // "aaaa-" | "bb cc": line 1 is 20 + hyphen 4 = 24; line 2 is 9 + 5 + 10 = 24.
    const nodes = [
      box(20),
      hyphen(4, 50),
      box(9),
      glue(5, 5, 2),
      box(10),
      ...END,
    ];
    const result = computeBreakpoints({ nodes, lineWidth: 24, tolerance: 1 });
    const breaks = traceback(result.node);
    expect(breaks.map((b) => b.position)).toEqual([1, 6]);
    expect(breaks[0].ratio).toBeCloseTo(0, 10);
    expect(breaks[0].flagged).toBe(true);
  });

  it('gives a forced break directly after a glue break an empty, feasible line', () => {
    const forced: Node = {
      type: 'penalty',
      width: 0,
      penalty: FORCED_BREAK,
      flagged: false,
    };
    const stretchy: Node = {
      type: 'glue',
      kind: 'termination',
      width: 0,
      stretch: Infinity,
      shrink: 0,
    };
    // "10 10" <forced break> "10 10" — each half ends with fill glue.
    const nodes = [
      box(10),
      glue(5, 5, 2),
      box(10),
      stretchy,
      forced,
      box(10),
      glue(5, 5, 2),
      box(10),
      ...END,
    ];
    const result = computeBreakpoints({ nodes, lineWidth: 25, tolerance: 2 });
    const breaks = traceback(result.node);
    expect(breaks.map((b) => b.position)).toEqual([4, 9]);
  });
});

// ─── 2. Optimality ───────────────────────────────────────────────────────────

describe('total demerits equal the brute-force minimum', () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

  it('without adjacent-line demerits', () => {
    for (const seed of SEEDS) {
      const nodes = randomParagraph(seed);
      const lineWidth = 60 + (seed % 6) * 10;
      const tolerance = 3 + (seed % 3);
      const expected = bruteForce(nodes, lineWidth, tolerance, 0);
      const actual = solve({ nodes, lineWidth, tolerance });
      if (expected === null) {
        expect(actual, `seed ${seed}`).toBeNull();
      } else {
        expect(actual, `seed ${seed}`).not.toBeNull();
        expect(actual!, `seed ${seed}`).toBeCloseTo(expected, 6);
      }
    }
  });

  it('with adjDemerits = 10000 (one candidate per line and fitness class)', () => {
    for (const seed of SEEDS) {
      const nodes = randomParagraph(seed);
      const lineWidth = 60 + (seed % 6) * 10;
      const tolerance = 3 + (seed % 3);
      const expected = bruteForce(nodes, lineWidth, tolerance, 10000);
      const actual = solve({ nodes, lineWidth, tolerance, adjDemerits: 10000 });
      if (expected === null) {
        expect(actual, `seed ${seed}`).toBeNull();
      } else {
        expect(actual, `seed ${seed}`).not.toBeNull();
        expect(actual!, `seed ${seed}`).toBeCloseTo(expected, 6);
      }
    }
  });
});

// ─── 3. Ratio and rendered spacing agree ─────────────────────────────────────

describe('composeParagraph renders the spacing the ratio describes', () => {
  it('wordSpacing = glue width + ratio × stretch (or shrink) on every justified line', async () => {
    const { composeParagraph } = await import('../src/compose');
    const SPACE = { width: 5, stretch: 3, shrink: 2 };
    let checked = 0;

    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const nodes: Node[] = [];
      const words = 14 + Math.floor(r() * 10);
      for (let w = 0; w < words; w++) {
        if (w > 0) nodes.push(glue(SPACE.width, SPACE.stretch, SPACE.shrink));
        nodes.push(box(8 + r() * 28, 'w'));
      }
      nodes.push(...END);
      const lineWidth = 110 + (seed % 5) * 12;

      let result;
      try {
        result = computeBreakpoints({ nodes, lineWidth, tolerance: 4 });
      } catch {
        continue;
      }
      const breaks = traceback(result.node);
      const lines = composeParagraph(nodes, breaks, 'justified', false, lineWidth);

      lines.slice(0, -1).forEach((line, k) => {
        if (line.words.length < 2) return; // no gap to space
        const expected =
          SPACE.width +
          line.ratio * (line.ratio >= 0 ? SPACE.stretch : SPACE.shrink);
        expect(line.wordSpacing, `seed ${seed} line ${k}`).toBeCloseTo(
          expected,
          6,
        );
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(50); // not vacuous: 99 lines at the time of writing
  });
});
