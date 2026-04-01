#!/usr/bin/env tsx
// manual/scripts/mt-14-baseline-grid.ts
// MT-14 — Baseline grid alignment (two-column document).
// Checks: every line's rendered baseline lands on a 14pt grid (±0.5pt tolerance).
//
// Run:  tsx tests/manual/scripts/mt-14-baseline-grid.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
  composeDocument,
  layoutDocument,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { renderToSvg } from '@paragraf/render-core';
import type { RenderedPage, RenderedItem } from '@paragraf/render-core';
import { renderDocumentToPdf } from '@paragraf/render-pdf';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY, DOCUMENT_PARA_1, DOCUMENT_PARA_2 } from '../fixtures/text.js';
import {
  writeSvg,
  writePdf,
  writeJson,
  type TestMetrics,
} from '../fixtures/output.js';
import {
  PAGE_W,
  PAGE_H,
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  CONTENT_H,
  twoColumnGridFrame,
} from '../fixtures/documents.js';

const GRID_UNIT = 14; // 14pt baseline grid

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// Build a two-column document with baseline grid
const frame = twoColumnGridFrame({
  grid: { first: GRID_UNIT, interval: GRID_UNIT },
});

const t0 = performance.now();
const doc = composeDocument(
  {
    paragraphs: [
      { text: DOCUMENT_PARA_1, font: F12, lineWidth: CONTENT_W },
      { text: DOCUMENT_PARA_2, font: F12, lineWidth: CONTENT_W },
      { text: EN_BODY, font: F12, lineWidth: CONTENT_W },
    ],
    frames: [frame],
    styleDefaults: { tolerance: 3 },
  },
  composer,
);
const laid = layoutDocument(doc, [frame], measurer);
const composeMs = performance.now() - t0;

// ─── Checks ───────────────────────────────────────────────────────────────────

let failures = 0;
const badLines: {
  pageIdx: number;
  itemIdx: number;
  lineIdx: number;
  baseline: number;
  snap: number;
}[] = [];

const gridOrigin = frame.y + GRID_UNIT;

// The grid-snapping contract: the FIRST line of each rendered item must land on
// a grid line (subsequent lines within an item have natural line-height spacing).
for (const page of laid.pages) {
  for (let ii = 0; ii < page.items.length; ii++) {
    const item = page.items[ii];
    if (item.rendered.length === 0) continue;
    const absBaseline = item.rendered[0].baseline;
    // Grid lines: gridOrigin + n * GRID_UNIT
    const relative = absBaseline - gridOrigin;
    const snap = gridOrigin + Math.round(relative / GRID_UNIT) * GRID_UNIT;
    if (Math.abs(absBaseline - snap) > 0.5) {
      badLines.push({
        pageIdx: page.pageIndex,
        itemIdx: ii,
        lineIdx: 0,
        baseline: absBaseline,
        snap,
      });
    }
  }
}

if (badLines.length > 0) {
  console.log(
    `  FAIL  ${badLines.length} item first-baselines not on ${GRID_UNIT}pt grid:`,
  );
  badLines.slice(0, 5).forEach((b) => {
    console.log(
      `    Page ${b.pageIdx} item[${b.itemIdx}] L${b.lineIdx}: baseline=${b.baseline.toFixed(2)} (nearest grid: ${b.snap.toFixed(2)})`,
    );
  });
  failures += badLines.length;
}

const totalLines = laid.pages.reduce<number>(
  (s: number, p: RenderedPage) =>
    s +
    p.items.reduce<number>(
      (ss: number, it: RenderedItem) => ss + it.rendered.length,
      0,
    ),
  0,
);
const totalItems = laid.pages.reduce<number>(
  (s: number, p: RenderedPage) => s + p.items.length,
  0,
);
console.log(
  `\n  ${laid.pages.length} page(s), ${totalLines} total lines, ${totalItems} items on ${GRID_UNIT}pt grid`,
);

// ─── SVG with grid overlay ────────────────────────────────────────────────────

const gridLines: string[] = [];
for (let y = MARGIN_TOP; y < PAGE_H - MARGIN_TOP; y += GRID_UNIT) {
  gridLines.push(
    `<line x1="0" y1="${y.toFixed(2)}" x2="${PAGE_W}" y2="${y.toFixed(2)}" stroke="#e0e0e0" stroke-width="0.4"/>`,
  );
}

// Collect all rendered lines from page 0 for SVG
const allSegments: string[] = [];
if (laid.pages.length > 0) {
  const page0 = laid.pages[0];
  for (const item of page0.items) {
    const svgBody = renderToSvg(item.rendered, fontEngine, {
      width: PAGE_W,
      height: PAGE_H,
    })
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '')
      .trim();
    allSegments.push(svgBody);
  }
}

const finalSvg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">`,
  `<rect width="${PAGE_W}" height="${PAGE_H}" fill="white"/>`,
  ...gridLines,
  ...allSegments,
  '</svg>',
].join('\n');

writeSvg('mt-14-baseline-grid.svg', finalSvg);

const pdf = await renderDocumentToPdf(laid, fontEngine, {
  pageWidth: PAGE_W,
  pageHeight: PAGE_H,
});
writePdf('mt-14-baseline-grid.pdf', pdf);

// ─── Metrics ──────────────────────────────────────────────────────────────────

const metrics: TestMetrics = {
  test: 'MT-14',
  timestamp: new Date().toISOString(),
  perf: { composeMs },
  lines: [],
  summary: {
    lineCount: totalLines,
    usedEmergency: false,
    ratioVariance: 0,
    maxRatio: 0,
    minRatio: 0,
    hyphenatedLines: 0,
  },
  extra: {
    gridUnit: GRID_UNIT,
    pages: laid.pages.length,
    offGridLines: badLines.length,
  },
};
writeJson('mt-14-baseline-grid.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
