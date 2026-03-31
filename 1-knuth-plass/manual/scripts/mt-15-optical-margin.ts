#!/usr/bin/env tsx
// manual/scripts/mt-15-optical-margin.ts
// MT-15 — Optical Margin Alignment (two-pass).
// Renders EN_BODY with and without OMA side-by-side.
// --compare flag: both in one SVG for visual diff.
//
// Run:
//   tsx manual/scripts/mt-15-optical-margin.ts
//   tsx manual/scripts/mt-15-optical-margin.ts --compare

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '../../src/paragraph.js';
import { createMeasurer } from '../../src/measure.js';
import { layoutParagraph, renderToSvg } from '../../src/render.js';
import { renderToPdf } from '../../src/pdf.js';
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
import { MARGIN_X, MARGIN_TOP, PAGE_W, PAGE_H } from '../fixtures/documents.js';

const COMPARE = process.argv.includes('--compare');
const LINE_W = 380; // narrower than full page to show OMA effect clearly
const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── Compose: without OMA ────────────────────────────────────────────────────

const t0 = performance.now();
const outNoOma = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: LINE_W,
  tolerance: 3,
  opticalMarginAlignment: false,
});
const msNoOma = performance.now() - t0;

// ─── Compose: with OMA ───────────────────────────────────────────────────────

const t1 = performance.now();
const outOma = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: LINE_W,
  tolerance: 3,
  opticalMarginAlignment: true,
});
const msOma = performance.now() - t1;

// ─── Metrics extraction ───────────────────────────────────────────────────────

const toLineMetrics = (
  lines: typeof outOma.lines,
  originY: number,
): LineMetrics[] =>
  lines.map((l, idx) => {
    const lineH = lines.slice(0, idx).reduce((s, ll) => s + ll.lineHeight, 0);
    return {
      idx,
      y: originY + lineH + l.baseline,
      ratio: l.ratio,
      hyphenated: l.hyphenated ?? false,
      xOffset: l.xOffset ?? 0,
      lineWidth: l.lineWidth,
      wordCount: l.wordRuns.length,
    };
  });

const noOmaLines = toLineMetrics(outNoOma.lines, MARGIN_TOP);
const omaLines = toLineMetrics(outOma.lines, MARGIN_TOP);

// ─── Spot-check: xOffset assertions ──────────────────────────────────────────
// Lines with trailing comma/period should have xOffset > 0 (right side protrusion).
// Lines with no special character should have xOffset = 0.

let xOffsetIssues = 0;
for (const l of omaLines) {
  // Check for unexpected negative offsets on non-leading-quote lines
  if (l.xOffset < -2) {
    console.log(
      `  WARN  line ${l.idx}: unusually large negative xOffset=${l.xOffset.toFixed(3)}`,
    );
    xOffsetIssues++;
  }
}

const linesWithNonZeroOffset = omaLines.filter(
  (l) => Math.abs(l.xOffset) > 0.01,
);
console.log(
  `\n  OMA: ${outOma.lines.length} lines, ${linesWithNonZeroOffset.length} with non-zero xOffset`,
);
console.log(`  No-OMA: ${outNoOma.lines.length} lines`);
console.log(
  `  Line count delta: ${outOma.lines.length - outNoOma.lines.length} (expected ≤ 0)`,
);
console.log(
  `  Ratio variance — OMA: ${ratioVariance(omaLines).toFixed(4)}  No-OMA: ${ratioVariance(noOmaLines).toFixed(4)}`,
);

// Show first few xOffsets
console.log('\n  First 10 line xOffsets (OMA):');
for (const l of omaLines.slice(0, 10)) {
  console.log(`    line ${l.idx}: xOffset=${l.xOffset.toFixed(3)}`);
}

// ─── SVG output ───────────────────────────────────────────────────────────────

if (COMPARE) {
  // Side-by-side: no-OMA at x=MARGIN_X, OMA at x=MARGIN_X+LINE_W+40
  const renderedNoOma = layoutParagraph(outNoOma.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const renderedOma = layoutParagraph(outOma.lines, measurer, {
    x: MARGIN_X + LINE_W + 40,
    y: MARGIN_TOP,
  });

  const svgW = MARGIN_X * 2 + LINE_W * 2 + 40;
  const svgH = PAGE_H;
  const svgA = renderToSvg(renderedNoOma, fontEngine, {
    width: svgW,
    height: svgH,
  });
  const svgB = renderToSvg(renderedOma, fontEngine, {
    width: svgW,
    height: svgH,
  });

  const innerA = svgA.replace(/<\/?svg[^>]*>/g, '').trim();
  const innerB = svgB.replace(/<\/?svg[^>]*>/g, '').trim();

  const combinedSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    `<rect width="${svgW}" height="${svgH}" fill="white"/>`,
    // Column guides
    `<line x1="${MARGIN_X}" y1="0" x2="${MARGIN_X}" y2="${svgH}" stroke="#e0e0e0" stroke-width="0.5"/>`,
    `<line x1="${MARGIN_X + LINE_W}" y1="0" x2="${MARGIN_X + LINE_W}" y2="${svgH}" stroke="#e0e0e0" stroke-width="0.5"/>`,
    `<line x1="${MARGIN_X + LINE_W + 40}" y1="0" x2="${MARGIN_X + LINE_W + 40}" y2="${svgH}" stroke="#e0e0e0" stroke-width="0.5"/>`,
    `<line x1="${MARGIN_X + LINE_W * 2 + 40}" y1="0" x2="${MARGIN_X + LINE_W * 2 + 40}" y2="${svgH}" stroke="#e0e0e0" stroke-width="0.5"/>`,
    // Labels
    `<text x="${MARGIN_X}" y="20" font-size="10" fill="#888">No OMA</text>`,
    `<text x="${MARGIN_X + LINE_W + 40}" y="20" font-size="10" fill="#888">With OMA</text>`,
    innerA,
    innerB,
    '</svg>',
  ].join('\n');

  writeSvg('mt-15-oma-compare.svg', combinedSvg);
} else {
  // Single column — OMA only
  const renderedOma = layoutParagraph(outOma.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const svgOma = renderToSvg(renderedOma, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writeSvg('mt-15-oma.svg', svgOma);
  const pdfOma = await renderToPdf(renderedOma, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writePdf('mt-15-oma.pdf', pdfOma);

  // Also render no-OMA for reference
  const renderedNoOma = layoutParagraph(outNoOma.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const svgNoOma = renderToSvg(renderedNoOma, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writeSvg('mt-15-no-oma.svg', svgNoOma);
}

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const metrics: TestMetrics = {
  test: 'MT-15',
  timestamp: new Date().toISOString(),
  perf: { composeMs: msOma },
  lines: omaLines,
  summary: {
    lineCount: outOma.lines.length,
    usedEmergency: outOma.usedEmergency,
    ratioVariance: ratioVariance(omaLines),
    maxRatio: Math.max(...omaLines.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...omaLines.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: omaLines.filter((l) => l.hyphenated).length,
  },
  extra: {
    noOmaLineCount: outNoOma.lines.length,
    noOmaComposeMs: msNoOma,
    linesWithNonZeroXOffset: linesWithNonZeroOffset.length,
    xOffsetIssues,
  },
};

writeJson('mt-15-oma.metrics.json', metrics);

const pass =
  outOma.lines.length <= outNoOma.lines.length && xOffsetIssues === 0;
console.log(pass ? '\nPASS' : '\nFAIL');
process.exit(pass ? 0 : 1);
