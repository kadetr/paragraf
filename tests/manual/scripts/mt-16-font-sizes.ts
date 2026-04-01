#!/usr/bin/env tsx
// manual/scripts/mt-16-font-sizes.ts
// MT-16 — Font size parameter sweep (8 / 10 / 12 / 14 / 18 / 24 pt).
// Checks: larger font → more lines (text wraps sooner); all outputs produced without error.
//
// Run:  tsx tests/manual/scripts/mt-16-font-sizes.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { serifRegistry, font } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import { writeSvg, writeJson, type TestMetrics } from '../fixtures/output.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

const SIZES = [8, 10, 12, 14, 18, 24];

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

type SweepRow = {
  size: number;
  lines: number;
  ms: number;
  emergencyUsed: boolean;
};
const rows: SweepRow[] = [];

console.log('\n  Size  Lines  Time(ms)  Emergency');
console.log('  ─────────────────────────────────');

let failures = 0;
let prevLines = 0;

for (const size of SIZES) {
  const f = font('serif-regular', size);

  const t0 = performance.now();
  const out = composer.compose({
    text: EN_BODY,
    font: f,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  const ms = performance.now() - t0;

  const rendered = layoutParagraph(out.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const svg = renderToSvg(rendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writeSvg(`mt-16-font-size-${size}pt.svg`, svg);

  console.log(
    `  ${String(size).padEnd(5)} ${String(out.lines.length).padEnd(6)} ${ms.toFixed(1).padEnd(9)} ${out.usedEmergency ? 'YES' : 'no'}`,
  );

  rows.push({
    size,
    lines: out.lines.length,
    ms,
    emergencyUsed: out.usedEmergency,
  });

  if (out.lines.length < prevLines) {
    console.log(
      `  FAIL  size=${size}: fewer lines than size=${SIZES[SIZES.indexOf(size) - 1]} (${out.lines.length} vs ${prevLines})`,
    );
    failures++;
  }
  prevLines = out.lines.length;
}

const metrics: TestMetrics = {
  test: 'MT-16',
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
writeJson('mt-16-font-sizes.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
