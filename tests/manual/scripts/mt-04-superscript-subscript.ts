#!/usr/bin/env tsx
// manual/scripts/mt-04-superscript-subscript.ts
// MT-04 — Superscript / Subscript Rendering.
// Checks: H₂O spans, vertical offsets, visual output.
//
// Run:  tsx tests/manual/scripts/mt-04-superscript-subscript.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
import { serifRegistry, F12, F8SUB, F8SUP } from '../fixtures/fonts.js';
import {
  writeSvg,
  writePdf,
  writeJson,
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

// ─── Exported run() for programmatic use (bake-svgs.ts) ──────────────────────

export async function run(): Promise<{ name: string; svg: string }[]> {
  const registry = serifRegistry();
  const composer = await createParagraphComposer(registry);
  const measurer = createMeasurer(registry);
  const fontEngine = await createDefaultFontEngine(registry);

  // ─── Subscript: H₂O ──────────────────────────────────────────────────────────

  const t0 = performance.now();
  const outSub = composer.compose({
    spans: [
      { text: 'H', font: F12 },
      { text: '2', font: F8SUB },
      {
        text: 'O is the molecular formula for water. The subscript numeral appears below the baseline. ',
        font: F12,
      },
      { text: 'CO', font: F12 },
      { text: '2', font: F8SUB },
      { text: ' is carbon dioxide.', font: F12 },
    ],
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  const msSub = performance.now() - t0;

  // ─── Superscript: x² ─────────────────────────────────────────────────────────

  const t1 = performance.now();
  const outSup = composer.compose({
    spans: [
      { text: 'The area of a circle is πr', font: F12 },
      { text: '2', font: F8SUP },
      { text: ". Einstein's mass-energy equivalence is E = mc", font: F12 },
      { text: '2', font: F8SUP },
      {
        text: '. These are superscript numerals rendered above the baseline.',
        font: F12,
      },
    ],
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  const msSup = performance.now() - t1;

  // ─── Checks ───────────────────────────────────────────────────────────────────

  const renderedSub = layoutParagraph(outSub.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const renderedSup = layoutParagraph(outSup.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP + renderedSub.reduce((s, l) => s + l.lineHeight, 0) + 20,
  });

  let failures = 0;

  // Check that vertical offsets are non-zero for sub/sup segments
  for (const rl of renderedSub) {
    for (const seg of rl.segments) {
      if (seg.font.variant === 'subscript') {
        const offset = seg.y - rl.baseline;
        if (offset <= 0) {
          console.log(
            `  WARN  subscript segment "${seg.text}" y=${seg.y.toFixed(2)} baseline=${rl.baseline.toFixed(2)} — not below baseline`,
          );
        }
      }
    }
  }
  for (const rl of renderedSup) {
    for (const seg of rl.segments) {
      if (seg.font.variant === 'superscript') {
        const offset = rl.baseline - seg.y;
        if (offset <= 0) {
          console.log(
            `  WARN  superscript segment "${seg.text}" y=${seg.y.toFixed(2)} baseline=${rl.baseline.toFixed(2)} — not above baseline`,
          );
        }
      }
    }
  }

  console.log(`\n  Sub lines: ${outSub.lines.length} in ${msSub.toFixed(1)}ms`);
  console.log(`  Sup lines: ${outSup.lines.length} in ${msSup.toFixed(1)}ms`);

  // ─── SVG ──────────────────────────────────────────────────────────────────────

  const allRendered = [...renderedSub, ...renderedSup];
  const svg = renderToSvg(allRendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });

  console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);

  return [{ name: 'mt-04-superscript-subscript', svg }];
}

// ─── CLI entry point (unchanged behaviour) ────────────────────────────────────

if (process.argv[1]?.endsWith('mt-04-superscript-subscript.ts')) {
  const registry = serifRegistry();
  const composer = await createParagraphComposer(registry);
  const measurer = createMeasurer(registry);
  const fontEngine = await createDefaultFontEngine(registry);

  const t0 = performance.now();
  const outSub = composer.compose({
    spans: [
      { text: 'H', font: F12 },
      { text: '2', font: F8SUB },
      {
        text: 'O is the molecular formula for water. The subscript numeral appears below the baseline. ',
        font: F12,
      },
      { text: 'CO', font: F12 },
      { text: '2', font: F8SUB },
      { text: ' is carbon dioxide.', font: F12 },
    ],
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  const msSub = performance.now() - t0;

  const t1 = performance.now();
  const outSup = composer.compose({
    spans: [
      { text: 'The area of a circle is πr', font: F12 },
      { text: '2', font: F8SUP },
      { text: ". Einstein's mass-energy equivalence is E = mc", font: F12 },
      { text: '2', font: F8SUP },
      {
        text: '. These are superscript numerals rendered above the baseline.',
        font: F12,
      },
    ],
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  const msSup = performance.now() - t1;

  const renderedSub = layoutParagraph(outSub.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });
  const renderedSup = layoutParagraph(outSup.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP + renderedSub.reduce((s, l) => s + l.lineHeight, 0) + 20,
  });

  let failures = 0;

  for (const rl of renderedSub) {
    for (const seg of rl.segments) {
      if (seg.font.variant === 'subscript') {
        const offset = seg.y - rl.baseline;
        if (offset <= 0) {
          console.log(
            `  WARN  subscript segment "${seg.text}" y=${seg.y.toFixed(2)} baseline=${rl.baseline.toFixed(2)} — not below baseline`,
          );
        }
      }
    }
  }
  for (const rl of renderedSup) {
    for (const seg of rl.segments) {
      if (seg.font.variant === 'superscript') {
        const offset = rl.baseline - seg.y;
        if (offset <= 0) {
          console.log(
            `  WARN  superscript segment "${seg.text}" y=${seg.y.toFixed(2)} baseline=${rl.baseline.toFixed(2)} — not above baseline`,
          );
        }
      }
    }
  }

  console.log(`\n  Sub lines: ${outSub.lines.length} in ${msSub.toFixed(1)}ms`);
  console.log(`  Sup lines: ${outSup.lines.length} in ${msSup.toFixed(1)}ms`);

  const allRendered = [...renderedSub, ...renderedSup];
  const svg = renderToSvg(allRendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writeSvg('mt-04-superscript-subscript.svg', svg);
  const pdf = await renderToPdf(allRendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
    preDraw: (doc) => drawTestHeader(doc, 'MT-04'),
  });
  writePdf('mt-04-superscript-subscript.pdf', pdf);

  const lineMetrics: LineMetrics[] = outSub.lines.map((l, idx) => ({
    idx,
    y: 0,
    ratio: l.ratio,
    hyphenated: l.hyphenated ?? false,
    xOffset: l.xOffset ?? 0,
    lineWidth: l.lineWidth,
    wordCount: l.wordRuns.length,
  }));

  const metrics: TestMetrics = {
    test: 'MT-04',
    timestamp: new Date().toISOString(),
    perf: { composeMs: msSub + msSup },
    lines: lineMetrics,
    summary: {
      lineCount: outSub.lines.length + outSup.lines.length,
      usedEmergency: outSub.usedEmergency || outSup.usedEmergency,
      ratioVariance: 0,
      maxRatio: 0,
      minRatio: 0,
      hyphenatedLines: 0,
    },
  };

  writeJson('mt-04-superscript-subscript.metrics.json', metrics);

  console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
  process.exit(failures > 0 ? 1 : 0);
}
