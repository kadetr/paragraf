#!/usr/bin/env tsx
// manual/scripts/mt-03-arabic.ts
// MT-03 — Arabic Paragraph.
// Checks: RTL detection, no hyphenation, no overflow.
//
// Run:  tsx manual/scripts/mt-03-arabic.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '../../src/paragraph.js';
import { createMeasurer } from '../../src/measure.js';
import { layoutParagraph, renderToSvg } from '../../src/render.js';
import { renderToPdf } from '../../src/pdf.js';
import { arabicRegistry, F12AR } from '../fixtures/fonts.js';
import { AR_PARAGRAPH } from '../fixtures/text.js';
import {
  writeSvg,
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
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

const registry = arabicRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── Compose ──────────────────────────────────────────────────────────────────

const t0 = performance.now();
const out = composer.compose({
  text: AR_PARAGRAPH,
  font: F12AR,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const ms = performance.now() - t0;

// ─── Checks ───────────────────────────────────────────────────────────────────

let failures = 0;

for (const [li, line] of out.lines.entries()) {
  if (line.direction !== 'rtl') {
    console.log(
      `  FAIL  line ${li}: direction='${line.direction}', expected 'rtl'`,
    );
    failures++;
  }
  if (line.hyphenated) {
    console.log(`  FAIL  line ${li}: hyphenated=true in Arabic paragraph`);
    failures++;
  }
}

const rendered = layoutParagraph(out.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});

// Check no line exceeds column width (with 1pt tolerance)
for (const [li, rl] of rendered.entries()) {
  const maxX = Math.max(
    ...rl.segments.map((s) => s.x + measurer.measure(s.text, s.font)),
  );
  const minX = Math.min(...rl.segments.map((s) => s.x));
  const usedWidth = maxX - minX;
  if (usedWidth > CONTENT_W + 1) {
    console.log(
      `  FAIL  line ${li} overflow: usedWidth=${usedWidth.toFixed(2)} > lineWidth=${CONTENT_W}`,
    );
    failures++;
  }
}

// Check RTL x-ordering: first segment should be to the right of the last segment
{
  let ok = true;
  for (const [li, rl] of rendered.entries()) {
    if (rl.segments.length < 2) continue;
    const firstX = rl.segments[0].x;
    const lastX = rl.segments[rl.segments.length - 1].x;
    if (firstX <= lastX) {
      console.log(
        `  FAIL  line ${li}: RTL x-ordering broken (first x=${firstX.toFixed(2)} ≤ last x=${lastX.toFixed(2)})`,
      );
      failures++;
      ok = false;
    }
  }
  if (ok) console.log(`  PASS  RTL x-ordering correct across all lines`);
}

// Check column bounds: no segment outside [MARGIN_X, MARGIN_X + CONTENT_W]
{
  const rightEdge = MARGIN_X + CONTENT_W;
  let ok = true;
  for (const [li, rl] of rendered.entries()) {
    for (const seg of rl.segments) {
      const w = measurer.measure(seg.text, seg.font);
      if (seg.x < MARGIN_X - 1 || seg.x + w > rightEdge + 1) {
        console.log(
          `  FAIL  line ${li}: segment out of column bounds x=${seg.x.toFixed(2)} w=${w.toFixed(2)} rightEdge=${rightEdge}`,
        );
        failures++;
        ok = false;
      }
    }
  }
  if (ok) console.log(`  PASS  all segments within column bounds`);
}

// Check baseline consistency: no unexpected vertical offsets in plain Arabic text
{
  let ok = true;
  for (const [li, rl] of rendered.entries()) {
    for (const seg of rl.segments) {
      if (Math.abs(seg.y - rl.baseline) > 0.01) {
        console.log(
          `  FAIL  line ${li}: segment y=${seg.y.toFixed(2)} ≠ baseline=${rl.baseline.toFixed(2)}`,
        );
        failures++;
        ok = false;
      }
    }
  }
  if (ok) console.log(`  PASS  all segments aligned to their line baseline`);
}

// Check no zero-width segments (shaping failure indicator)
{
  let ok = true;
  for (const [li, rl] of rendered.entries()) {
    for (const seg of rl.segments) {
      if (measurer.measure(seg.text, seg.font) <= 0) {
        console.log(
          `  FAIL  line ${li}: zero-width segment "${seg.text}" — possible shaping failure`,
        );
        failures++;
        ok = false;
      }
    }
  }
  if (ok) console.log(`  PASS  no zero-width segments detected`);
}

console.log(`\n  ${out.lines.length} lines composed in ${ms.toFixed(1)}ms`);
console.log(`  All RTL: ${out.lines.every((l) => l.direction === 'rtl')}`);

// ─── SVG ──────────────────────────────────────────────────────────────────────
const svg = renderToSvg(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writeSvg('mt-03-arabic.svg', svg);
const pdf = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writePdf('mt-03-arabic.pdf', pdf);

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = out.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: l.xOffset ?? 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-03',
  timestamp: new Date().toISOString(),
  perf: { composeMs: ms },
  lines: lineMetrics,
  summary: {
    lineCount: out.lines.length,
    usedEmergency: out.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: 0,
  },
  extra: { direction: 'rtl' },
};

writeJson('mt-03-arabic.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
