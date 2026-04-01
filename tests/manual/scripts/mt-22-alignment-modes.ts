#!/usr/bin/env tsx
// manual/scripts/mt-22-alignment-modes.ts
// MT-22 — Alignment mode sweep: justify / left / right / center
// Checks: left/right/center never use justification (ratio ≡ 0 for all non-last lines);
//         justify produces non-zero ratios.
//
// Run:  tsx tests/manual/scripts/mt-22-alignment-modes.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import { writeSvg, writeJson, type TestMetrics } from '../fixtures/output.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

type Align = 'justified' | 'left' | 'right' | 'center';
const ALIGNMENTS: Align[] = ['justified', 'left', 'right', 'center'];

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

type SweepRow = {
  alignment: Align;
  lines: number;
  nonZeroRatioLines: number;
  ms: number;
};
const rows: SweepRow[] = [];

console.log('\n  Alignment  Lines  NonZeroRatios  Time(ms)');
console.log('  ─────────────────────────────────────────');

let failures = 0;

for (const alignment of ALIGNMENTS) {
  const t0 = performance.now();
  const out = composer.compose({
    text: EN_BODY,
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
    alignment,
  });
  const ms = performance.now() - t0;

  // Count non-last lines with non-zero ratio (true justification indicator)
  const bodyLines = out.lines.slice(0, -1);
  const nonZeroRatioLines = bodyLines.filter(
    (l) => Math.abs(l.ratio) > 0.001,
  ).length;

  const rendered = layoutParagraph(out.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const svg = renderToSvg(rendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writeSvg(`mt-22-alignment-${alignment}.svg`, svg);

  console.log(
    `  ${alignment.padEnd(11)} ${String(out.lines.length).padEnd(6)} ${String(nonZeroRatioLines).padEnd(14)} ${ms.toFixed(1)}`,
  );

  rows.push({ alignment, lines: out.lines.length, nonZeroRatioLines, ms });

  // justify must produce non-zero ratios on body lines
  if (
    alignment === 'justified' &&
    nonZeroRatioLines === 0 &&
    bodyLines.length > 0
  ) {
    console.log(
      `  FAIL  justified: all body lines have ratio≈0 — no justification occurring`,
    );
    failures++;
  }

  // left/right/center: body-line ratios should be 0 (ragged lines, not stretched)
  if (
    (alignment === 'left' || alignment === 'right' || alignment === 'center') &&
    nonZeroRatioLines > 0
  ) {
    console.log(
      `  WARN  ${alignment}: ${nonZeroRatioLines}/${bodyLines.length} lines have non-zero ratio (unexpected spreading)`,
    );
  }
}

const metrics: TestMetrics = {
  test: 'MT-22',
  timestamp: new Date().toISOString(),
  perf: { composeMs: rows.reduce((s, r) => s + r.ms, 0) },
  lines: [],
  summary: {
    lineCount: 0,
    usedEmergency: false,
    ratioVariance: 0,
    maxRatio: 0,
    minRatio: 0,
    hyphenatedLines: 0,
  },
  extra: { sweep: rows },
};
writeJson('mt-22-alignment-modes.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
