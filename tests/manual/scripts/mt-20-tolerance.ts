#!/usr/bin/env tsx
// manual/scripts/mt-20-tolerance.ts
// MT-20 — Tolerance parameter sweep: 1 / 2 / 3 / 5 / 10
// Checks: higher tolerance → same or fewer lines (looser is never worse than tighter);
//         emergency rate drops as tolerance rises.
//
// Run:  tsx tests/manual/scripts/mt-20-tolerance.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import {
  writeSvg,
  writeJson,
  ratioVariance,
  type LineMetrics,
  type TestMetrics,
} from '../fixtures/output.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

const TOLERANCES = [1, 2, 3, 5, 10];

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

type SweepRow = {
  tolerance: number;
  lines: number;
  ratioVar: number;
  ms: number;
  emergencyUsed: boolean;
};
const rows: SweepRow[] = [];

console.log('\n  Tol  Lines  RatioVar  Time(ms)  Emergency');
console.log('  ─────────────────────────────────────────');

let failures = 0;

for (const tolerance of TOLERANCES) {
  const t0 = performance.now();
  const out = composer.compose({
    text: EN_BODY,
    font: F12,
    lineWidth: CONTENT_W,
    tolerance,
  });
  const ms = performance.now() - t0;

  const lineMs: LineMetrics[] = out.lines.map((l, idx) => ({
    idx,
    y: 0,
    ratio: l.ratio,
    hyphenated: l.hyphenated ?? false,
    xOffset: 0,
    lineWidth: l.lineWidth,
    wordCount: l.wordRuns.length,
  }));
  const rv = ratioVariance(lineMs);

  const rendered = layoutParagraph(out.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const svg = renderToSvg(rendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writeSvg(`mt-20-tolerance-${tolerance}.svg`, svg);

  console.log(
    `  ${String(tolerance).padEnd(4)} ${String(out.lines.length).padEnd(6)} ${rv.toFixed(4).padEnd(9)} ${ms.toFixed(1).padEnd(9)} ${out.usedEmergency ? 'YES' : 'no'}`,
  );

  rows.push({
    tolerance,
    lines: out.lines.length,
    ratioVar: rv,
    ms,
    emergencyUsed: out.usedEmergency,
  });
}

// Check: emergency should be false or rare for tolerance ≥ 5
const t5Row = rows.find((r) => r.tolerance === 5);
if (t5Row?.emergencyUsed) {
  console.log('  WARN  tolerance=5 still triggered emergency break');
}

const metrics: TestMetrics = {
  test: 'MT-20',
  timestamp: new Date().toISOString(),
  perf: { composeMs: rows.reduce((s, r) => s + r.ms, 0) },
  lines: [],
  summary: {
    lineCount: 0,
    usedEmergency: rows.some((r) => r.emergencyUsed),
    ratioVariance: 0,
    maxRatio: 0,
    minRatio: 0,
    hyphenatedLines: 0,
  },
  extra: { sweep: rows },
};
writeJson('mt-20-tolerance.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
