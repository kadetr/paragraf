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
import {
  writeSvg,
  writePdf,
  writeJson,
  ratioVariance,
  type LineMetrics,
  type TestMetrics,
} from '../fixtures/output.js';
import { drawTestHeader } from '../fixtures/header.js';
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

// Purpose-built paragraph ending with the very short word "it.". At the
// column width below the optimum without a penalty leaves "it." alone on the
// last line (widow). With runtPenalty the breaker prefers a setting without
// the one-word last line, because the extra demerits of that setting are
// smaller than the penalty.
const WIDOW_TEXT =
  'The Knuth–Plass algorithm finds the globally optimal set of line breaks for a ' +
  'paragraph, minimising a cost function based on how tightly or loosely each line ' +
  'is fitted. Unlike first-fit greedy algorithms, it considers all feasible ' +
  'breakpoints simultaneously and avoids unsightly rivers of white space. ' +
  'Difficult ligatures such as "fi" and "fl" are resolved automatically. ' +
  'Hyphenation is applied using language-specific pattern dictionaries, and ' +
  'consecutive hyphenated lines are capped to prevent a ladder effect at the ' +
  'right margin. The algorithm was described by Knuth and Plass in 1981, and ' +
  'professional typesetting tools have long relied on it.';

// colW=384: at this width WIDOW_TEXT is set in 9 lines with "it." alone on
// the last one, and runtPenalty=8000 gives 8 lines with a full last line.
// Both engines agree, and the same holds for every width from 381 to 386 pt,
// so a small change in font metrics does not move the case.
//
// History: until v0.7.0 this script used 223 pt. The line breaker then
// measured every line after the first one word space too wide (see CHANGELOG,
// "Line measure no longer includes the glue at the previous break"); with the
// correct measure the optimum at 223 pt has six words on the last line, so
// there was no widow left for the penalty to remove.
//
// runtPenalty is a demerit, not a rule: at some widths (204–207 and 253 pt
// for this text) 8000 is less than the cost of the alternative and the
// one-word line stays.
const colW = 384;

// ─── Without penalties ────────────────────────────────────────────────────────

const outNoPenalty = composer.compose({
  text: WIDOW_TEXT,
  font: F12,
  lineWidth: colW,
  tolerance: 3,
  runtPenalty: 0,
  singleLinePenalty: 0,
});

// ─── With penalties ───────────────────────────────────────────────────────────

const t0 = performance.now();
const outPenalty = composer.compose({
  text: WIDOW_TEXT,
  font: F12,
  lineWidth: colW,
  tolerance: 3,
  runtPenalty: 8000,
  singleLinePenalty: 8000,
});
const ms = performance.now() - t0;

// ─── Checks ───────────────────────────────────────────────────────────────────

const lastNoPenalty = outNoPenalty.lines[outNoPenalty.lines.length - 1];
const lastWithPenalty = outPenalty.lines[outPenalty.lines.length - 1];

const noPenaltyLastWords = lastNoPenalty?.wordRuns.length ?? 0;
const withPenaltyLastWords = lastWithPenalty?.wordRuns.length ?? 0;

// A widow is a single word on the last line. The penalty should eliminate it
// by making the penultimate line absorb the orphaned word.  Pass only when the
// penalty version has >1 words on the last line AND the no-penalty version had
// exactly 1 word (i.e., there actually was a widow to fix).
const hadWidow = noPenaltyLastWords === 1;
const noWidow = withPenaltyLastWords > 1;
const pass = hadWidow && noWidow;

console.log(`\n  Without penalty: ${outNoPenalty.lines.length} lines`);
console.log(
  `    Last line words: ${noPenaltyLastWords} ${hadWidow ? '(widow detected)' : ''}`,
);
console.log(`  With penalty: ${outPenalty.lines.length} lines`);
console.log(`    Last line words: ${withPenaltyLastWords}`);
console.log(`  Widow fixed: ${noWidow}`);
if (!hadWidow)
  console.log('  NOTE: no widow at this width — test cannot exercise penalty');

// ─── SVG: side-by-side ────────────────────────────────────────────────────────

const renderedNo = layoutParagraph(outNoPenalty.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const renderedYes = layoutParagraph(outPenalty.lines, measurer, {
  x: MARGIN_X + colW + 20,
  y: MARGIN_TOP,
});

// Two columns of colW side by side are wider than A4, so the comparison SVG
// is as wide as it needs to be. The PDF below is one column on A4.
const svgW = Math.max(PAGE_W, MARGIN_X * 2 + colW * 2 + 20);
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
  preDraw: (doc) => drawTestHeader(doc, 'MT-07'),
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
    noPenaltyLastLineWords: noPenaltyLastWords,
    withPenaltyLastLineWords: withPenaltyLastWords,
    hadWidow: hadWidow,
    widowFixed: noWidow,
  },
};

writeJson('mt-07-widow-orphan.metrics.json', metrics);

console.log(pass ? '\nPASS' : '\nFAIL — widow not resolved');
process.exit(pass ? 0 : 1);
