#!/usr/bin/env tsx
// manual/tools/verify-metrics.ts
// Reads a metrics JSON and asserts invariants for each test type.
// Exit 0 = all checks pass. Exit 1 = failures found.
//
// Usage:
//   tsx manual/tools/verify-metrics.ts manual/outputs/mt-14-baseline-grid.metrics.json
//   tsx manual/tools/verify-metrics.ts manual/outputs/*.metrics.json

import * as fs from 'fs';
import type { TestMetrics } from '../fixtures/output.js';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    'Usage: tsx manual/tools/verify-metrics.ts <file.metrics.json> [...]',
  );
  process.exit(1);
}

// ─── Per-test invariant checkers ─────────────────────────────────────────────

type CheckFn = (m: TestMetrics) => string[]; // returns list of failure messages

const checkers: Record<string, CheckFn> = {
  'MT-01': (m) => {
    const failures: string[] = [];
    if (m.summary.ratioVariance > 0.15)
      failures.push(
        `ratio variance too high: ${m.summary.ratioVariance} > 0.15`,
      );
    if (m.summary.usedEmergency)
      failures.push('used emergency stretch unexpectedly');
    return failures;
  },

  'MT-06': (m) => {
    const failures: string[] = [];
    // Emergency stretch must have fired if max ratio > 1.5
    if (m.summary.maxRatio > 1.5 && !m.summary.usedEmergency)
      failures.push(
        `max ratio ${m.summary.maxRatio} > 1.5 but usedEmergency is false`,
      );
    return failures;
  },

  'MT-07': (m) => {
    const failures: string[] = [];
    // widow test: last line should have >1 word
    const last = m.lines[m.lines.length - 1];
    if (last && last.wordCount <= 1)
      failures.push(`widow not fixed: last line has ${last.wordCount} word(s)`);
    return failures;
  },

  'MT-08': (m) => {
    const failures: string[] = [];
    if (!m.extra) return failures;
    const limit = m.extra['consecutiveHyphenLimit'] as number | undefined;
    if (limit === undefined) return failures;
    // Check that no run of consecutive hyphenated lines exceeds the limit
    let run = 0;
    for (const l of m.lines) {
      if (l.hyphenated) {
        run++;
        if (run > limit)
          failures.push(
            `consecutive hyphen limit ${limit} exceeded (run=${run})`,
          );
      } else {
        run = 0;
      }
    }
    return failures;
  },

  'MT-14': (m) => {
    const failures: string[] = [];
    if (!m.extra) return failures;
    const gridFailures = m.extra['gridFailures'] as number | undefined;
    if (gridFailures !== undefined && gridFailures > 0)
      failures.push(
        `${gridFailures} paragraph first-line baseline(s) not on grid`,
      );
    return failures;
  },

  'MT-15': (m) => {
    const failures: string[] = [];
    if (!m.extra) return failures;
    const noOmaLineCount = m.extra['noOmaLineCount'] as number | undefined;
    if (noOmaLineCount !== undefined && m.summary.lineCount > noOmaLineCount)
      failures.push(
        `OMA line count (${m.summary.lineCount}) > no-OMA line count (${noOmaLineCount})`,
      );
    return failures;
  },
};

// ─── Runner ───────────────────────────────────────────────────────────────────

let anyFailed = false;

for (const filePath of args) {
  let metrics: TestMetrics;
  try {
    metrics = JSON.parse(fs.readFileSync(filePath, 'utf8')) as TestMetrics;
  } catch (e) {
    console.error(`ERROR reading ${filePath}: ${e}`);
    anyFailed = true;
    continue;
  }

  const checker = checkers[metrics.test];
  if (!checker) {
    console.log(`SKIP  ${metrics.test} — no invariant checker registered`);
    continue;
  }

  const failures = checker(metrics);
  if (failures.length === 0) {
    console.log(`PASS  ${metrics.test} (${filePath})`);
  } else {
    console.log(`FAIL  ${metrics.test} (${filePath})`);
    for (const f of failures) console.log(`        ✗ ${f}`);
    anyFailed = true;
  }
}

process.exit(anyFailed ? 1 : 0);
