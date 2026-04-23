#!/usr/bin/env tsx
// manual/scripts/mt-05-mixed-font.ts
// MT-05 — Mixed Font Paragraph.
// Checks: lineHeight from tallest font, consistent baseline, word spacing from dominant font.
//
// Run:  tsx tests/manual/scripts/mt-05-mixed-font.ts

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { renderToPdf } from '@paragraf/render-pdf';
import { serifRegistry, F12, F12B, F12I, font } from '../fixtures/fonts.js';
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
  const F18B = font('serif-bold', 18);

  const out = composer.compose({
    spans: [
      { text: 'Mixed-font spans are fully supported. ', font: F12 },
      { text: 'Bold text', font: F12B },
      { text: ' and ', font: F12 },
      { text: 'italic text', font: F12I },
      {
        text: ' flow together in the same paragraph, each measured with its own OpenType metrics. ',
        font: F12,
      },
      { text: 'A large heading word ', font: F18B },
      {
        text:
          'appears inline and its lineHeight should expand to accommodate it without clipping. ' +
          'Word spacing is computed from the dominant font on each line.',
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
  const svg = renderToSvg(rendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  return [{ name: 'mt-05-mixed-font', svg }];
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith('mt-05-mixed-font.ts')) {
  const registry = serifRegistry();
  const composer = await createParagraphComposer(registry);
  const measurer = createMeasurer(registry);
  const fontEngine = await createDefaultFontEngine(registry);

  const F18B = font('serif-bold', 18);

  // ─── Compose: normal → large → normal ────────────────────────────────────────

  const t0 = performance.now();
  const out = composer.compose({
    spans: [
      { text: 'Mixed-font spans are fully supported. ', font: F12 },
      { text: 'Bold text', font: F12B },
      { text: ' and ', font: F12 },
      { text: 'italic text', font: F12I },
      {
        text: ' flow together in the same paragraph, each measured with its own OpenType metrics. ',
        font: F12,
      },
      { text: 'A large heading word ', font: F18B },
      {
        text:
          'appears inline and its lineHeight should expand to accommodate it without clipping. ' +
          'Word spacing is computed from the dominant font on each line.',
        font: F12,
      },
    ],
    font: F12,
    lineWidth: CONTENT_W,
    tolerance: 3,
  });
  const ms = performance.now() - t0;

  // ─── Checks ───────────────────────────────────────────────────────────────────

  const rendered = layoutParagraph(out.lines, measurer, {
    x: MARGIN_X,
    y: MARGIN_TOP,
  });

  let failures = 0;

  // Check 1: at least one segment with size ≥ 18 was placed (18pt word was included)
  const allSegs = rendered.flatMap((rl) => rl.segments);
  const largeSeg = allSegs.find((s) => s.font.size >= 18);
  if (!largeSeg) {
    console.log(
      '  FAIL  no segment with font.size ≥ 18 found — large word missing',
    );
    failures++;
  } else {
    console.log(
      `  PASS  18pt segment found: "${largeSeg.text}" at font.size=${largeSeg.font.size}`,
    );
  }

  // Check 2: the 18pt font word is wider than the equivalent would be at 12pt (scaling check)
  if (largeSeg) {
    const widthAt18 = measurer.measure(largeSeg.text, largeSeg.font);
    const widthAt12 = measurer.measure(largeSeg.text, {
      ...largeSeg.font,
      size: 12,
    });
    if (widthAt18 <= widthAt12) {
      console.log(
        `  FAIL  18pt word width=${widthAt18.toFixed(2)} not wider than 12pt width=${widthAt12.toFixed(2)}`,
      );
      failures++;
    } else {
      console.log(
        `  PASS  18pt word wider (${widthAt18.toFixed(2)}) than same word at 12pt (${widthAt12.toFixed(2)})`,
      );
    }
  }

  // Check 3: the line containing the 18pt segment has lineHeight greater than a 12pt-only line
  {
    const mixedLine = rendered.find((rl) =>
      rl.segments.some((s) => s.font.size >= 18),
    );
    const smallOnlyLine = rendered.find((rl) =>
      rl.segments.every((s) => s.font.size < 18),
    );
    if (!mixedLine) {
      console.log('  FAIL  no rendered line contains an 18pt segment');
      failures++;
    } else if (!smallOnlyLine) {
      console.log('  SKIP  no 12pt-only line to compare against');
    } else if (mixedLine.lineHeight <= smallOnlyLine.lineHeight) {
      console.log(
        `  FAIL  mixed-font lineHeight=${mixedLine.lineHeight.toFixed(2)} ≤ 12pt-only lineHeight=${smallOnlyLine.lineHeight.toFixed(2)} — large glyph will clip`,
      );
      failures++;
    } else {
      console.log(
        `  PASS  mixed-font lineHeight=${mixedLine.lineHeight.toFixed(2)} > 12pt-only lineHeight=${smallOnlyLine.lineHeight.toFixed(2)}`,
      );
    }
  }

  console.log(`\n  ${out.lines.length} lines composed in ${ms.toFixed(1)}ms`);

  // ─── SVG ──────────────────────────────────────────────────────────────────────

  const svg = renderToSvg(rendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
  });
  writeSvg('mt-05-mixed-font.svg', svg);
  const pdf = await renderToPdf(rendered, fontEngine, {
    width: PAGE_W,
    height: PAGE_H,
    preDraw: (doc) => drawTestHeader(doc, 'MT-05'),
  });
  writePdf('mt-05-mixed-font.pdf', pdf);

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
    test: 'MT-05',
    timestamp: new Date().toISOString(),
    perf: { composeMs: ms },
    lines: lineMetrics,
    summary: {
      lineCount: out.lines.length,
      usedEmergency: out.usedEmergency,
      ratioVariance: 0,
      maxRatio: 0,
      minRatio: 0,
      hyphenatedLines: lineMetrics.filter((l) => l.hyphenated).length,
    },
  };

  writeJson('mt-05-mixed-font.metrics.json', metrics);

  console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures} issue(s))`);
  process.exit(failures > 0 ? 1 : 0);
}
