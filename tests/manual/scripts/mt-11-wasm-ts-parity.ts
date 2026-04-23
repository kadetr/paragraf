#!/usr/bin/env tsx
// manual/scripts/mt-11-wasm-ts-parity.ts
// MT-11 — WASM vs TypeScript composition parity.
// Checks: both backends produce identical line counts and the same words per line.
//
// Run:  tsx tests/manual/scripts/mt-11-wasm-ts-parity.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
  wasmStatus,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
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
import { drawTestHeader } from '../fixtures/header.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

const registry = serifRegistry();
const measurer = createMeasurer(registry);
const fontEngine = await createDefaultFontEngine(registry);

// ─── TS composer ──────────────────────────────────────────────────────────────

const tsComposer = await createParagraphComposer(registry, { useWasm: false });
const t0 = performance.now();
const tsOut = tsComposer.compose({
  text: EN_BODY,
  font: F12,
  lineWidth: CONTENT_W,
  tolerance: 3,
});
const tsMs = performance.now() - t0;

// ─── WASM composer ────────────────────────────────────────────────────────────

const wasmSt = wasmStatus();
console.log(`\n  WASM status: ${wasmSt.status} (${wasmSt.error ?? 'ok'})`);

let wasmOut: typeof tsOut | null = null;
let wasmMs = 0;

if (wasmSt.status === 'loaded') {
  const wasmComposer = await createParagraphComposer(registry, {
    useWasm: true,
  });
  const t1 = performance.now();
  wasmOut = wasmComposer.compose({
    text: EN_BODY,
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  wasmMs = performance.now() - t1;
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

type DiffEntry = {
  line: number;
  tsWords: number;
  wasmWords: number;
  tsRatio: number;
  wasmRatio: number;
};

let failures = 0;
const diffs: DiffEntry[] = [];

if (wasmOut !== null) {
  if (tsOut.lines.length !== wasmOut.lines.length) {
    console.log(
      `  FAIL  line count mismatch: TS=${tsOut.lines.length} WASM=${wasmOut.lines.length}`,
    );
    failures++;
  }

  const minLen = Math.min(tsOut.lines.length, wasmOut.lines.length);
  for (let i = 0; i < minLen; i++) {
    const tl = tsOut.lines[i];
    const wl = wasmOut.lines[i];
    const twc = tl.wordRuns.length;
    const wwc = wl.wordRuns.length;
    if (twc !== wwc || Math.abs(tl.ratio - wl.ratio) > 0.01) {
      diffs.push({
        line: i,
        tsWords: twc,
        wasmWords: wwc,
        tsRatio: tl.ratio,
        wasmRatio: wl.ratio,
      });
    }
  }

  if (diffs.length > 0) {
    console.log(`  ${diffs.length} differing lines (showing first 5):`);
    diffs.slice(0, 5).forEach((d) => {
      console.log(
        `    L${d.line}: words TS=${d.tsWords}/WASM=${d.wasmWords}  ratio TS=${d.tsRatio.toFixed(4)}/WASM=${d.wasmRatio.toFixed(4)}`,
      );
    });
    failures += diffs.length;
  }
}

console.log(`\n  TS:   ${tsOut.lines.length} lines in ${tsMs.toFixed(1)}ms`);
if (wasmOut !== null) {
  console.log(
    `  WASM: ${wasmOut.lines.length} lines in ${wasmMs.toFixed(1)}ms`,
  );
  if (wasmMs > 0) console.log(`  Speedup: ${(tsMs / wasmMs).toFixed(2)}×`);
}

// ─── SVG for TS result ────────────────────────────────────────────────────────

const rendered = layoutParagraph(tsOut.lines, measurer, {
  x: MARGIN_X,
  y: MARGIN_TOP,
});
const svg = renderToSvg(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
});
writeSvg('mt-11-wasm-ts-parity-ts.svg', svg);

const pdf = await renderToPdf(rendered, fontEngine, {
  width: PAGE_W,
  height: PAGE_H,
  preDraw: (doc) => drawTestHeader(doc, 'MT-11'),
});
writePdf('mt-11-wasm-ts-parity.pdf', pdf);

// ─── Metrics ──────────────────────────────────────────────────────────────────

const lineMetrics: LineMetrics[] = tsOut.lines.map((l, idx) => ({
  idx,
  y: 0,
  ratio: l.ratio,
  hyphenated: l.hyphenated ?? false,
  xOffset: 0,
  lineWidth: l.lineWidth,
  wordCount: l.wordRuns.length,
}));

const metrics: TestMetrics = {
  test: 'MT-11',
  timestamp: new Date().toISOString(),
  perf: { composeMs: tsMs },
  lines: lineMetrics,
  summary: {
    lineCount: tsOut.lines.length,
    usedEmergency: tsOut.usedEmergency,
    ratioVariance: ratioVariance(lineMetrics),
    maxRatio: Math.max(...lineMetrics.map((l) => Math.abs(l.ratio))),
    minRatio: Math.min(...lineMetrics.map((l) => Math.abs(l.ratio))),
    hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
  },
  extra: {
    wasmStatus: wasmSt.status,
    wasmMs,
    diffCount: diffs.length,
    diffs: diffs.slice(0, 10),
  },
};
writeJson('mt-11-wasm-ts-parity.metrics.json', metrics);

console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
process.exit(failures > 0 ? 1 : 0);
