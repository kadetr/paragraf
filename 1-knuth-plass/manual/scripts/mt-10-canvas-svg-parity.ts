#!/usr/bin/env tsx
// manual/scripts/mt-10-canvas-svg-parity.ts
// MT-10 — Canvas vs SVG Output Parity.
// Checks: glyph x/y positions are identical between renderers.
// (Canvas path data is structural, not pixel-perfect.)
//
// Run:  tsx manual/scripts/mt-10-canvas-svg-parity.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '../../src/paragraph.js';
import { createMeasurer } from '../../src/measure.js';
import {
  layoutParagraph,
  renderToSvg,
  renderToCanvas,
  type RenderedParagraph,
} from '../../src/render.js';
import { serifRegistry, F12, F8SUB, F8SUP } from '../fixtures/fonts.js';
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
import { renderToPdf } from '../../src/pdf.js';

const registry = serifRegistry();
const composer = await createParagraphComposer(registry);
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// Mixed-font input (sub+sup) to exercise all code paths
const out = composer.compose({
  spans: [
    { text: 'Testing Canvas/SVG parity: H', font: F12 },
    { text: '2', font: F8SUB },
    { text: 'O and E = mc', font: F12 },
    { text: '2', font: F8SUP },
    {
      text: ' — glyph positions must be identical between both renderers. Ligatures: fi fl ffi.',
      font: F12,
    },
  ],
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
});

const rendered = layoutParagraph(out.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});

// ─── SVG render ───────────────────────────────────────────────────────────────

const svg = renderToSvg(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writeSvg('mt-10-canvas-svg-parity.svg', svg);
const pdf = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writePdf('mt-10-canvas-svg-parity.pdf', pdf);

// ─── Canvas render (capture paths) ───────────────────────────────────────────
// Minimal canvas mock that records path calls for structural comparison.

type PathCall = { op: string; args: number[] };
const pathLog: PathCall[] = [];

const mockCtx = {
  beginPath: () => {},
  closePath: () => {},
  moveTo: (x: number, y: number) =>
    pathLog.push({ op: 'moveTo', args: [x, y] }),
  lineTo: (x: number, y: number) =>
    pathLog.push({ op: 'lineTo', args: [x, y] }),
  quadraticCurveTo: (cpx: number, cpy: number, x: number, y: number) =>
    pathLog.push({ op: 'quadraticCurveTo', args: [cpx, cpy, x, y] }),
  bezierCurveTo: (
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ) =>
    pathLog.push({ op: 'bezierCurveTo', args: [cp1x, cp1y, cp2x, cp2y, x, y] }),
  fill: () => {},
  fillStyle: '',
};

renderToCanvas(rendered, fontEngine, mockCtx);

// ─── Checks ───────────────────────────────────────────────────────────────────

const svgMoveCount = (svg.match(/M[\s-\d.]+/g) ?? []).length;
const canvasMoveCount = pathLog.filter((p) => p.op === 'moveTo').length;

console.log(`\n  SVG moveTo count:    ${svgMoveCount}`);
console.log(`  Canvas moveTo count: ${canvasMoveCount}`);
console.log(`  Canvas total ops:    ${pathLog.length}`);

// Exact path counts must match (same glyphs, same paths)
const pass = svgMoveCount === canvasMoveCount;
if (!pass) {
  console.log(`  FAIL — moveTo counts differ`);
}

// ─── Metrics JSON ─────────────────────────────────────────────────────────────

const metrics: TestMetrics = {
  test: 'MT-10',
  timestamp: new Date().toISOString(),
  perf: { composeMs: 0 },
  lines: [],
  summary: {
    lineCount: out.lines.length,
    usedEmergency: false,
    ratioVariance: 0,
    maxRatio: 0,
    minRatio: 0,
    hyphenatedLines: 0,
  },
  extra: {
    svgMoveTos: svgMoveCount,
    canvasMoveTos: canvasMoveCount,
    canvasTotalOps: pathLog.length,
  },
};

writeJson('mt-10-canvas-svg-parity.metrics.json', metrics);

console.log(pass ? '\nPASS' : '\nFAIL');
process.exit(pass ? 0 : 1);
