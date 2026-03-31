#!/usr/bin/env tsx
// manual/scripts/mt-13-large-document.ts
// MT-13 — Large Document Stress Test.
// 100 paragraphs × ~200 words. Checks: no stale state, performance, no OOM.
//
// Run:  tsx manual/scripts/mt-13-large-document.ts

import { createParagraphComposer } from '../../src/paragraph.js';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import {
  EN_BODY,
  DOCUMENT_PARA_1,
  DOCUMENT_PARA_2,
  DOCUMENT_PARA_3,
} from '../fixtures/text.js';
import { writeJson, type TestMetrics } from '../fixtures/output.js';
import { CONTENT_W } from '../fixtures/documents.js';

const PARA_COUNT = 100;
const registry = serifRegistry();
const composer = await createParagraphComposer(registry);

// Rotate through 4 text bodies to avoid repetition
const TEXTS = [EN_BODY, DOCUMENT_PARA_1, DOCUMENT_PARA_2, DOCUMENT_PARA_3];

// ─── Stress run ───────────────────────────────────────────────────────────────

const memBefore = process.memoryUsage().heapUsed;
const t0 = performance.now();

const results: Array<{ lineCount: number; usedEmergency: boolean }> = [];
for (let i = 0; i < PARA_COUNT; i++) {
  const text = TEXTS[i % TEXTS.length];
  const out = composer.compose({
    text,
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  results.push({
    lineCount: out.lines.length,
    usedEmergency: out.usedEmergency,
  });
}

const totalMs = performance.now() - t0;
const memAfter = process.memoryUsage().heapUsed;
const memDeltaMb = (memAfter - memBefore) / 1024 / 1024;

// ─── Idempotency check ────────────────────────────────────────────────────────
// Para 0 and para 96 use the same text (EN_BODY, index % 4 === 0).
// Their results must be identical.

const checkIdx = PARA_COUNT - 4; // same text as index 0 (100-4=96, 96%4=0)
const r0 = results[0];
const rN = results[checkIdx];
const idempotent =
  r0.lineCount === rN.lineCount && r0.usedEmergency === rN.usedEmergency;

// ─── Report ───────────────────────────────────────────────────────────────────

console.log(`\n  ${PARA_COUNT} paragraphs composed in ${totalMs.toFixed(0)}ms`);
console.log(`  Average: ${(totalMs / PARA_COUNT).toFixed(1)}ms / paragraph`);
console.log(`  Memory delta: +${memDeltaMb.toFixed(1)} MB`);
console.log(`  Idempotency (para[0] == para[${checkIdx}]): ${idempotent}`);
console.log(`  Total lines: ${results.reduce((s, r) => s + r.lineCount, 0)}`);

const timingPass = totalMs < 10_000; // 10s hard limit
const memPass = memDeltaMb < 100; // 100 MB hard limit

if (!timingPass)
  console.log(`  WARN  total time ${totalMs.toFixed(0)}ms > 10000ms threshold`);
if (!memPass)
  console.log(
    `  WARN  memory delta ${memDeltaMb.toFixed(1)}MB > 100MB threshold`,
  );
if (!idempotent) console.log(`  FAIL  idempotency check failed`);

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const metrics: TestMetrics = {
  test: 'MT-13',
  timestamp: new Date().toISOString(),
  perf: { composeMs: totalMs },
  lines: [],
  summary: {
    lineCount: results.reduce((s, r) => s + r.lineCount, 0),
    usedEmergency: results.some((r) => r.usedEmergency),
    ratioVariance: 0,
    maxRatio: 0,
    minRatio: 0,
    hyphenatedLines: 0,
  },
  extra: {
    paragraphCount: PARA_COUNT,
    avgMsPerParagraph: totalMs / PARA_COUNT,
    memoryDeltaMb: memDeltaMb,
    idempotent,
  },
};

writeJson('mt-13-large-document.metrics.json', metrics);

const pass = timingPass && memPass && idempotent;
console.log(pass ? '\nPASS' : '\nFAIL');
process.exit(pass ? 0 : 1);
