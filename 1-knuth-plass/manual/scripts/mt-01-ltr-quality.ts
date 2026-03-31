#!/usr/bin/env tsx
// manual/scripts/mt-01-ltr-quality.ts
// MT-01 — LTR Typography Quality.
// Compares KP output vs a simple greedy line-breaker on EN_BODY.
// Visual: generates SVG. Metric: ratio variance (KP should be lower).
//
// Run:  tsx manual/scripts/mt-01-ltr-quality.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '../../src/paragraph.js';
import { createMeasurer } from '../../src/measure.js';
import { layoutParagraph, renderToSvg } from '../../src/render.js';
import { renderToPdf } from '../../src/pdf.js';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import {
  writeSvg,
  writePdf,
  writeJson,
  ratioVariance,
  type LineMetrics,
  type TestMetrics,
} from '../fixtures/output.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── Compose — Knuth-Plass ────────────────────────────────────────────────────

const t0 = performance.now();
const outKP = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
  widowPenalty: 150,
  orphanPenalty: 150,
});
const msKP = performance.now() - t0;

// ─── Greedy line-breaker (first-fit) ─────────────────────────────────────────
// Simple reference implementation to compare against KP.

const greedyBreak = (
  text: string,
  lineWidth: number,
  fontSize: number,
): string[][] => {
  const words = text.trim().split(/\s+/);
  const lines: string[][] = [];
  let current: string[] = [];
  let currentW = 0;
  const spaceW = fontSize * 0.25;

  for (const word of words) {
    const ww = measurer.measure(word, F12);
    const addW = current.length > 0 ? spaceW + ww : ww;
    if (current.length > 0 && currentW + addW > lineWidth) {
      lines.push(current);
      current = [word];
      currentW = ww;
    } else {
      current.push(word);
      currentW += addW;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
};

const t1 = performance.now();
const greedyLines = greedyBreak(EN_BODY, CONTENT_W, F12.size);
const msGreedy = performance.now() - t1;

// ─── Summary ──────────────────────────────────────────────────────────────────

const kpMetrics: LineMetrics[] = outKP.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: l.xOffset ?? 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const kpVariance = ratioVariance(kpMetrics);
const lastLine = outKP.lines[outKP.lines.length - 1];
const widowFixed = lastLine ? lastLine.wordRuns.length > 1 : true;

console.log(
  `\nKP:     ${outKP.lines.length} lines, variance=${kpVariance.toFixed(4)}, ${msKP.toFixed(1)}ms`,
);
console.log(`Greedy: ${greedyLines.length} lines, ${msGreedy.toFixed(1)}ms`);
console.log(`Widow fixed: ${widowFixed}`);
console.log(`Used emergency: ${outKP.usedEmergency}`);

// ─── SVG ──────────────────────────────────────────────────────────────────────

const rendered = layoutParagraph(outKP.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const svg = renderToSvg(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writeSvg('mt-01-ltr-quality.svg', svg);
const pdf = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writePdf('mt-01-ltr-quality.pdf', pdf);

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const metrics: TestMetrics = {
  test: 'MT-01',
  timestamp: new Date().toISOString(),
  perf: { composeMs: msKP },
  lines: kpMetrics,
  summary: {
    lineCount: outKP.lines.length,
    usedEmergency: outKP.usedEmergency,
    ratioVariance: kpVariance,
    maxRatio: Math.max(...kpMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...kpMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: kpMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    greedyLineCount: greedyLines.length,
    widowFixed,
  },
};

writeJson('mt-01-ltr-quality.metrics.json', metrics);

const pass = kpVariance <= 0.15 && !outKP.usedEmergency;
console.log(pass ? '\nPASS' : '\nFAIL');
process.exit(pass ? 0 : 1);
