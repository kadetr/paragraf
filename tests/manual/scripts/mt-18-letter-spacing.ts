#!/usr/bin/env tsx
// manual/scripts/mt-18-letter-spacing.ts
// MT-18 — Letter spacing parameter sweep: −0.02 / 0 / 0.02 / 0.05 / 0.1 em
// Checks: wider letter spacing → fewer words per line (on average); all SVGs produced.
//
// Run:  tsx tests/manual/scripts/mt-18-letter-spacing.ts

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

const SPACINGS = [-0.02, 0, 0.02, 0.05, 0.1];

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

type SweepRow = {
  spacing: number;
  lines: number;
  avgWordsPerLine: number;
  ms: number;
};
const rows: SweepRow[] = [];

console.log('\n  Spacing(em)  Lines  AvgWords/line  Time(ms)');
console.log('  ─────────────────────────────────────────────');

let failures = 0;
let prevAvgWords = Infinity;

for (const spacing of SPACINGS) {
  const f = { ...F12, letterSpacing: spacing };

  const t0 = performance.now();
  const out = composer.compose({
    text: EN_BODY,
    font: f,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  const ms = performance.now() - t0;

  const totalWords = out.lines.reduce((s, l) => s + l.wordRuns.length, 0);
  const avgWordsPerLine =
    out.lines.length > 0 ? totalWords / out.lines.length : 0;

  const rendered = layoutParagraph(out.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const svg = renderToSvg(rendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  const label = String(spacing).replace('-', 'n').replace('.', '_');
  writeSvg(`mt-18-letter-spacing-${label}em.svg`, svg);

  console.log(
    `  ${String(spacing.toFixed(2) + 'em').padEnd(13)} ${String(out.lines.length).padEnd(6)} ${avgWordsPerLine.toFixed(2).padEnd(14)} ${ms.toFixed(1)}`,
  );

  rows.push({ spacing, lines: out.lines.length, avgWordsPerLine, ms });

  // Positive spacing should not give more words/line than tighter spacing
  if (spacing > 0 && avgWordsPerLine > prevAvgWords * 1.15) {
    console.log(
      `  FAIL  spacing=${spacing}: avgWords/line ${avgWordsPerLine.toFixed(2)} > prev ${prevAvgWords.toFixed(2)}`,
    );
    failures++;
  }
  prevAvgWords = avgWordsPerLine;
}

const metrics: TestMetrics = {
  test: 'MT-18',
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
writeJson('mt-18-letter-spacing.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
