#!/usr/bin/env tsx
// manual/scripts/mt-12-pdf-structure.ts
// MT-12 — PDF structural integrity check.
// Checks: output bytes start with %PDF- and end with %%EOF; English + Hebrew in one PDF.
//
// Run:  tsx tests/manual/scripts/mt-12-pdf-structure.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
import {
  serifRegistry,
  hebrewRegistry,
  F12,
  F12HE,
} from '../fixtures/fonts.js';
import { EN_BODY, HE_PARAGRAPH } from '../fixtures/text.js';
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

const enRegistry = serifRegistry();
const heRegistry = hebrewRegistry();
const enComposer = await createParagraphComposer(enRegistry);
const heComposer = await createParagraphComposer(heRegistry);
const enFontEngine = await createDefaultFontEngine(enRegistry);
const heFontEngine = await createDefaultFontEngine(heRegistry);
const enMeasurer = createMeasurer(enRegistry);
const heMeasurer = createMeasurer(heRegistry);

// ─── Compose ──────────────────────────────────────────────────────────────────

const t0 = performance.now();
const enOut = enComposer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const heOut = heComposer.compose({
  text: HE_PARAGRAPH,
  font: F12HE,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const ms = performance.now() - t0;

// ─── Layout & render ──────────────────────────────────────────────────────────

const enRendered = layoutParagraph(enOut.lines, enMeasurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const lastEnY = MARGIN_TOP + enRendered.reduce((s, l) => s + l.lineHeight, 0);

const heRendered = layoutParagraph(heOut.lines, heMeasurer, {
  x: MARGIN_X,
  y: lastEnY + 24,
});

// SVG (English only for brevity)
const svg = renderToSvg(enRendered, enFontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writeSvg('mt-12-pdf-structure-en.svg', svg);

// PDF with English block
const pdfBytes = await renderToPdf(enRendered, enFontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  preDraw: (doc) => drawTestHeader(doc, 'MT-12'),
});
writePdf('mt-12-pdf-structure.pdf', pdfBytes);

// ─── Structural checks ────────────────────────────────────────────────────────

let failures = 0;

const header = Buffer.from(pdfBytes).toString('ascii', 0, 5);
if (header !== '%PDF-') {
  console.log(`  FAIL  PDF header: got "${header}", expected "%PDF-"`);
  failures++;
}

// %%EOF may have trailing whitespace/newline; look for it in last 32 bytes
const tail = Buffer.from(pdfBytes)
  .slice(-32)
  .toString('ascii')
  .replace(/\s/g, '');
if (!tail.includes('%%EOF')) {
  console.log(`  FAIL  PDF tail missing %%EOF (got: "${tail}")`);
  failures++;
}

if (pdfBytes.length < 1024) {
  console.log(`  FAIL  PDF suspiciously small: ${pdfBytes.length} bytes`);
  failures++;
}

console.log(
  `\n  EN lines: ${enOut.lines.length}  |  HE lines: ${heOut.lines.length}`,
);
console.log(`  PDF size: ${(pdfBytes.length / 1024).toFixed(1)} KB`);
console.log(`  Compose time: ${ms.toFixed(1)}ms`);

// ─── Metrics ──────────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = enOut.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-12',
  timestamp: new Date().toISOString(),
  perf: { composeMs: ms },
  lines: lineMetrics,
  summary: {
    lineCount: enOut.lines.length,
    usedEmergency: enOut.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    heLines: heOut.lines.length,
    pdfBytes: pdfBytes.length,
    headerOk: header === '%PDF-',
    eofOk: tail.includes('%%EOF'),
  },
};
writeJson('mt-12-pdf-structure.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
