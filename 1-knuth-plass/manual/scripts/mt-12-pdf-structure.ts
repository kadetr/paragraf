#!/usr/bin/env tsx
// manual/scripts/mt-12-pdf-structure.ts
// MT-12 — PDF Output Structural Check.
// Generates a PDF and verifies it is a valid PDF file.
// For deeper checks, run: mutool show output/mt-12-pdf-structure.pdf
//                         pdfinfo output/mt-12-pdf-structure.pdf
//
// Run:  tsx manual/scripts/mt-12-pdf-structure.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '../../src/paragraph.js';
import { createMeasurer } from '../../src/measure.js';
import { layoutParagraph } from '../../src/render.js';
import { renderToPdf } from '../../src/pdf.js';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { writePdf, writeJson, type TestMetrics } from '../fixtures/output.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';
import { HE_PARAGRAPH } from '../fixtures/text.js';
import { hebrewRegistry, F12HE } from '../fixtures/fonts.js';

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── Compose ──────────────────────────────────────────────────────────────────

const t0 = performance.now();
const out = composer.compose({
  text:
    'The Knuth–Plass algorithm finds the globally optimal set of line breaks. ' +
    'This is a PDF structural test. The output should open without errors in any PDF viewer.',
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const ms = performance.now() - t0;

const rendered = layoutParagraph(out.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});

// ─── Hebrew paragraph (RTL in PDF) ───────────────────────────────────────────

const heRegistry = hebrewRegistry();
const heComposer = await createParagraphComposer(heRegistry);
const heMeasurer = createMeasurer(heRegistry);
const heFontEngine = await createDefaultFontEngine(heRegistry);

const outHe = heComposer.compose({
  text: HE_PARAGRAPH,
  font: F12HE,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const renderedHe = layoutParagraph(outHe.lines, heMeasurer, {
  x: MARGIN_X,
  y: MARGIN_TOP + rendered.reduce((s, l) => s + l.lineHeight, 0) + 20,
});

// ─── Render to PDF ────────────────────────────────────────────────────────────

const allRendered = [...rendered, ...renderedHe];
const pdfBuf = await renderToPdf(allRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});

writePdf('mt-12-pdf-structure.pdf', pdfBuf);

// ─── Structural check: valid PDF header ──────────────────────────────────────

let failures = 0;

const header = pdfBuf.slice(0, 8).toString('ascii');
if (!header.startsWith('%PDF-')) {
  console.log(`  FAIL  PDF header missing: ${header}`);
  failures++;
} else {
  console.log(`  PASS  PDF header: ${header.trim()}`);
}

// Check %%EOF marker
const tail = pdfBuf.slice(-64).toString('ascii');
if (!tail.includes('%%EOF')) {
  console.log(`  FAIL  PDF %%EOF marker missing`);
  failures++;
} else {
  console.log(`  PASS  PDF %%EOF present`);
}

console.log(`\n  PDF size: ${(pdfBuf.length / 1024).toFixed(1)} KB`);
console.log(`  Compose time: ${ms.toFixed(1)}ms`);
console.log(
  '\n  Tip: open manual/outputs/mt-12-pdf-structure.pdf in Preview or Acrobat',
);
console.log('  Tip: mutool show manual/outputs/mt-12-pdf-structure.pdf');

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const metrics: TestMetrics = {
  test: 'MT-12',
  timestamp: new Date().toISOString(),
  perf: { composeMs: ms },
  lines: [],
  summary: {
    lineCount: out.lines.length,
    usedEmergency: out.usedEmergency,
    ratioVariance: 0,
    maxRatio: 0,
    minRatio: 0,
    hyphenatedLines: 0,
  },
  extra: {
    pdfSizeKb: Math.round(pdfBuf.length / 1024),
    validHeader: header.startsWith('%PDF-'),
    hasEof: tail.includes('%%EOF'),
  },
};

writeJson('mt-12-pdf-structure.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
