// linebreak-parity.test.ts
//
// The Rust line breaker must choose the same breaks, with the same ratios, as
// the TypeScript one. Uses synthetic paragraphs (no fonts) so the comparison
// isolates the algorithm: line measure, fitness classes, tie-breaking.
// The TypeScript side is itself checked against a brute-force reference in
// 1a-linebreak/tests/linebreak-correctness.test.ts.

import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';
import { computeBreakpoints, traceback } from '@paragraf/linebreak';
import { Node, Font, FORCED_BREAK } from '@paragraf/types';
import { tracebackWasmBinary } from '../src/wasm-binary.js';

const _require = createRequire(import.meta.url);
const wasm: any = _require('../wasm/pkg/paragraf_shaping_wasm.js');

const FONT: Font = {
  id: 'test',
  size: 10,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const randomParagraph = (seed: number): Node[] => {
  const r = rng(seed);
  const words = 12 + Math.floor(r() * 30);
  const nodes: Node[] = [];
  for (let w = 0; w < words; w++) {
    if (w > 0) {
      nodes.push({
        type: 'glue',
        kind: 'word',
        width: 4 + r() * 2,
        stretch: 2 + r() * 2,
        shrink: 1 + r(),
      });
    }
    const width = 8 + r() * 28;
    if (r() < 0.3) {
      nodes.push(
        { type: 'box', width: width / 2, content: 'x', font: FONT },
        { type: 'penalty', width: 3, penalty: 50, flagged: true },
        { type: 'box', width: width / 2, content: 'x', font: FONT },
      );
    } else {
      nodes.push({ type: 'box', width, content: 'x', font: FONT });
    }
  }
  nodes.push(
    { type: 'glue', kind: 'termination', width: 0, stretch: Infinity, shrink: 0 },
    { type: 'penalty', width: 0, penalty: FORCED_BREAK, flagged: false },
  );
  return nodes;
};

const compare = (adjDemerits: number, looseness: number, hyphenLimit = 0) => {
  let compared = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const nodes = randomParagraph(seed);
    const lineWidth = 90 + (seed % 7) * 15;
    const tolerance = 3 + (seed % 3);

    let ts: { position: number; ratio: number }[] | null;
    try {
      ts = traceback(
        computeBreakpoints({
          nodes,
          lineWidth,
          tolerance,
          adjDemerits,
          looseness,
          consecutiveHyphenLimit: hyphenLimit,
        }).node,
      );
    } catch {
      ts = null;
    }

    const res = tracebackWasmBinary(
      wasm,
      nodes,
      lineWidth,
      tolerance,
      0,
      looseness,
      hyphenLimit,
      [],
      0,
      0,
      adjDemerits,
    );

    if (ts === null) {
      expect('error' in res, `seed ${seed}`).toBe(true);
      continue;
    }
    expect('ok' in res, `seed ${seed}: ${JSON.stringify(res).slice(0, 80)}`).toBe(true);
    const rs = res.ok.breaks as { position: number; ratio: number }[];
    expect(
      rs.map((b) => b.position),
      `seed ${seed}`,
    ).toEqual(ts.map((b) => b.position));
    rs.forEach((b, k) => {
      if (Number.isFinite(ts![k].ratio)) {
        expect(b.ratio, `seed ${seed} line ${k}`).toBeCloseTo(ts![k].ratio, 9);
      }
    });
    compared++;
  }
  // Guard against a vacuous pass: most paragraphs must have been feasible.
  expect(compared).toBeGreaterThan(40);
};

describe('Rust and TypeScript line breakers agree', () => {
  it('with adjDemerits = 0', () => compare(0, 0));
  it('with adjDemerits = 10000', () => compare(10000, 0));
  it('with looseness = 1', () => compare(0, 1));
  it('with adjDemerits = 10000 and looseness = -1', () => compare(10000, -1));
  it('with consecutiveHyphenLimit = 1', () => compare(0, 0, 1));
  it('with consecutiveHyphenLimit = 2 and adjDemerits = 10000', () =>
    compare(10000, 0, 2));
});

// ─── Infeasible paragraphs: the overfull fallback ────────────────────────────
//
// Narrow measures, low tolerance and the occasional box wider than the line,
// so that most paragraphs cannot be set within tolerance. Both engines must
// then agree on the fallback breaks, on which lines are overfull, and — in
// strict mode — on refusing.

const infeasibleParagraph = (seed: number): Node[] => {
  const r = rng(seed * 7919);
  const nodes = randomParagraph(seed).slice(0, -2);
  // Insert one or two boxes that no line can hold.
  const extra = 1 + Math.floor(r() * 2);
  for (let k = 0; k < extra; k++) {
    nodes.push(
      { type: 'glue', kind: 'word', width: 5, stretch: 3, shrink: 1.5 },
      { type: 'box', width: 150 + r() * 100, content: 'url', font: FONT },
      { type: 'glue', kind: 'word', width: 5, stretch: 3, shrink: 1.5 },
      { type: 'box', width: 10 + r() * 20, content: 'x', font: FONT },
    );
  }
  nodes.push(
    { type: 'glue', kind: 'termination', width: 0, stretch: Infinity, shrink: 0 },
    { type: 'penalty', width: 0, penalty: FORCED_BREAK, flagged: false },
  );
  return nodes;
};

const compareFallback = (
  emergencyStretch: number,
  hyphenLimit: number,
  looseness = 0,
  adjDemerits = 0,
) => {
  let overfullLines = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const nodes = infeasibleParagraph(seed);
    const lineWidth = 60 + (seed % 5) * 12;
    const tolerance = 1 + (seed % 2);
    const base = {
      nodes,
      lineWidth,
      tolerance,
      emergencyStretch,
      consecutiveHyphenLimit: hyphenLimit,
      looseness,
      adjDemerits,
    };

    // Strict mode: both refuse.
    expect(() =>
      computeBreakpoints({ ...base, onInfeasible: 'throw' }),
    ).toThrow();
    const strict = tracebackWasmBinary(
      wasm, nodes, lineWidth, tolerance, emergencyStretch, looseness,
      hyphenLimit, [], 0, 0, adjDemerits, 'throw',
    );
    expect('error' in strict, `seed ${seed}`).toBe(true);

    // Default: both fall back, identically.
    const tsResult = computeBreakpoints(base);
    const ts = traceback(tsResult.node);
    const res = tracebackWasmBinary(
      wasm, nodes, lineWidth, tolerance, emergencyStretch, looseness,
      hyphenLimit, [], 0, 0, adjDemerits,
    );
    expect('ok' in res, `seed ${seed}`).toBe(true);
    expect(res.ok.usedFallback, `seed ${seed}`).toBe(true);
    expect(tsResult.usedFallback, `seed ${seed}`).toBe(true);
    expect(res.ok.usedEmergency, `seed ${seed}`).toBe(tsResult.usedEmergency);

    const rs = res.ok.breaks as typeof ts;
    expect(rs.map((b) => b.position), `seed ${seed}`).toEqual(
      ts.map((b) => b.position),
    );
    expect(rs.map((b) => b.overfull === true), `seed ${seed}`).toEqual(
      ts.map((b) => b.overfull === true),
    );
    expect(rs.map((b) => [b.flagged, b.line]), `seed ${seed}`).toEqual(
      ts.map((b) => [b.flagged, b.line]),
    );
    rs.forEach((b, k) => {
      expect(Number.isFinite(b.ratio), `seed ${seed} line ${k}`).toBe(true);
      expect(b.ratio, `seed ${seed} line ${k}`).toBeCloseTo(ts[k].ratio, 9);
    });
    overfullLines += ts.filter((b) => b.overfull).length;
  }
  expect(overfullLines).toBeGreaterThanOrEqual(80);
};

describe('Rust and TypeScript agree on the overfull fallback', () => {
  it('without emergency stretch', () => compareFallback(0, 0));
  it('with emergency stretch that is not enough', () => compareFallback(15, 0));
  it('with consecutiveHyphenLimit = 1', () => compareFallback(0, 1));
  it('with looseness = 1', () => compareFallback(0, 0, 1));
  it('with adjDemerits = 10000, looseness = -1 and a hyphen limit', () =>
    compareFallback(10, 1, -1, 10000));

  it('a word that only fits by hyphenating every line, limit 1', () => {
    const h = { type: 'penalty', width: 4, penalty: 50, flagged: true } as Node;
    const b = (): Node => ({ type: 'box', width: 40, content: 'x', font: FONT });
    const nodes: Node[] = [
      b(), h, b(), h, b(), h, b(),
      { type: 'glue', kind: 'termination', width: 0, stretch: Infinity, shrink: 0 },
      { type: 'penalty', width: 0, penalty: FORCED_BREAK, flagged: false },
    ];
    const ts = traceback(
      computeBreakpoints({
        nodes, lineWidth: 50, tolerance: 2, consecutiveHyphenLimit: 1,
      }).node,
    );
    const res = tracebackWasmBinary(wasm, nodes, 50, 2, 0, 0, 1);
    expect(res.ok.breaks.map((x: any) => x.position)).toEqual([1, 3, 5, 8]);
    expect(ts.map((x) => x.position)).toEqual([1, 3, 5, 8]);
    expect(res.ok.breaks.some((x: any) => x.overfull)).toBe(false);
  });
});
