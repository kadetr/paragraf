#!/usr/bin/env tsx
// manual/scripts/mt-09-variable-linewidths.ts
// MT-09 — Variable Line Widths (text wrap around image).
// Checks: first 2 lines use narrow width, rest use full width.
//
// Run:  tsx tests/manual/scripts/mt-09-variable-linewidths.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
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

const NARROW_W = 200;
const FULL_W = CONTENT_W;
const NARROW_LINES = 3; // first 3 lines are narrow
const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

const lineWidths = Array.from({ length: NARROW_LINES }, () => NARROW_W);

const t0 = performance.now();
const out = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: FULL_W,
  lineWidths,
  tolerance: 3,
});
const ms = performance.now() - t0;

// ─── Checks ───────────────────────────────────────────────────────────────────

let failures = 0;

for (let i = 0; i < Math.min(NARROW_LINES, out.lines.length); i++) {
  const w = out.lines[i].lineWidth;
  if (Math.abs(w - NARROW_W) > 1) {
    console.log(
      `  FAIL  line ${i}: lineWidth=${w.toFixed(2)}, expected ${NARROW_W}`,
    );
    failures++;
  }
}
for (let i = NARROW_LINES; i < out.lines.length; i++) {
  const w = out.lines[i].lineWidth;
  if (Math.abs(w - FULL_W) > 1) {
    console.log(
      `  FAIL  line ${i}: lineWidth=${w.toFixed(2)}, expected ${FULL_W}`,
    );
    failures++;
    if (failures > 3) break;
  }
}

console.log(`\n  ${out.lines.length} lines in ${ms.toFixed(1)}ms`);
console.log(
  `  Lines 0–${NARROW_LINES - 1}: ${NARROW_W}pt  |  Lines ${NARROW_LINES}+: ${FULL_W}pt`,
);

// ─── SVG: show narrow region as shaded box ────────────────────────────────────

const rendered = layoutParagraph(out.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});

const narrowH = rendered
  .slice(0, NARROW_LINES)
  .reduce((s, l) => s + l.lineHeight, 0);
const inner = renderToSvg(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
})
  .replace(/<\/?svg[^>]*>/g, '')
  .trim();

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">`,
  `<rect width="${PAGE_W}" height="${PAGE_H}" fill="white"/>`,
  // Simulated image placeholder (right side of narrow region)
  `<rect x="${MARGIN_X + NARROW_W + 4}" y="${MARGIN_TOP}" width="${FULL_W - NARROW_W - 4}" height="${narrowH}" fill="#e8e8e8" rx="2"/>`,
  `<text x="${MARGIN_X + NARROW_W + 10}" y="${MARGIN_TOP + narrowH / 2}" font-size="9" fill="#888">image</text>`,
  inner,
  '</svg>',
].join('\n');

writeSvg('mt-09-variable-linewidths.svg', svg);
const pdf = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writePdf('mt-09-variable-linewidths.pdf', pdf);

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = out.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-09',
  timestamp: new Date().toISOString(),
  perf: { composeMs: ms },
  lines: lineMetrics,
  summary: {
    lineCount: out.lines.length,
    usedEmergency: out.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    narrowLines: NARROW_LINES,
    narrowWidth: NARROW_W,
    fullWidth: FULL_W,
  },
};

writeJson('mt-09-variable-linewidths.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
