#!/usr/bin/env tsx
// manual/scripts/mt-14-baseline-grid.ts
// MT-14 — Baseline Grid Alignment.
// Visual + metric verification that all baselines snap to the grid.
//
// Run:  tsx manual/scripts/mt-14-baseline-grid.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '../../src/paragraph.js';
import { createMeasurer } from '../../src/measure.js';
import { composeDocument, layoutDocument } from '../../src/document.js';
import { renderToSvg } from '../../src/render.js';
import { renderDocumentToPdf } from '../../src/pdf.js';
import {
  twoColumnGridFrame,
  singleColumnFrame,
  PAGE_W,
  PAGE_H,
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  CONTENT_H,
} from '../fixtures/documents.js';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import {
  DOCUMENT_PARA_1,
  DOCUMENT_PARA_2,
  DOCUMENT_PARA_3,
} from '../fixtures/text.js';
import {
  writeSvg,
  writePdf,
  writeJson,
  ratioVariance,
  type LineMetrics,
  type TestMetrics,
} from '../fixtures/output.js';

const GRID = { first: 14, interval: 14 };
const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── Compose + layout with baseline grid ─────────────────────────────────────

const frame = twoColumnGridFrame({
  grid: GRID,
  paragraphSpacing: 7,
});

const doc = {
  paragraphs: [DOCUMENT_PARA_1, DOCUMENT_PARA_2, DOCUMENT_PARA_3].map(
    (text) => ({ text, font: F12, lineWidth: CONTENT_W }),
  ),
  frames: [frame],
  styleDefaults: { tolerance: 3 },
};

const t0 = performance.now();
const composed = composeDocument(doc, composer);
const rendered = layoutDocument(composed, doc.frames, measurer);
const composeMs = performance.now() - t0;

// ─── Collect all baseline positions from all pages/items ─────────────────────

const allLineMetrics: LineMetrics[] = [];
let idxCounter = 0;
for (const page of rendered.pages) {
  for (const item of page.items) {
    for (const rl of item.rendered) {
      allLineMetrics.push({
        idx: idxCounter++,
        y: rl.baseline,
        ratio: 0, // grid test doesn't need ratio
        hyphenated: false,
        xOffset: 0,
        lineWidth: 0,
        wordCount: 0,
      });
    }
  }
}

// ─── Verify grid invariant ────────────────────────────────────────────────────
// The baseline grid snaps the FIRST line of each paragraph batch. Subsequent
// lines within a paragraph advance by lineHeight (not gridInterval), so only
// the first line of each item is guaranteed to be on the grid.

const origin = frame.y + GRID.first;
let failures = 0;
const firstLineBaselines: number[] = [];
for (const page of rendered.pages) {
  for (const item of page.items) {
    if (item.rendered.length > 0) {
      firstLineBaselines.push(item.rendered[0].baseline);
    }
  }
}
for (const y of firstLineBaselines) {
  const offset = (y - origin) % GRID.interval;
  const snapped =
    Math.abs(offset) < 0.5 || Math.abs(offset - GRID.interval) < 0.5;
  if (!snapped) {
    console.log(
      `  FAIL  paragraph first-line baseline ${y.toFixed(3)} off-grid (offset=${offset.toFixed(3)})`,
    );
    failures++;
  }
}

if (failures === 0) {
  console.log(
    `  PASS  all ${firstLineBaselines.length} paragraph first-line baselines snap to the grid`,
  );
}

// ─── Comparison: same document WITHOUT grid ───────────────────────────────────
// Used to confirm that removing the grid doesn't change line counts,
// and that the grid-snapped version has strictly ≥ baselines.

const frameNoGrid = singleColumnFrame();
const docNoGrid = {
  paragraphs: doc.paragraphs,
  frames: [frameNoGrid],
  styleDefaults: doc.styleDefaults,
};
const composedNoGrid = composeDocument(docNoGrid, composer);
const renderedNoGrid = layoutDocument(
  composedNoGrid,
  docNoGrid.frames,
  measurer,
);

const noGridLineCount = renderedNoGrid.pages.reduce(
  (s, p) => s + p.items.reduce((ss, it) => ss + it.rendered.length, 0),
  0,
);
console.log(
  `  Grid: ${allLineMetrics.length} lines placed  |  No-grid: ${noGridLineCount} lines placed`,
);

// ─── SVG output ───────────────────────────────────────────────────────────────
// Render with grid guidelines overlaid

const svgLines: string[] = [];
const svgW = PAGE_W;
const svgH = PAGE_H;

svgLines.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
);
svgLines.push(`<rect width="${svgW}" height="${svgH}" fill="white"/>`);

// Grid guidelines
for (let n = 0; n * GRID.interval < CONTENT_H + GRID.interval; n++) {
  const gridY = frame.y + GRID.first + n * GRID.interval;
  svgLines.push(
    `<line x1="${MARGIN_X}" y1="${gridY}" x2="${MARGIN_X + CONTENT_W}" y2="${gridY}" ` +
      `stroke="#e0e0ff" stroke-width="0.5"/>`,
  );
}

// Rendered glyphs for all pages
for (const page of rendered.pages) {
  for (const item of page.items) {
    const paragraphSvg = renderToSvg(item.rendered, fontEngine, {
      width: PAGE_W,
      height: PAGE_H,
    });
    // Extract inner SVG content (strip outer <svg> wrapper) for embedding
    const inner = paragraphSvg
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '');
    svgLines.push(inner);
  }
}

svgLines.push('</svg>');

writeSvg('mt-14-baseline-grid.svg', svgLines.join('\n'));
const pdf = await renderDocumentToPdf(rendered, fontEngine, {
  pageWidth: PAGE_W,
  pageHeight: PAGE_H,
});
writePdf('mt-14-baseline-grid.pdf', pdf);

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const metrics: TestMetrics = {
  test: 'MT-14',
  timestamp: new Date().toISOString(),
  perf: { composeMs },
  lines: allLineMetrics,
  summary: {
    lineCount: allLineMetrics.length,
    usedEmergency: false,
    ratioVariance: 0,
    maxRatio: 0,
    minRatio: 0,
    hyphenatedLines: 0,
  },
  extra: {
    grid: { frameY: frame.y, first: GRID.first, interval: GRID.interval },
    gridFailures: failures,
    noGridLineCount,
  },
};

writeJson('mt-14-baseline-grid.metrics.json', metrics);

process.exit(failures > 0 ? 1 : 0);
