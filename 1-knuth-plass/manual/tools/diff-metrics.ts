#!/usr/bin/env tsx
// manual/tools/diff-metrics.ts
// Diffs two metrics JSON files line-by-line.
// Primary use: MT-11 — compare WASM output vs TypeScript output.
//
// Usage:
//   tsx manual/tools/diff-metrics.ts \
//     manual/outputs/mt-11-ts.metrics.json \
//     manual/outputs/mt-11-wasm.metrics.json

import * as fs from 'fs';
import type { TestMetrics, LineMetrics } from '../fixtures/output.js';

const [, , fileA, fileB] = process.argv;
if (!fileA || !fileB) {
  console.error(
    'Usage: tsx manual/tools/diff-metrics.ts <a.metrics.json> <b.metrics.json>',
  );
  process.exit(1);
}

const a: TestMetrics = JSON.parse(fs.readFileSync(fileA, 'utf8'));
const b: TestMetrics = JSON.parse(fs.readFileSync(fileB, 'utf8'));

console.log(`Diffing:`);
console.log(
  `  A: ${fileA}  (${a.lines.length} lines, variance=${a.summary.ratioVariance})`,
);
console.log(
  `  B: ${fileB}  (${b.lines.length} lines, variance=${b.summary.ratioVariance})`,
);
console.log('');

let diffs = 0;

// ─── Summary diff ─────────────────────────────────────────────────────────────

if (a.summary.lineCount !== b.summary.lineCount) {
  console.log(
    `  DIFF  lineCount: A=${a.summary.lineCount}  B=${b.summary.lineCount}`,
  );
  diffs++;
}
if (a.summary.usedEmergency !== b.summary.usedEmergency) {
  console.log(
    `  DIFF  usedEmergency: A=${a.summary.usedEmergency}  B=${b.summary.usedEmergency}`,
  );
  diffs++;
}
if (a.summary.hyphenatedLines !== b.summary.hyphenatedLines) {
  console.log(
    `  DIFF  hyphenatedLines: A=${a.summary.hyphenatedLines}  B=${b.summary.hyphenatedLines}`,
  );
  diffs++;
}

// ─── Per-line diff ────────────────────────────────────────────────────────────

const maxLines = Math.max(a.lines.length, b.lines.length);
for (let i = 0; i < maxLines; i++) {
  const la: LineMetrics | undefined = a.lines[i];
  const lb: LineMetrics | undefined = b.lines[i];

  if (!la) {
    console.log(`  DIFF  line ${i}: missing in A`);
    diffs++;
    continue;
  }
  if (!lb) {
    console.log(`  DIFF  line ${i}: missing in B`);
    diffs++;
    continue;
  }

  const lineDiffs: string[] = [];

  // ratio: allow small float delta from different math paths
  if (Math.abs(la.ratio - lb.ratio) > 0.001)
    lineDiffs.push(`ratio A=${la.ratio.toFixed(4)} B=${lb.ratio.toFixed(4)}`);

  if (la.hyphenated !== lb.hyphenated)
    lineDiffs.push(`hyphenated A=${la.hyphenated} B=${lb.hyphenated}`);

  if (la.wordCount !== lb.wordCount)
    lineDiffs.push(`wordCount A=${la.wordCount} B=${lb.wordCount}`);

  if (la.lineWidth !== lb.lineWidth)
    lineDiffs.push(`lineWidth A=${la.lineWidth} B=${lb.lineWidth}`);

  if (lineDiffs.length > 0) {
    console.log(`  DIFF  line ${i}: ${lineDiffs.join(' | ')}`);
    diffs++;
  }
}

// ─── Result ───────────────────────────────────────────────────────────────────

console.log('');
if (diffs === 0) {
  console.log(
    'PASS  no differences found — WASM and TS outputs are equivalent',
  );
  process.exit(0);
} else {
  console.log(`FAIL  ${diffs} difference(s) found`);
  process.exit(1);
}
