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

const compare = (adjDemerits: number, looseness: number) => {
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
      0,
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
});
