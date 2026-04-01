#!/usr/bin/env tsx
// manual/scripts/mt-07-widow-orphan.ts
// MT-07 — Widow / Orphan Control.
// Compares with/without widow+orphan penalties.
//
// Run:  tsx tests/manual/scripts/mt-07-widow-orphan.ts

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

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// Each paragraph is rendered in its own half-column so they don't overlap.
const colW = Math.floor(CONTENT_W / 2) - 10;

// ─── Without penalties ────────────────────────────────────────────────────────

const outNoPenalty = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: colW,
  tolerance: 3,
  widowPenalty: 0,
  orphanPenalty: 0,
});

// ─── With penalties ───────────────────────────────────────────────────────────

const t0 = performance.now();
const outPenalty = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: colW,
  tolerance: 3,
  widowPenalty: 150,
  orphanPenalty: 150,
});
const ms = performance.now() - t0;

// ─── Checks ───────────────────────────────────────────────────────────────────

const lastNoPenalty = outNoPenalty.lines[outNoPenalty.lines.length - 1];
const lastWithPenalty = outPenalty.lines[outPenalty.lines.length - 1];

const noWidow = lastWithPenalty ? lastWithPenalty.wordRuns.length > 1 : true;

console.log(`\n  Without penalty: ${outNoPenalty.lines.length} lines`);
console.log(`    Last line words: ${lastNoPenalty?.wordRuns.length ?? 0}`);
console.log(`  With penalty: ${outPenalty.lines.length} lines`);
console.log(`    Last line words: ${lastWithPenalty?.wordRuns.length ?? 0}`);
console.log(`  Widow fixed: ${noWidow}`);

// ─── SVG: side-by-side ────────────────────────────────────────────────────────

const renderedNo = layoutParagraph(outNoPenalty.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const renderedYes = layoutParagraph(outPenalty.lines, measurer, {
  x: MARGIN_X + colW + 20,
  y: MARGIN_TOP,
});

const svgW = PAGE_W;
const svgH = PAGE_H;
const innerNo = renderToSvg(renderedNo, fontEngine, {
  width: svgW,
  height: svgH,
})
  .replace(/<\/?svg[^>]*>/g, '')
  .trim();
const innerYes = renderToSvg(renderedYes, fontEngine, {
  width: svgW,
  height: svgH,
})
  .replace(/<\/?svg[^>]*>/g, '')
  .trim();

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
  `<rect width="${svgW}" height="${svgH}" fill="white"/>`,
  // column divider
  `<line x1="${MARGIN_X + colW + 10}" y1="0" x2="${MARGIN_X + colW + 10}" y2="${svgH}" stroke="#ccc" stroke-width="0.5"/>`,
  `<text x="${MARGIN_X}" y="${MARGIN_TOP - 8}" font-size="9" fill="#888">No widow/orphan control</text>`,
  `<text x="${MARGIN_X + colW + 20}" y="${MARGIN_TOP - 8}" font-size="9" fill="#888">With widow/orphan penalty</text>`,
  innerNo,
  innerYes,
  '</svg>',
].join('\n');

writeSvg('mt-07-widow-orphan.svg', svg);

// ─── PDF (penalty version) ────────────────────────────────────────────────────

const renderedPdf = layoutParagraph(outPenalty.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const pdf = await renderToPdf(renderedPdf, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writePdf('mt-07-widow-orphan.pdf', pdf);

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = outPenalty.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-07',
  timestamp: new Date().toISOString(),
  perf: { composeMs: ms },
  lines: lineMetrics,
  summary: {
    lineCount: outPenalty.lines.length,
    usedEmergency: outPenalty.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    noPenaltyLastLineWords: lastNoPenalty?.wordRuns.length ?? 0,
    withPenaltyLastLineWords: lastWithPenalty?.wordRuns.length ?? 0,
    widowFixed: noWidow,
  },
};

writeJson('mt-07-widow-orphan.metrics.json', metrics);

console.log(noWidow ? '\nPASS' : '\nFAIL — widow not resolved');
process.exit(noWidow ? 0 : 1);
