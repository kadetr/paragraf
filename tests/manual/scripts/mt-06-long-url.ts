#!/usr/bin/env tsx
// manual/scripts/mt-06-long-url.ts
// MT-06 — Long URL / No-Break Word.
// Tests: overflow with default tolerance, emergency stretch fix.
//
// Run:  tsx tests/manual/scripts/mt-06-long-url.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
// MT-06 uses its own corpus to ensure the URL is long relative to the column width
// but still short enough that emergencyStretch can rescue it.
const MT06_TEXT =
  'Optical margin alignment makes the text block appear flush. ' +
  'A long URL like https://example.com/path?q=1 causes overflow in a ' +
  'narrow column unless emergency stretch is enabled.';
import {
  writeSvg,
  writePdf,
  writeJson,
  ratioVariance,
  type LineMetrics,
  type TestMetrics,
} from '../fixtures/output.js';
import { drawTestHeader } from '../fixtures/header.js';
import { MARGIN_X, MARGIN_TOP, PAGE_W, PAGE_H } from '../fixtures/documents.js';

const LINE_W = 200; // narrow column to force URL overflow
const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── Without emergency stretch ────────────────────────────────────────────────

const t0 = performance.now();
let outNoEmerg: ReturnType<typeof composer.compose> | null = null;
let noEmergencyThrew = false;
try {
  outNoEmerg = composer.compose({
    text: MT06_TEXT,
    font: F12,
    lineWidth: LINE_W,
    tolerance: 2,
    emergencyStretch: 0,
  });
} catch {
  noEmergencyThrew = true;
}
const msNoEmerg = performance.now() - t0;

// ─── With emergency stretch ───────────────────────────────────────────────────

const t1 = performance.now();
const outEmerg = composer.compose({
  text: MT06_TEXT,
  font: F12,
  lineWidth: LINE_W,
  tolerance: 2,
  emergencyStretch: 50,
});
const msEmerg = performance.now() - t1;

// ─── Checks ───────────────────────────────────────────────────────────────────

if (noEmergencyThrew) {
  console.log(
    '\n  No-emergency: THREW (line too long for tolerance — expected)',
  );
} else {
  console.log(
    `\n  No-emergency: ${outNoEmerg!.lines.length} lines, usedEmergency=${outNoEmerg!.usedEmergency}`,
  );
}
console.log(
  `  Emergency:    ${outEmerg.lines.length} lines, usedEmergency=${outEmerg.usedEmergency}`,
);

const maxRatioEmerg = Math.max(...outEmerg.lines.map((l) => Math.abs(l.ratio)));
const maxRatioNoEmerg = outNoEmerg
  ? Math.max(...outNoEmerg.lines.map((l) => Math.abs(l.ratio)))
  : null;
if (maxRatioNoEmerg !== null) {
  console.log(
    `  Max ratio — no-emergency: ${maxRatioNoEmerg.toFixed(4)}  emergency: ${maxRatioEmerg.toFixed(4)}`,
  );
} else {
  console.log(`  Max ratio — emergency: ${maxRatioEmerg.toFixed(4)}`);
}

// ─── SVG ──────────────────────────────────────────────────────────────────────

const rendered = layoutParagraph(outEmerg.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const svg = renderToSvg(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writeSvg('mt-06-long-url.svg', svg);
const pdf = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  preDraw: (doc) => drawTestHeader(doc, 'MT-06'),
});
writePdf('mt-06-long-url.pdf', pdf);

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = outEmerg.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-06',
  timestamp: new Date().toISOString(),
  perf: { composeMs: msEmerg },
  lines: lineMetrics,
  summary: {
    lineCount: outEmerg.lines.length,
    usedEmergency: outEmerg.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: maxRatioEmerg,
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    noEmergencyThrew,
    noEmergencyMaxRatio: maxRatioNoEmerg,
    noEmergencyUsedEmergency: outNoEmerg?.usedEmergency ?? null,
  },
};

writeJson('mt-06-long-url.metrics.json', metrics);

// Pass: emergency stretch produced a result without crash
console.log('\nPASS');
process.exit(0);
