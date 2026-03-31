#!/usr/bin/env tsx
// manual/scripts/mt-08-consecutive-hyphens.ts
// MT-08 — Consecutive Hyphen Limit.
// Checks: max run of consecutive hyphenated lines stays within limit.
//
// Run:  tsx manual/scripts/mt-08-consecutive-hyphens.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '../../src/paragraph.js';
import { createMeasurer } from '../../src/measure.js';
import { layoutParagraph, renderToSvg } from '../../src/render.js';
import { renderToPdf } from '../../src/pdf.js';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import {
  writeSvg,
  writePdf,
  writeJson,
  ratioVariance,
  type LineMetrics,
  type TestMetrics,
} from '../fixtures/output.js';
import { MARGIN_X, MARGIN_TOP, PAGE_W, PAGE_H } from '../fixtures/documents.js';

const NARROW_W = 200; // narrow enough to force hyphens but wide enough for KP to find solutions
const LIMIT = 2;
const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── Unlimited hyphens (baseline) ────────────────────────────────────────────

const outUnlimited = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: NARROW_W,
  tolerance: 3,
  consecutiveHyphenLimit: 0,
});

// ─── With limit = 2 ──────────────────────────────────────────────────────────

const t0 = performance.now();
const outLimited = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: NARROW_W,
  tolerance: 3,
  consecutiveHyphenLimit: LIMIT,
});
const ms = performance.now() - t0;

// ─── Check max consecutive run ────────────────────────────────────────────────

const maxRun = (lines: typeof outLimited.lines): number => {
  let max = 0;
  let run = 0;
  for (const l of lines) {
    if (l.hyphenated) {
      run++;
      max = Math.max(max, run);
    } else run = 0;
  }
  return max;
};

const unlimRun = maxRun(outUnlimited.lines);
const limitedRun = maxRun(outLimited.lines);
const pass = limitedRun <= LIMIT;

console.log(
  `\n  Unlimited: ${outUnlimited.lines.length} lines, max consecutive hyphens: ${unlimRun}`,
);
console.log(
  `  Limited (≤${LIMIT}): ${outLimited.lines.length} lines, max consecutive hyphens: ${limitedRun}`,
);
console.log(
  pass ? '  PASS' : `  FAIL — max run ${limitedRun} > limit ${LIMIT}`,
);

// ─── SVG ──────────────────────────────────────────────────────────────────────

const rendered = layoutParagraph(outLimited.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const svg = renderToSvg(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writeSvg('mt-08-consecutive-hyphens.svg', svg);
const pdf = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writePdf('mt-08-consecutive-hyphens.pdf', pdf);

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = outLimited.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-08',
  timestamp: new Date().toISOString(),
  perf: { composeMs: ms },
  lines: lineMetrics,
  summary: {
    lineCount: outLimited.lines.length,
    usedEmergency: outLimited.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    consecutiveHyphenLimit: LIMIT,
    maxConsecutiveRun: limitedRun,
    unlimitedMaxRun: unlimRun,
  },
};

writeJson('mt-08-consecutive-hyphens.metrics.json', metrics);

console.log(pass ? '\nPASS' : '\nFAIL');
process.exit(pass ? 0 : 1);
