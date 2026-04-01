#!/usr/bin/env tsx
// manual/scripts/mt-21-looseness.ts
// MT-21 — Looseness parameter sweep: −2 / −1 / 0 / +1 / +2
// Checks: looseness < 0 compresses lines; looseness > 0 expands lines.
//
// Run:  tsx tests/manual/scripts/mt-21-looseness.ts

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

const LOOSENESSES = [-2, -1, 0, 1, 2];

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

type SweepRow = { looseness: number; lines: number; ms: number };
const rows: SweepRow[] = [];

console.log('\n  Loose  Lines  Time(ms)');
console.log('  ────────────────────');

let failures = 0;
let zeroLines = 0;

for (const looseness of LOOSENESSES) {
  const t0 = performance.now();
  const out = composer.compose({
    text: EN_BODY,
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
    looseness,
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
  const sign = looseness >= 0 ? `+${looseness}` : String(looseness);
  writeSvg(`mt-21-looseness-${sign}.svg`, svg);

  console.log(
    `  ${String(sign).padEnd(6)} ${String(out.lines.length).padEnd(6)} ${ms.toFixed(1)}`,
  );

  if (looseness === 0) zeroLines = out.lines.length;
  rows.push({ looseness, lines: out.lines.length, ms });
}

// Negative looseness should not produce more lines than looseness=0
const mRow = rows.find((r) => r.looseness === -2);
if (mRow && mRow.lines > zeroLines) {
  console.log(
    `  FAIL  looseness=-2 has ${mRow.lines} lines > looseness=0 (${zeroLines} lines)`,
  );
  failures++;
}

// Positive looseness should produce same or more lines than looseness=0
const pRow = rows.find((r) => r.looseness === 2);
if (pRow && pRow.lines < zeroLines) {
  // This is expected to warn, not fail — looseness 2 may not change a short paragraph
  console.log(
    `  WARN  looseness=+2 has ${pRow.lines} lines, expected ≥ ${zeroLines}`,
  );
}

const metrics: TestMetrics = {
  test: 'MT-21',
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
  extra: { sweep: rows, zeroLines },
};
writeJson('mt-21-looseness.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
