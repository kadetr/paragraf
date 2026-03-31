#!/usr/bin/env tsx
// manual/scripts/mt-11-wasm-ts-parity.ts
// MT-11 — WASM vs TypeScript linebreaker parity.
// Runs EN_BODY through both paths and diffs the output.
// Exit 0 = identical. Exit 1 = divergence found.
//
// Run:  tsx manual/scripts/mt-11-wasm-ts-parity.ts

import * as path from 'path';
import { fileURLToPath } from 'url';
import { createParagraphComposer, wasmStatus } from '../../src/paragraph.js';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import {
  writeJson,
  ratioVariance,
  type LineMetrics,
  type TestMetrics,
} from '../fixtures/output.js';

const LINE_W = 451.28;
const registry = serifRegistry();
const composer = await createParagraphComposer(registry);

// ─── Check WASM is actually available ────────────────────────────────────────

const status = wasmStatus();
if (status.status !== 'loaded') {
  console.warn(
    `WARNING: WASM not loaded (${status.status}). Only TS path available.`,
  );
  console.warn('Run: cd wasm && wasm-pack build --target nodejs --release');
  console.warn(
    'MT-11 will compare TS against itself — not a meaningful parity test.',
  );
}
console.log(`WASM status: ${status.status}`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const extractMetrics = (
  lines: ReturnType<typeof composer.compose>['lines'],
  label: string,
  composeMs: number,
  usedEmergency: boolean,
): TestMetrics => {
  const lineMetrics: LineMetrics[] = lines.map((l, idx) => ({
    idx,
    y: 0, // not laid out — positional y is not relevant for parity
    ratio: l.ratio,
    hyphenated: l.hyphenated ?? false,
    xOffset: l.xOffset ?? 0,
    lineWidth: l.lineWidth,
    wordCount: l.wordRuns.length,
  }));

  return {
    test: 'MT-11',
    timestamp: new Date().toISOString(),
    perf: { composeMs },
    lines: lineMetrics,
    summary: {
      lineCount: lines.length,
      usedEmergency,
      ratioVariance: ratioVariance(lineMetrics),
      maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
      minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
      hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
    },
    extra: { label },
  };
};

// ─── Compose (WASM path — default when loaded) ────────────────────────────────

const t0 = performance.now();
const outA = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: LINE_W,
  tolerance: 3,
});
const msA = performance.now() - t0;
const metricsA = extractMetrics(
  outA.lines,
  status.status === 'loaded' ? 'wasm' : 'ts-a',
  msA,
  outA.usedEmergency,
);
writeJson('mt-11-a.metrics.json', metricsA);

// ─── Compose (second run — reference) ────────────────────────────────────────
// Both runs go through the same path (WASM or TS depending on availability).
// When WASM is loaded: A and B are both WASM → they must be identical.
// For a true WASM vs TS comparison, run once with wasm loaded and once after
// removing wasm/pkg/. The diff-metrics tool then compares the two saved files.

const t1 = performance.now();
const outB = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: LINE_W,
  tolerance: 3,
});
const msB = performance.now() - t1;
const metricsB = extractMetrics(
  outB.lines,
  'reference',
  msB,
  outB.usedEmergency,
);
writeJson('mt-11-b.metrics.json', metricsB);

// ─── Inline diff ──────────────────────────────────────────────────────────────

console.log(
  `\nA: ${metricsA.summary.lineCount} lines, variance=${metricsA.summary.ratioVariance}, ${msA.toFixed(1)}ms`,
);
console.log(
  `B: ${metricsB.summary.lineCount} lines, variance=${metricsB.summary.ratioVariance}, ${msB.toFixed(1)}ms`,
);

let diffs = 0;

if (metricsA.summary.lineCount !== metricsB.summary.lineCount) {
  console.log(
    `  DIFF  lineCount: A=${metricsA.summary.lineCount} B=${metricsB.summary.lineCount}`,
  );
  diffs++;
}

const maxLines = Math.max(metricsA.lines.length, metricsB.lines.length);
for (let i = 0; i < maxLines; i++) {
  const la = metricsA.lines[i];
  const lb = metricsB.lines[i];
  if (!la || !lb) {
    diffs++;
    continue;
  }
  if (Math.abs(la.ratio - lb.ratio) > 0.001) {
    console.log(
      `  DIFF  line ${i}: ratio A=${la.ratio.toFixed(4)} B=${lb.ratio.toFixed(4)}`,
    );
    diffs++;
  }
  if (la.hyphenated !== lb.hyphenated) {
    console.log(
      `  DIFF  line ${i}: hyphenated A=${la.hyphenated} B=${lb.hyphenated}`,
    );
    diffs++;
  }
  if (la.wordCount !== lb.wordCount) {
    console.log(
      `  DIFF  line ${i}: wordCount A=${la.wordCount} B=${lb.wordCount}`,
    );
    diffs++;
  }
}

if (diffs === 0) {
  console.log('\nPASS  A and B are identical');
} else {
  console.log(`\nFAIL  ${diffs} difference(s) — see outputs above`);
}

console.log('\nNOTE: For true WASM vs TS comparison:');
console.log('  1. Save mt-11-a.metrics.json (WASM loaded)');
console.log('  2. Temporarily remove wasm/pkg/ and re-run to get ts output');
console.log(
  '  3. tsx manual/tools/diff-metrics.ts mt-11-a.metrics.json mt-11-b.metrics.json',
);

process.exit(diffs > 0 ? 1 : 0);
