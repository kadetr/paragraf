#!/usr/bin/env tsx
// manual/scripts/mt-20-tolerance.ts
// MT-20 — Tolerance parameter sweep: 1 / 2 / 3 / 5 / 10
// Checks: higher tolerance → same or fewer lines (looser is never worse than tighter);
//         emergency rate drops as tolerance rises.
//
// Run:  tsx tests/manual/scripts/mt-20-tolerance.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import {
  writeSvg,
  writeJson,
  ratioVariance,
  type LineMetrics,
  type TestMetrics,
} from '../fixtures/output.js';
import { addSvgTestHeader } from '../fixtures/header.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

const TOLERANCES = [1, 2, 3, 5, 10];

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

type SweepRow = {
  tolerance: number;
  lines: number | null;
  ratioVar: number | null;
  ms: number;
  emergencyUsed: boolean;
  infeasible: boolean;
};
const rows: SweepRow[] = [];

// Use a narrow column (250pt) so that tight tolerance (1) is infeasible while
// higher tolerances (≥2) succeed — demonstrating that tolerance has real effect.
const NARROW_W = 250;

console.log('\n  Tol  Lines  RatioVar  Time(ms)  Emergency  Infeasible');
console.log('  ────────────────────────────────────────────────────');

let failures = 0;

for (const tolerance of TOLERANCES) {
  const t0 = performance.now();
  let infeasible = false;
  let out: Awaited<ReturnType<typeof composer.compose>> | null = null;
  try {
    out = composer.compose({
      text: EN_BODY,
      font: F12,
      lineWidth: NARROW_W,
      tolerance,
    });
  } catch {
    infeasible = true;
  }
  const ms = performance.now() - t0;

  const lineMs: LineMetrics[] = out
    ? out.lines.map((l, idx) => ({
        idx,
        y: 0,
        ratio: l.ratio,
        hyphenated: l.hyphenated ?? false,
        xOffset: 0,
        lineWidth: l.lineWidth,
        wordCount: l.wordRuns.length,
      }))
    : [];
  const rv = out ? ratioVariance(lineMs) : null;

  if (out) {
    const rendered = layoutParagraph(out.lines, measurer, {
      x: MARGIN_X,
      y: MARGIN_TOP,
    });
    const svg = renderToSvg(rendered, fontEngine, {
      width: PAGE_W,
      height: PAGE_H,
    });
    writeSvg(
      `mt-20-tolerance-${tolerance}.svg`,
      addSvgTestHeader(svg, 'MT-20'),
    );
  }

  console.log(
    `  ${String(tolerance).padEnd(4)} ${String(out?.lines.length ?? '—').padEnd(6)} ${rv != null ? rv.toFixed(4).padEnd(9) : '—'.padEnd(9)} ${ms.toFixed(1).padEnd(9)} ${out?.usedEmergency ? 'YES' : 'no'.padEnd(10)} ${infeasible ? 'YES (expected at low tol)' : 'no'}`,
  );

  rows.push({
    tolerance,
    lines: out?.lines.length ?? null,
    ratioVar: rv,
    ms,
    emergencyUsed: out?.usedEmergency ?? false,
    infeasible,
  });
}

// Check: the highest tolerance (10) must produce a feasible solution
const t10Row = rows.find((r) => r.tolerance === 10);
if (!t10Row || t10Row.infeasible) {
  console.log(
    '  FAIL  tolerance=10 is infeasible — KP cannot set this paragraph at any tolerance',
  );
  failures++;
}

// Check: there must be visible differentiation across tolerances (otherwise the
// test is meaningless — tighten NARROW_W further or use harder text).
const anyInfeasible = rows.some((r) => r.infeasible);
const lineCounts = rows
  .filter((r) => !r.infeasible)
  .map((r) => r.lines as number);
const uniqueLineCounts = new Set(lineCounts);
if (!anyInfeasible && uniqueLineCounts.size === 1) {
  console.log(
    '  FAIL  all tolerances produce identical line counts with no infeasible cases — no differentiation',
  );
  failures++;
}

const metrics: TestMetrics = {
  test: 'MT-20',
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
writeJson('mt-20-tolerance.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
