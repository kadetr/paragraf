// overfull-fallback.test.ts
//
// A paragraph that cannot be set within tolerance no longer throws by default.
// The breaker runs a last pass that
//   - accepts any line that fits, however loose, and
//   - where nothing fits (one unbreakable piece is wider than the measure),
//     breaks right after that piece and marks the line `overfull`.
// `onInfeasible: 'throw'` keeps the earlier behaviour.

import { describe, it, expect } from "vitest";
import { computeBreakpoints } from "../src/linebreak";
import { traceback, LineBreak } from "../src/traceback";
import { composeParagraph } from "../src/compose";
import { Node, Font, Paragraph, FORCED_BREAK } from "@paragraf/types";

const FONT: Font = {
  id: "test",
  size: 12,
  weight: 400,
  style: "normal",
  stretch: "normal",
};

const box = (width: number, content = "x"): Node => ({
  type: "box",
  width,
  content,
  font: FONT,
});
// Space of a 12 pt font: width 3, stretch 2, shrink 4/3.
const SPACE = (): Node => ({
  type: "glue",
  kind: "word",
  width: 3,
  stretch: 2,
  shrink: 4 / 3,
});
const END: Node[] = [
  { type: "glue", kind: "termination", width: 0, stretch: Infinity, shrink: 0 },
  { type: "penalty", width: 0, penalty: FORCED_BREAK, flagged: false },
];

/** Boxes of the given widths separated by spaces, with the paragraph end. */
const words = (widths: number[]): Node[] => {
  const nodes: Node[] = [];
  widths.forEach((w, i) => {
    if (i > 0) nodes.push(SPACE());
    nodes.push(box(w, `w${i}`));
  });
  return [...nodes, ...END];
};

const run = (p: Paragraph) => {
  const result = computeBreakpoints(p);
  return { ...result, breaks: traceback(result.node) };
};

/** Width of a line at full shrink, measured independently of the breaker. */
const minWidth = (nodes: Node[], prev: number, to: number): number => {
  let s = prev === 0 ? 0 : prev + 1;
  while (s < to && nodes[s].type !== "box") s++;
  let w = 0;
  for (let i = s; i < to; i++) {
    const n = nodes[i];
    if (n.type === "box") w += n.width;
    else if (n.type === "glue") w += n.width - n.shrink;
  }
  const last = nodes[to];
  if (last.type === "penalty") w += last.width;
  return w;
};

// ─── A piece wider than the measure ──────────────────────────────────────────

describe("overfull fallback — a box wider than the measure", () => {
  // 30 30 [200] 30 at a measure of 100: the 200 pt box cannot fit anywhere.
  const nodes = words([30, 30, 200, 30]);
  const para: Paragraph = { nodes, lineWidth: 100, tolerance: 2 };

  it("still throws when asked to", () => {
    expect(() =>
      computeBreakpoints({ ...para, onInfeasible: "throw" }),
    ).toThrow(/could not be set within tolerance/);
  });

  it("returns breaks by default and says the fallback was used", () => {
    const { breaks, usedFallback, usedEmergency } = run(para);
    expect(usedFallback).toBe(true);
    expect(usedEmergency).toBe(false);
    expect(breaks.length).toBe(3);
  });

  it("marks exactly the line holding the wide box as overfull", () => {
    const { breaks } = run(para);
    const overfull = breaks.filter((b) => b.overfull);
    expect(overfull.length).toBe(1);
    // nodes: 0 box30, 1 glue, 2 box30, 3 glue, 4 box200, 5 glue, 6 box30
    // The overfull line starts after the break at glue 3 and ends at glue 5.
    expect(breaks.map((b) => b.position)).toEqual([3, 5, 8]);
    expect(breaks[1].overfull).toBe(true);
    expect(breaks[1].ratio).toBe(-1);
  });

  it("gives every break a finite ratio", () => {
    const { breaks } = run(para);
    for (const b of breaks) expect(Number.isFinite(b.ratio)).toBe(true);
  });

  it("reports the overflow in points on the composed line", () => {
    const { breaks } = run(para);
    const lines = composeParagraph(nodes, breaks, "justified", false, 100);
    expect(lines.length).toBe(3);
    expect(lines[1].words).toEqual(["w2"]);
    expect(lines[1].overfull).toBe(true);
    expect(lines[1].overflow).toBeCloseTo(100, 6);
    expect(lines[0].overfull).toBeUndefined();
    expect(lines[0].overflow).toBeUndefined();
    expect(lines[2].overfull).toBeUndefined();
  });
});

// ─── Everything fits, but only loosely ───────────────────────────────────────

describe("overfull fallback — lines that fit but exceed the tolerance", () => {
  // Six 40 pt words at a measure of 100. Two words: 83 pt, 17 pt short with
  // 2 pt of stretch → ratio 8.5. Three words: 126 pt, too long even shrunk.
  const nodes = words([40, 40, 40, 40, 40, 40]);
  const para: Paragraph = { nodes, lineWidth: 100, tolerance: 2 };

  it("is infeasible within tolerance", () => {
    expect(() =>
      computeBreakpoints({ ...para, onInfeasible: "throw" }),
    ).toThrow();
  });

  it("sets two words per line and no line is overfull", () => {
    const { breaks, usedFallback } = run(para);
    expect(usedFallback).toBe(true);
    expect(breaks.map((b) => b.position)).toEqual([3, 7, 12]);
    expect(breaks.some((b) => b.overfull)).toBe(false);
    expect(breaks[0].ratio).toBeCloseTo(8.5, 9);
  });

  it("uses emergency stretch first when that is enough", () => {
    // 17 pt short with 2 + 20 pt of stretch → ratio 0.77, within tolerance.
    const { breaks, usedFallback, usedEmergency } = run({
      ...para,
      emergencyStretch: 20,
    });
    expect(usedEmergency).toBe(true);
    expect(usedFallback).toBe(false);
    expect(breaks.map((b) => b.position)).toEqual([3, 7, 12]);
    expect(breaks.some((b) => b.overfull)).toBe(false);
  });
});

// ─── Feasible paragraphs are untouched ───────────────────────────────────────

describe("overfull fallback — feasible paragraphs", () => {
  const nodes = words([30, 30, 30, 30, 30, 30]);

  it("gives the same breaks under both settings, with no overfull key", () => {
    const base: Paragraph = { nodes, lineWidth: 100, tolerance: 2 };
    const a = run({ ...base, onInfeasible: "throw" });
    const b = run(base);
    expect(b.breaks).toEqual(a.breaks);
    expect(b.usedFallback).toBe(false);
    for (const br of b.breaks) expect("overfull" in br).toBe(false);
  });
});

// ─── A line with no stretch at all ───────────────────────────────────────────

describe("overfull fallback — single short word on a line", () => {
  it("sets it at natural width with ratio 0, not Infinity", () => {
    // 60 | 60 | 60 at 100: each word alone, nothing to stretch.
    const nodes = words([60, 60, 60]);
    const { breaks, usedFallback } = run({
      nodes,
      lineWidth: 100,
      tolerance: 2,
    });
    expect(usedFallback).toBe(true);
    expect(breaks.map((b) => b.position)).toEqual([1, 3, 6]);
    expect(breaks.map((b) => b.ratio)).toEqual([0, 0, 0]);
    expect(breaks.some((b) => b.overfull)).toBe(false);
  });
});

// ─── Randomised invariants ───────────────────────────────────────────────────

describe("overfull fallback — invariants on random paragraphs", () => {
  // Small deterministic generator, so a failure can be reproduced.
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  const check = (nodes: Node[], breaks: LineBreak[], lineWidth: number) => {
    let prev = 0;
    for (const b of breaks) {
      const w = minWidth(nodes, prev, b.position);
      if (b.overfull) {
        // Really too long …
        expect(w).toBeGreaterThan(lineWidth);
        // … and there was no earlier place to break it that would have fit.
        for (let j = prev + 1; j < b.position; j++) {
          const n = nodes[j];
          const legal = n.type === "glue" && nodes[j - 1].type === "box";
          if (legal && j > prev + 1) {
            expect(minWidth(nodes, prev, j)).toBeGreaterThan(lineWidth);
          }
        }
      } else {
        expect(w).toBeLessThanOrEqual(lineWidth + 1e-9);
      }
      prev = b.position;
    }
  };

  it("never throws; overfull is flagged exactly when a line cannot fit", () => {
    const next = rng(20261115);
    let fallbacks = 0;
    let overfullLines = 0;
    for (let n = 0; n < 400; n++) {
      const count = 3 + Math.floor(next() * 20);
      const widths = Array.from({ length: count }, () =>
        next() < 0.12 ? 90 + next() * 120 : 8 + next() * 45,
      );
      const nodes = words(widths);
      const lineWidth = 60 + next() * 80;
      const tolerance = 1 + next() * 2;
      const { breaks, usedFallback } = run({ nodes, lineWidth, tolerance });
      if (usedFallback) fallbacks++;
      overfullLines += breaks.filter((b) => b.overfull).length;
      expect(breaks[breaks.length - 1].position).toBe(nodes.length - 1);
      check(nodes, breaks, lineWidth);
      if (!usedFallback) {
        expect(breaks.some((b) => b.overfull)).toBe(false);
      }
    }
    // The generator must actually exercise the fallback.
    expect(fallbacks).toBeGreaterThan(100);
    expect(overfullLines).toBeGreaterThan(100);
  });
});

// ─── Options that must not make the fallback worse ───────────────────────────

describe('overfull fallback — hyphen limit and looseness', () => {
  const hyphen = (): Node => ({
    type: 'penalty',
    width: 4,
    penalty: 50,
    flagged: true,
  });

  it('drops consecutiveHyphenLimit rather than letting a line stick out', () => {
    // One word in four 40 pt fragments at a measure of 50: the only way to
    // fit is to hyphenate three lines in a row.
    const nodes: Node[] = [
      box(40, 'a'),
      hyphen(),
      box(40, 'b'),
      hyphen(),
      box(40, 'c'),
      hyphen(),
      box(40, 'd'),
      ...END,
    ];
    const { breaks, usedFallback } = run({
      nodes,
      lineWidth: 50,
      tolerance: 2,
      consecutiveHyphenLimit: 1,
    });
    expect(usedFallback).toBe(true);
    expect(breaks.map((b) => b.position)).toEqual([1, 3, 5, 8]);
    expect(breaks.some((b) => b.overfull)).toBe(false);
  });

  it('ignores looseness: no extra, empty or near-empty lines', () => {
    const nodes = words([40, 40, 40, 40, 40, 40]);
    const base: Paragraph = { nodes, lineWidth: 100, tolerance: 2 };
    const plain = run(base).breaks;
    expect(run({ ...base, looseness: 1 }).breaks).toEqual(plain);
    expect(run({ ...base, looseness: -1 }).breaks).toEqual(plain);
  });
});
