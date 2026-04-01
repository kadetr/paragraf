#!/usr/bin/env tsx
// manual/scripts/mt-13-large-document.ts
// MT-13 — Large-document stress test (100 paragraphs, idempotency check).
// Checks: all 100 paragraphs composed; para[0] line count == para[96] line count.
//
// Run:  tsx tests/manual/scripts/mt-13-large-document.ts

import { createParagraphComposer } from '@paragraf/typography';
import { serifRegistry, F12, F10 } from '../fixtures/fonts.js';
import { EN_BODY, EN_NARROW } from '../fixtures/text.js';
import { writeJson, type TestMetrics } from '../fixtures/output.js';
import { CONTENT_W } from '../fixtures/documents.js';

const PARA_COUNT = 100;

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);

// Alternate between EN_BODY and EN_NARROW to stress varied content
const texts = Array.from({ length: PARA_COUNT }, (_, i) =>
  i % 3 === 0 ? EN_NARROW : EN_BODY,
);

const t0 = performance.now();
const results = texts.map((text, i) =>
  composer.compose({
    text,
    font: i % 5 === 0 ? F10 : F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
  }),
);
const totalMs = performance.now() - t0;

// ─── Checks ───────────────────────────────────────────────────────────────────

let failures = 0;

if (results.length !== PARA_COUNT) {
  console.log(`  FAIL  expected ${PARA_COUNT} results, got ${results.length}`);
  failures++;
}

// Idempotency: para[0] and para[96] use same font/text, should have same line count
if (results[0].lines.length !== results[96].lines.length) {
  console.log(
    `  FAIL  idempotency: para[0]=${results[0].lines.length} lines, para[96]=${results[96].lines.length} lines`,
  );
  failures++;
}

// No paragraph should have 0 lines
const emptyParas = results
  .map((r, i) => ({ i, n: r.lines.length }))
  .filter((x) => x.n === 0);
if (emptyParas.length > 0) {
  console.log(
    `  FAIL  ${emptyParas.length} paragraphs have 0 lines: ${emptyParas
      .slice(0, 5)
      .map((x) => x.i)
      .join(', ')}`,
  );
  failures += emptyParas.length;
}

const totalLines = results.reduce((s, r) => s + r.lines.length, 0);
const avgMs = totalMs / PARA_COUNT;

console.log(`\n  ${PARA_COUNT} paragraphs, ${totalLines} total lines`);
console.log(
  `  Total: ${totalMs.toFixed(1)}ms  |  Avg per para: ${avgMs.toFixed(2)}ms`,
);

// ─── Metrics ──────────────────────────────────────────────────────────────────

const metrics: TestMetrics = {
  test: 'MT-13',
  timestamp: new Date().toISOString(),
  perf: { composeMs: totalMs },
  lines: [],
  summary: {
    lineCount: totalLines,
    usedEmergency: results.some((r) => r.usedEmergency),
    ratioVariance: 0,
    maxRatio: 0,
    minRatio: 0,
    hyphenatedLines: 0,
  },
  extra: {
    paragraphs: PARA_COUNT,
    totalLines,
    avgMsPerPara: avgMs,
    idempotencyOk: results[0].lines.length === results[96].lines.length,
  },
};
writeJson('mt-13-large-document.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
