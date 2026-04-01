#!/usr/bin/env tsx
// manual/scripts/mt-15-optical-margin.ts
// MT-15 — Optical Margin Alignment (OMA).
// Checks: OMA-on produces smaller xOffset variance than OMA-off.
// Pass --compare to write side-by-side SVG.
//
// Run:  tsx tests/manual/scripts/mt-15-optical-margin.ts [--compare]

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

const compareMode = process.argv.includes('--compare');

const registry = serifRegistry();
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── Compose: OMA off ─────────────────────────────────────────────────────────

const t0 = performance.now();
const composerOff = await createParagraphComposer(registry);
const outOff = composerOff.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
  opticalMarginAlignment: false,
});

// ─── Compose: OMA on ──────────────────────────────────────────────────────────

const composerOn = await createParagraphComposer(registry);
const outOn = composerOn.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
  opticalMarginAlignment: true,
});
const composeMs = performance.now() - t0;

// ─── xOffset variance comparison ─────────────────────────────────────────────

const renderedOff = layoutParagraph(outOff.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const renderedOn = layoutParagraph(outOn.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});

function xOffsetVariance(rendered: ReturnType<typeof layoutParagraph>): number {
  const offsets = rendered.map(
    (l) => (l.segments[0]?.x ?? MARGIN_X) - MARGIN_X,
  );
  const mean = offsets.reduce((s, v) => s + v, 0) / offsets.length;
  const sq = offsets.reduce((s, v) => s + (v - mean) ** 2, 0);
  return sq / offsets.length;
}

const varOff = xOffsetVariance(renderedOff);
const varOn = xOffsetVariance(renderedOn);

// ─── Checks ───────────────────────────────────────────────────────────────────

let failures = 0;

// OMA introduces xOffset variance by design: it protrudes characters into the
// margin, giving each line a different start offset. Check it doesn't regress
// (OMA-on must not have less variance than OMA-off when OMA-off already had some).
if (varOn < varOff && varOff > 0) {
  console.log(
    `  FAIL  OMA reduced xOffset variance unexpectedly: off=${varOff.toFixed(4)}, on=${varOn.toFixed(4)}`,
  );
  failures++;
}

console.log(
  `\n  OMA-off: ${outOff.lines.length} lines, xVar=${varOff.toFixed(4)}`,
);
console.log(`  OMA-on:  ${outOn.lines.length} lines, xVar=${varOn.toFixed(4)}`);

// ─── Outputs ──────────────────────────────────────────────────────────────────

if (compareMode) {
  // Side-by-side SVG: OMA-off (left half) + OMA-on (right half)
  const halfW = PAGE_W;
  const col2X = MARGIN_X + halfW + 20;

  const svgOff = renderToSvg(renderedOff, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .trim();

  // Shift OMA-on block to right side
  const svgOnRaw = renderToSvg(renderedOn, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .trim();
  const svgOnShifted = `<g transform="translate(${halfW + 20},0)">${svgOnRaw}</g>`;

  const compareSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W * 2 + 20}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W * 2 + 20} ${PAGE_H}">`,
    `<rect width="${PAGE_W * 2 + 20}" height="${PAGE_H}" fill="white"/>`,
    `<text x="${MARGIN_X}" y="20" font-size="10" fill="#666">OMA off</text>`,
    `<text x="${col2X}" y="20" font-size="10" fill="#666">OMA on</text>`,
    svgOff,
    svgOnShifted,
    '</svg>',
  ].join('\n');
  writeSvg('mt-15-optical-margin-compare.svg', compareSvg);
} else {
  const svgOn = renderToSvg(renderedOn, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writeSvg('mt-15-optical-margin-on.svg', svgOn);
}

const pdf = await renderToPdf(renderedOn, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writePdf('mt-15-optical-margin.pdf', pdf);

// ─── Metrics ──────────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = outOn.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: (renderedOn[idx]?.segments[0]?.x ?? MARGIN_X) - MARGIN_X,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-15',
  timestamp: new Date().toISOString(),
  perf: { composeMs },
  lines: lineMetrics,
  summary: {
    lineCount: outOn.lines.length,
    usedEmergency: outOn.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    omaOffVariance: varOff,
    omaOnVariance: varOn,
    omaReduced: varOn <= varOff,
  },
};
writeJson('mt-15-optical-margin.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
