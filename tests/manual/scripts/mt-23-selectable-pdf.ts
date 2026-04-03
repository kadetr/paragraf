#!/usr/bin/env tsx
// manual/scripts/mt-23-selectable-pdf.ts
// MT-23 — Selectable PDF output review.
//
// Produces four output PDFs for manual visual + copy-paste inspection:
//
//   mt-23-selectable-paragraph.pdf   — single paragraph, selectable
//   mt-23-selectable-ligatures.pdf   — ligature-heavy text, selectable
//   mt-23-selectable-non-ascii.pdf   — Turkish + French non-ASCII, selectable
//   mt-23-selectable-document.pdf    — multi-page document, selectable
//
// For each PDF, also writes a non-selectable baseline so you can diff the sizes.
//
// Manual checks:
//   1. Open each *-selectable.pdf in your PDF viewer.
//   2. Try to select text with the cursor — it should highlight a full line.
//   3. Copy and paste — Unicode characters should appear correctly.
//   4. For ligatures (fi, fl, ffi): copied text should contain original letters.
//   5. For non-ASCII: Turkish ğüşiöı and French déjà vu should copy correctly.
//   6. The visual appearance must be identical between baseline and selectable.
//
// Run:  tsx tests/manual/scripts/mt-23-selectable-pdf.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
  composeDocument,
  layoutDocument,
  type Document,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph } from '@paragraf/render-core';
import { renderToPdf, renderDocumentToPdf } from '@paragraf/render-pdf';
import { serifRegistry, F12, F12B, font } from '../fixtures/fonts.js';
import {
  EN_BODY,
  DOCUMENT_PARA_1,
  DOCUMENT_PARA_2,
  DOCUMENT_PARA_3,
} from '../fixtures/text.js';
import {
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
  CONTENT_H,
  PAGE_W,
  PAGE_H,
  singleColumnFrame,
} from '../fixtures/documents.js';

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const fontEngine = await createDefaultFontEngine(registry);
const measurer = createMeasurer(registry);

// ─── 1. Single paragraph ──────────────────────────────────────────────────────

const t0 = performance.now();
const paraOut = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const paraRendered = layoutParagraph(paraOut.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const paraMs = performance.now() - t0;

const paraBase = await renderToPdf(paraRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
const paraSel = await renderToPdf(paraRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  selectable: true,
  fontRegistry: registry,
  title: 'MT-23 Selectable Paragraph',
  lang: 'en-us',
});

writePdf('mt-23-selectable-paragraph-baseline.pdf', paraBase);
writePdf('mt-23-selectable-paragraph.pdf', paraSel);

// ─── 2. Ligature-heavy text ───────────────────────────────────────────────────

const LIGATURE_TEXT =
  'Difficult ligatures such as "fi", "fl", and "ffi" are resolved automatically ' +
  'through GSUB lookup tables. Efficient office staff affiliated with official ' +
  'financial affiliates efficiently drafted difficult coefficients.';

const ligOut = composer.compose({
  text: LIGATURE_TEXT,
  font: F12,
  lineWidth: CONTENT_W,
});
const ligRendered = layoutParagraph(ligOut.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});

const ligBase = await renderToPdf(ligRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
const ligSel = await renderToPdf(ligRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  selectable: true,
  fontRegistry: registry,
  title: 'MT-23 Selectable Ligatures',
  lang: 'en-us',
});

writePdf('mt-23-selectable-ligatures-baseline.pdf', ligBase);
writePdf('mt-23-selectable-ligatures.pdf', ligSel);

// ─── 3. Non-ASCII text (Turkish + French) ─────────────────────────────────────

const NON_ASCII_TEXT =
  'Türkçe: Ağaç, ığne, üzüm, şeker, öğrenci, çiçek. ' +
  'Français: déjà vu, naïve, café, résumé, façade, señor. ' +
  'The ligature "fi" appears in: office, efficient, affiliate, suffix.';

const nonAsciiOut = composer.compose({
  text: NON_ASCII_TEXT,
  font: F12,
  lineWidth: CONTENT_W,
});
const nonAsciiRendered = layoutParagraph(nonAsciiOut.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});

const nonAsciiBase = await renderToPdf(nonAsciiRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
const nonAsciiSel = await renderToPdf(nonAsciiRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  selectable: true,
  fontRegistry: registry,
  title: 'MT-23 Selectable Non-ASCII',
  lang: 'tr',
});

writePdf('mt-23-selectable-non-ascii-baseline.pdf', nonAsciiBase);
writePdf('mt-23-selectable-non-ascii.pdf', nonAsciiSel);

// ─── 4. Multi-page document ───────────────────────────────────────────────────

const docDef: Document = {
  paragraphs: [
    { text: DOCUMENT_PARA_1, font: F12, lineWidth: CONTENT_W },
    { text: DOCUMENT_PARA_2, font: F12B, lineWidth: CONTENT_W },
    { text: DOCUMENT_PARA_3, font: F12, lineWidth: CONTENT_W },
    { text: EN_BODY, font: F12, lineWidth: CONTENT_W },
  ],
  frames: [
    singleColumnFrame({ page: 0 }),
    singleColumnFrame({ page: 1 }),
    singleColumnFrame({ page: 2 }),
  ],
};

const composed = composeDocument(docDef, composer);
const renderedDoc = layoutDocument(composed, docDef.frames, measurer);

const docBase = await renderDocumentToPdf(renderedDoc, fontEngine, {
  pageWidth: PAGE_W,
  pageHeight: PAGE_H,
});
const docSel = await renderDocumentToPdf(renderedDoc, fontEngine, {
  pageWidth: PAGE_W,
  pageHeight: PAGE_H,
  selectable: true,
  fontRegistry: registry,
  title: 'MT-23 Selectable Multi-Page Document',
  lang: 'en-us',
});

writePdf('mt-23-selectable-document-baseline.pdf', docBase);
writePdf('mt-23-selectable-document.pdf', docSel);

// ─── Checks ───────────────────────────────────────────────────────────────────

let failures = 0;

// Size delta: selectable PDFs must be strictly larger than their baselines.
// (The invisible text overlay + font embedding adds overhead even when compressed.)
const sizeChecks: Array<{ label: string; base: Buffer; sel: Buffer }> = [
  { label: 'paragraph', base: paraBase, sel: paraSel },
  { label: 'ligatures', base: ligBase, sel: ligSel },
  { label: 'non-ascii', base: nonAsciiBase, sel: nonAsciiSel },
  { label: 'document', base: docBase, sel: docSel },
];

for (const { label, base, sel } of sizeChecks) {
  if (sel.length <= base.length) {
    console.log(
      `  FAIL  ${label}: selectable (${sel.length}B) not larger than baseline (${base.length}B)`,
    );
    failures++;
  }
}

// Content-stream check: render the paragraph uncompressed so we can grep for
// raw PDF operators. ("3 Tr" lives in a content stream and is invisible after
// zlib compression used in normal renders.)
const paraSelUncompressed = await renderToPdf(paraRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  selectable: true,
  fontRegistry: registry,
  compress: false,
});

const uncompressedStr = paraSelUncompressed.toString('latin1');

if (!uncompressedStr.includes('3 Tr')) {
  console.log(
    '  FAIL  paragraph (uncompressed): "3 Tr" invisible text marker not found',
  );
  failures++;
}
if (!uncompressedStr.includes('ToUnicode')) {
  console.log('  FAIL  paragraph (uncompressed): ToUnicode CMap missing');
  failures++;
}

// ToUnicode is in the font descriptor (not compressed with the content stream),
// so we can check it in normal compressed renders too.
for (const { label, sel } of sizeChecks) {
  if (!sel.toString('latin1').includes('ToUnicode')) {
    console.log(`  FAIL  ${label}: ToUnicode CMap missing from selectable PDF`);
    failures++;
  }
}

// Baseline PDFs must NOT contain the invisible text overlay.
const paraBaseUncompressed = await renderToPdf(paraRendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  compress: false,
});
if (paraBaseUncompressed.toString('latin1').includes('3 Tr')) {
  console.log(
    '  FAIL  paragraph baseline: unexpected "3 Tr" found (should not be selectable)',
  );
  failures++;
}

// Title metadata must appear in the selectable paragraph PDF.
if (!paraSel.toString('latin1').includes('MT-23 Selectable Paragraph')) {
  console.log('  FAIL  paragraph: title metadata not found in PDF');
  failures++;
}

// ─── Summary printout ─────────────────────────────────────────────────────────

console.log('');
console.log(
  '  ┌─────────────────────────────────────────────────────────────────┐',
);
console.log(
  '  │  MT-23 selectable PDF sizes                                      │',
);
console.log(
  '  ├───────────────┬────────────┬────────────┬───────────────────────┤',
);
console.log(
  '  │ Output        │ Baseline   │ Selectable │ Overhead               │',
);
console.log(
  '  ├───────────────┼────────────┼────────────┼───────────────────────┤',
);

for (const { label, base, sel } of sizeChecks) {
  const bKb = (base.length / 1024).toFixed(1).padStart(7);
  const sKb = (sel.length / 1024).toFixed(1).padStart(7);
  const deltaKb = ((sel.length - base.length) / 1024).toFixed(1).padStart(6);
  const pct = (((sel.length - base.length) / base.length) * 100)
    .toFixed(1)
    .padStart(5);
  console.log(
    `  │ ${label.padEnd(13)} │ ${bKb} KB  │ ${sKb} KB  │ +${deltaKb} KB (+${pct}%)        │`,
  );
}

console.log(
  '  └───────────────┴────────────┴────────────┴───────────────────────┘',
);
console.log('');
console.log('  Manual review checklist:');
console.log(
  '    [ ] Open mt-23-selectable-paragraph.pdf — select and copy text',
);
console.log(
  '    [ ] Open mt-23-selectable-ligatures.pdf — copy "fi"/"fl"/"ffi" words',
);
console.log(
  '    [ ] Open mt-23-selectable-non-ascii.pdf — copy Turkish/French characters',
);
console.log(
  '    [ ] Open mt-23-selectable-document.pdf  — select across page boundaries',
);
console.log(
  '    [ ] Compare visual appearance: baseline vs selectable must look identical',
);
console.log(`\n  Compose time: ${paraMs.toFixed(1)}ms`);

// ─── Metrics ──────────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = paraOut.lines.map((l, idx) => ({
  idx,
  y: MARGIN_TOP + idx * 14,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-23',
  timestamp: new Date().toISOString(),
  perf: { composeMs: paraMs },
  lines: lineMetrics,
  summary: {
    lineCount: paraOut.lines.length,
    usedEmergency: paraOut.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    paragraphBaseBytes: paraBase.length,
    paragraphSelBytes: paraSel.length,
    ligaturesBaseBytes: ligBase.length,
    ligaturesSelBytes: ligSel.length,
    nonAsciiBaseBytes: nonAsciiBase.length,
    nonAsciiSelBytes: nonAsciiSel.length,
    documentBaseBytes: docBase.length,
    documentSelBytes: docSel.length,
    documentPageCount: renderedDoc.pages.length,
  },
};
writeJson('mt-23-selectable-pdf.metrics.json', metrics);

console.log(failures === 0 ? 'PASS' : `FAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
