// url-break-parity.test.ts
//
// v0.7.1: a URL gets break points that are plain penalties: zero width, not
// flagged, penalty 200 (see buildNodeSequence in @paragraf/linebreak). Nodes
// are built in TypeScript for both engines; only the breaker differs. This
// file checks that the Rust breaker and the TypeScript breaker treat those
// penalties alike: same breaks, same ratios, same overfull lines, and that a
// line ending at such a penalty is never reported as hyphenated.

import { createRequire } from 'module';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  computeBreakpoints,
  traceback,
  buildNodeSequence,
  hyphenateParagraph,
  loadLanguages,
  mockMeasure,
  mockSpace,
  mockMetrics,
  DEFAULT_HYPHENATE_OPTIONS,
} from '@paragraf/linebreak';
import { Node, Font, Language, Measurer, FORCED_BREAK } from '@paragraf/types';
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

const URL_PENALTY = 200;

/**
 * Words separated by glue. About a quarter are hyphenated words (flagged
 * penalty with a width), and one in six is a "URL": four to nine pieces
 * joined by plain penalties, together wider than most lines.
 */
const paragraphWithUrls = (seed: number): Node[] => {
  const r = rng(seed);
  const words = 14 + Math.floor(r() * 24);
  const nodes: Node[] = [];
  let urls = 0;
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
    const kind = r();
    if (kind < 0.17 || (w === words - 3 && urls === 0)) {
      urls++;
      const pieces = 4 + Math.floor(r() * 6);
      for (let p = 0; p < pieces; p++) {
        if (p > 0) {
          nodes.push({
            type: 'penalty',
            width: 0,
            penalty: URL_PENALTY,
            flagged: false,
          });
        }
        nodes.push({
          type: 'box',
          width: 10 + r() * 30,
          content: 'u',
          font: FONT,
        });
      }
    } else if (kind < 0.42) {
      const width = 8 + r() * 28;
      nodes.push(
        { type: 'box', width: width / 2, content: 'x', font: FONT },
        { type: 'penalty', width: 3, penalty: 50, flagged: true },
        { type: 'box', width: width / 2, content: 'x', font: FONT },
      );
    } else {
      nodes.push({ type: 'box', width: 8 + r() * 28, content: 'x', font: FONT });
    }
  }
  nodes.push(
    { type: 'glue', kind: 'termination', width: 0, stretch: Infinity, shrink: 0 },
    { type: 'penalty', width: 0, penalty: FORCED_BREAK, flagged: false },
  );
  return nodes;
};

const compare = (
  adjDemerits: number,
  looseness: number,
  hyphenLimit: number,
  emergencyStretch: number,
) => {
  let brokenAtUrl = 0;
  let fallbacks = 0;
  let emergencies = 0;
  let withinTolerance = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const nodes = paragraphWithUrls(seed);
    const lineWidth = 90 + (seed % 7) * 15;
    const tolerance = 3 + (seed % 3);

    const tsResult = computeBreakpoints({
      nodes,
      lineWidth,
      tolerance,
      emergencyStretch,
      adjDemerits,
      looseness,
      consecutiveHyphenLimit: hyphenLimit,
    });
    const ts = traceback(tsResult.node);
    const res = tracebackWasmBinary(
      wasm,
      nodes,
      lineWidth,
      tolerance,
      emergencyStretch,
      looseness,
      hyphenLimit,
      [],
      0,
      0,
      adjDemerits,
    );
    expect('ok' in res, `seed ${seed}: ${JSON.stringify(res).slice(0, 80)}`).toBe(true);
    const rs = res.ok.breaks as typeof ts;

    expect(rs.map((b) => b.position), `seed ${seed}`).toEqual(
      ts.map((b) => b.position),
    );
    expect(rs.map((b) => [b.flagged, b.line]), `seed ${seed}`).toEqual(
      ts.map((b) => [b.flagged, b.line]),
    );
    expect(rs.map((b) => b.overfull === true), `seed ${seed}`).toEqual(
      ts.map((b) => b.overfull === true),
    );
    expect(res.ok.usedFallback, `seed ${seed}`).toBe(tsResult.usedFallback);
    expect(res.ok.usedEmergency, `seed ${seed}`).toBe(tsResult.usedEmergency);
    rs.forEach((b, k) => {
      if (Number.isFinite(ts[k].ratio)) {
        expect(b.ratio, `seed ${seed} line ${k}`).toBeCloseTo(ts[k].ratio, 9);
      }
    });

    // A break at a URL penalty is not a hyphenated line, in either engine.
    for (const b of ts) {
      const node = nodes[b.position];
      if (node.type === 'penalty' && node.penalty === URL_PENALTY) {
        expect(b.flagged, `seed ${seed}`).toBe(false);
        brokenAtUrl++;
      }
    }
    if (tsResult.usedFallback) fallbacks++;
    else if (tsResult.usedEmergency) emergencies++;
    else withinTolerance++;
  }
  // Guard against a vacuous pass: URLs really were broken, and the first
  // pass and the pass after it (the fallback, or emergency stretch when that
  // is given and rescues the paragraph) were both exercised.
  expect(brokenAtUrl).toBeGreaterThan(100);
  expect(withinTolerance).toBeGreaterThan(10);
  expect(emergencyStretch > 0 ? emergencies : fallbacks).toBeGreaterThan(10);
};

describe('Rust and TypeScript agree on paragraphs with URL break points', () => {
  it('with default settings', () => compare(0, 0, 0, 0));
  it('with adjDemerits = 10000', () => compare(10000, 0, 0, 0));
  it('with looseness = 1', () => compare(0, 1, 0, 0));
  it('with consecutiveHyphenLimit = 1', () => compare(0, 0, 1, 0));
  it('with emergency stretch', () => compare(0, 0, 0, 20));
});

// ─── Real node sequences ─────────────────────────────────────────────────────

describe('Rust and TypeScript agree on real URL and German node sequences', () => {
  const F12: Font = { ...FONT, size: 12 };
  const MEASURER: Measurer = {
    measure: mockMeasure,
    space: mockSpace,
    metrics: mockMetrics,
    registry: new Map(),
  };

  beforeAll(async () => {
    await loadLanguages(['en-us', 'de']);
  });

  const nodesOf = (text: string, language: Language): Node[] =>
    buildNodeSequence(
      hyphenateParagraph(text, {
        ...DEFAULT_HYPHENATE_OPTIONS,
        language,
      }).map((w) => ({ ...w, font: F12 })),
      MEASURER,
    );

  const URL_TEXT =
    'The report is published at https://example.com/a/very/long/path/that/cannot/be/hyphenated/index.html ' +
    'and the search page at https://example.com/search?query=line-breaking&lang=en&page=2#results is updated every week.';
  const GERMAN =
    'Die Donaudampfschifffahrtsgesellschaft und das Rindfleischetikettierungsüberwachungsgesetz ' +
    'sowie die Rechtsschutzversicherungsgesellschaften stehen im Bundesausbildungsförderungsgesetz nebeneinander.';

  for (const [name, text, language] of [
    ['URLs', URL_TEXT, 'en-us'],
    ['German compounds', GERMAN, 'de'],
  ] as const) {
    it(`${name}: same breaks at every width, and no overfull line`, () => {
      const nodes = nodesOf(text, language);
      // mockMeasure: 7.2 pt per character. 20 to 60 characters per line.
      for (let chars = 20; chars <= 60; chars += 4) {
        const lineWidth = chars * 7.2;
        const tsResult = computeBreakpoints({ nodes, lineWidth, tolerance: 2 });
        const ts = traceback(tsResult.node);
        const res = tracebackWasmBinary(wasm, nodes, lineWidth, 2, 0, 0, 0);
        expect('ok' in res, `${chars} chars`).toBe(true);
        const rs = res.ok.breaks as typeof ts;
        expect(rs.map((b) => b.position), `${chars} chars`).toEqual(
          ts.map((b) => b.position),
        );
        expect(rs.map((b) => b.flagged), `${chars} chars`).toEqual(
          ts.map((b) => b.flagged),
        );
        expect(res.ok.usedFallback, `${chars} chars`).toBe(
          tsResult.usedFallback,
        );
        expect(ts.some((b) => b.overfull), `${chars} chars`).toBe(false);
        expect(rs.some((b) => b.overfull), `${chars} chars`).toBe(false);
      }
    });
  }
});
