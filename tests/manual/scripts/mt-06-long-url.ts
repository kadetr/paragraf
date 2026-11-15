#!/usr/bin/env tsx
// manual/scripts/mt-06-long-url.ts
// MT-06 — Long URL / No-Break Word.
// Tests: a paragraph that cannot be set within tolerance (overfull fallback),
// the emergency-stretch fix, and a URL wider than the column (overfull line).
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

// ─── A URL wider than the column ──────────────────────────────────────────────
// No setting can make this fit: the line holding the URL sticks out and is
// marked overfull.

const WIDE_URL =
  'https://example.com/a/very/long/path/that/cannot/be/hyphenated/index.html';
const outWide = composer.compose({
  text: `The report is published at ${WIDE_URL} and is updated every week.`,
  font: F12,
  lineWidth: LINE_W,
  tolerance: 2,
});
const overfullLines = outWide.lines
  .map((l, idx) => ({ idx, text: l.words.join(' '), overflow: l.overflow }))
  .filter((_, idx) => outWide.lines[idx].overfull);

// ─── Checks ───────────────────────────────────────────────────────────────────

if (noEmergencyThrew) {
  console.log(
    '\n  No-emergency: THREW (line too long for tolerance — expected)',
  );
} else {
  console.log(
    `\n  No-emergency: ${outNoEmerg!.lines.length} lines, usedEmergency=${outNoEmerg!.usedEmergency}, usedFallback=${outNoEmerg!.usedFallback}`,
  );
}
console.log(
  `  Wide URL:     ${outWide.lines.length} lines, usedFallback=${outWide.usedFallback}, overfull lines=${overfullLines.length}`,
);
for (const l of overfullLines) {
  console.log(
    `    line ${l.idx}: ${l.overflow!.toFixed(1)}pt too wide — "${l.text}"`,
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

// The same paragraph without emergency stretch (set by the fallback), and the
// paragraph with the URL wider than the column.
const extraOutputs: [string, typeof outEmerg | null, string][] = [
  ['mt-06-long-url-fallback', outNoEmerg, 'MT-06 fallback'],
  ['mt-06-long-url-overfull', outWide, 'MT-06 overfull'],
];
for (const [name, out, label] of extraOutputs) {
  if (!out) continue;
  const r = layoutParagraph(out.lines, measurer, { x: MARGIN_X, y: MARGIN_TOP });
  writeSvg(
    `${name}.svg`,
    renderToSvg(r, fontEngine, { width: PAGE_W, height: PAGE_H }),
  );
  writePdf(
    `${name}.pdf`,
    await renderToPdf(r, fontEngine, {
      width: PAGE_W,
      height: PAGE_H,
      preDraw: (doc) => drawTestHeader(doc, label),
    }),
  );
}

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
    noEmergencyUsedFallback: outNoEmerg?.usedFallback ?? null,
    wideUrlUsedFallback: outWide.usedFallback,
    wideUrlOverfullLines: overfullLines,
  },
};

writeJson('mt-06-long-url.metrics.json', metrics);

// Pass: nothing threw, emergency stretch rescued the first paragraph, and the
// wide URL is reported as exactly one overfull line.
const ok =
  !noEmergencyThrew &&
  outEmerg.usedEmergency &&
  !outEmerg.usedFallback &&
  overfullLines.length === 1 &&
  overfullLines[0].text === WIDE_URL;
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
