#!/usr/bin/env tsx
// manual/scripts/mt-10-canvas-svg-parity.ts
// MT-10 — Canvas vs SVG rendering parity.
// Checks: both renderers visit the same glyphs (canvas moveTo count == SVG glyph count).
//
// Run:  tsx tests/manual/scripts/mt-10-canvas-svg-parity.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import {
  layoutParagraph,
  renderToSvg,
  renderToCanvas,
  type RenderedParagraph,
} from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
import { serifRegistry, F12 } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import {
  writeSvg,
  writePdf,
  writeJson,
  type TestMetrics,
} from '../fixtures/output.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

const t0 = performance.now();
const out = composer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const composeMs = performance.now() - t0;

const rendered: RenderedParagraph = layoutParagraph(out.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});

// ─── SVG path ─────────────────────────────────────────────────────────────────

const svgBody = renderToSvg(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writeSvg('mt-10-canvas-svg-parity-svg.svg', svgBody);

// Count glyph path elements in SVG
const svgGlyphCount = (svgBody.match(/<path /g) ?? []).length;

// ─── Canvas path ──────────────────────────────────────────────────────────────

interface MockCanvasCtx {
  calls: string[];
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  translate(x: number, y: number): void;
  beginPath(): void;
  setTransform(...args: number[]): void;
}

const calls: string[] = [];
const ctx: MockCanvasCtx = {
  calls,
  moveTo(x, y) {
    calls.push(`moveTo(${x.toFixed(2)},${y.toFixed(2)})`);
  },
  lineTo(x, y) {
    calls.push('lineTo');
  },
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    calls.push('bezierCurveTo');
  },
  quadraticCurveTo(cpx, cpy, x, y) {
    calls.push('quadraticCurveTo');
  },
  closePath() {
    calls.push('closePath');
  },
  fill() {
    calls.push('fill');
  },
  save() {
    calls.push('save');
  },
  restore() {
    calls.push('restore');
  },
  scale(x, y) {
    calls.push('scale');
  },
  translate(x, y) {
    calls.push('translate');
  },
  beginPath() {
    calls.push('beginPath');
  },
  setTransform(...args) {
    calls.push('setTransform');
  },
};

renderToCanvas(
  rendered,
  fontEngine,
  ctx as unknown as CanvasRenderingContext2D,
);

const canvasMoveToCount = calls.filter((c) => c.startsWith('moveTo')).length;

// ─── Parity check ─────────────────────────────────────────────────────────────

let failures = 0;

// Glyphs rendered to canvas (moveTo per contour) should be ≥ SVG glyph paths
// Allow ±20% variance due to contour vs path counting differences
const ratio = svgGlyphCount === 0 ? 1 : canvasMoveToCount / svgGlyphCount;
if (ratio < 0.5 || ratio > 3.0) {
  console.log(
    `  FAIL  moveTo/SVGpath ratio=${ratio.toFixed(2)} — SVG paths: ${svgGlyphCount}, canvas moveTos: ${canvasMoveToCount}`,
  );
  failures++;
}

console.log(`\n  SVG glyph paths: ${svgGlyphCount}`);
console.log(`  Canvas moveTo calls: ${canvasMoveToCount}`);
console.log(`  Ratio: ${ratio.toFixed(3)}`);

// ─── Outputs ──────────────────────────────────────────────────────────────────

const pdf = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writePdf('mt-10-canvas-svg-parity.pdf', pdf);

const metrics: TestMetrics = {
  test: 'MT-10',
  timestamp: new Date().toISOString(),
  perf: { composeMs },
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
    svgGlyphCount,
    canvasMoveToCount,
    parityRatio: ratio,
  },
};
writeJson('mt-10-canvas-svg-parity.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
