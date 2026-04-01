#!/usr/bin/env tsx
// manual/scripts/mt-19-column-widths.ts
// MT-19 — Column width sweep: 200 / 300 / 400 / 500 / 600 pt
// Checks: wider column → fewer lines; all SVGs produced.
//
// Run:  tsx tests/manual/scripts/mt-19-column-widths.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import { writeSvg, writeJson, type TestMetrics } from '../fixtures/output.js';
import { MARGIN_X, MARGIN_TOP, PAGE_H } from '../fixtures/documents.js';

const WIDTHS = [200, 300, 400, 500, 600];

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

type SweepRow = {
  width: number;
  lines: number;
  ms: number;
  emergencyUsed: boolean;
};
const rows: SweepRow[] = [];

console.log('\n  Width  Lines  Time(ms)  Emergency');
console.log('  ─────────────────────────────────');

let failures = 0;
let prevLines = Infinity;

for (const width of WIDTHS) {
  const pageW = width + MARGIN_X * 2;

  const t0 = performance.now();
  const out = composer.compose({
    text: EN_BODY,
    font: F12,
    lineWidth: width,
    tolerance: 3,
  });
  const ms = performance.now() - t0;

  const rendered = layoutParagraph(out.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const svg = renderToSvg(rendered, fontEngine, {
    width: pageW,
    height: PAGE_H,
  });
  writeSvg(`mt-19-column-width-${width}pt.svg`, svg);

  console.log(
    `  ${String(width).padEnd(6)} ${String(out.lines.length).padEnd(6)} ${ms.toFixed(1).padEnd(9)} ${out.usedEmergency ? 'YES' : 'no'}`,
  );

  rows.push({
    width,
    lines: out.lines.length,
    ms,
    emergencyUsed: out.usedEmergency,
  });

  if (out.lines.length > prevLines) {
    console.log(
      `  FAIL  width=${width}: more lines than width=${WIDTHS[WIDTHS.indexOf(width) - 1]} (${out.lines.length} vs ${prevLines})`,
    );
    failures++;
  }
  prevLines = out.lines.length;
}

const metrics: TestMetrics = {
  test: 'MT-19',
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
writeJson('mt-19-column-widths.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
