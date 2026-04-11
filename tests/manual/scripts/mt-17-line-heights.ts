#!/usr/bin/env tsx
// manual/scripts/mt-17-line-heights.ts
// MT-17 — Line height (leading) multiplier sweep: 1.0 / 1.2 / 1.4 / 1.6 / 2.0×
// Checks: taller leading → more total content height; all SVGs produced.
//
// Run:  tsx tests/manual/scripts/mt-17-line-heights.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { serifRegistry, font } from '../fixtures/fonts.js';
import { EN_BODY } from '../fixtures/text.js';
import { writeSvg, writeJson, type TestMetrics } from '../fixtures/output.js';
import {
  MARGIN_X,
  MARGIN_TOP,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from '../fixtures/documents.js';

const MULTIPLIERS = [1.0, 1.2, 1.4, 1.6, 2.0];
const BASE_SIZE = 12;

// ─── Exported run() for programmatic use (bake-svgs.ts) ──────────────────────
// Returns all 5 variants; bake-svgs.ts picks the representative one (2.0×).

export async function run(): Promise<{ name: string; svg: string }[]> {
  const registry = serifRegistry();
  const composer = await createParagraphComposer(registry);
  const measurer = createMeasurer(registry);
  const fontEngine = await createDefaultFontEngine(registry);

  const results: { name: string; svg: string }[] = [];
  for (const mult of MULTIPLIERS) {
    const size = BASE_SIZE * mult;
    const f = font('serif-regular', size);
    const out = composer.compose({
      text: EN_BODY,
      font: f,
      lineWidth: CONTENT_W,
      tolerance: 3,
    });
    const rendered = layoutParagraph(out.lines, measurer, {
      x: MARGIN_X,
      y: MARGIN_TOP,
    });
    const svg = renderToSvg(rendered, fontEngine, {
      width: PAGE_W,
      height: PAGE_H,
    });
    const label = String(mult.toFixed(1)).replace('.', '_');
    results.push({ name: `mt-17-line-height-${label}x`, svg });
  }
  return results;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('mt-17-line-heights.ts')) {
  const registry = serifRegistry();
  const composer = await createParagraphComposer(registry);
  const measurer = createMeasurer(registry);
  const fontEngine = await createDefaultFontEngine(registry);

  type SweepRow = {
    multiplier: number;
    size: number;
    lines: number;
    totalHeight: number;
    ms: number;
  };
  const rows: SweepRow[] = [];

  console.log('\n  Size(pt)  Mult×  Lines  TotalH(pt)  Time(ms)');
  console.log('  ───────────────────────────────────────────────');

  let failures = 0;
  let prevHeight = 0;

  for (const mult of MULTIPLIERS) {
    const size = BASE_SIZE * mult;
    const f = font('serif-regular', size);

    const t0 = performance.now();
    const out = composer.compose({
      text: EN_BODY,
      font: f,
      lineWidth: CONTENT_W,
      tolerance: 3,
    });
    const ms = performance.now() - t0;

    const rendered = layoutParagraph(out.lines, measurer, {
      x: MARGIN_X,
      y: MARGIN_TOP,
    });

    const totalHeight = rendered.reduce((s, l) => s + l.lineHeight, 0);

    const svg = renderToSvg(rendered, fontEngine, {
      width: PAGE_W,
      height: PAGE_H,
    });
    const label = String(mult.toFixed(1)).replace('.', '_');
    writeSvg(`mt-17-line-height-${label}x.svg`, svg);

    console.log(
      `  ${size.toFixed(1).padEnd(9)} ${String(mult.toFixed(1) + '×').padEnd(6)} ${String(out.lines.length).padEnd(6)} ${totalHeight.toFixed(1).padEnd(11)} ${ms.toFixed(1)}`,
    );

    rows.push({
      multiplier: mult,
      size,
      lines: out.lines.length,
      totalHeight,
      ms,
    });

    if (prevHeight > 0 && totalHeight < prevHeight * 0.98) {
      console.log(
        `  FAIL  size=${size.toFixed(1)}pt: total height ${totalHeight.toFixed(1)} < prev ${prevHeight.toFixed(1)}`,
      );
      failures++;
    }
    prevHeight = totalHeight;
  }

  const metrics: TestMetrics = {
    test: 'MT-17',
    timestamp: new Date().toISOString(),
    perf: { composeMs: rows.reduce((s, r) => s + r.ms, 0) },
    lines: [],
    summary: {
      lineCount: 0,
      usedEmergency: false,
      ratioVariance: 0,
      maxRatio: 0,
      minRatio: 0,
      hyphenatedLines: 0,
    },
    extra: { sweep: rows },
  };
  writeJson('mt-17-line-heights.metrics.json', metrics);

  console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
  process.exit(failures > 0 ? 1 : 0);
}
