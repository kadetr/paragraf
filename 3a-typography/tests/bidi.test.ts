// tests/bidi.test.ts
// v0.8 — BiDi/RTL tests (WASM-only; no TypeScript fallback equivalence)

import * as path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

// itWasm: skips the test (shows as SKIP in the reporter) when WASM is absent.
// Using bare `return` inside an it() would show a false green dot instead.
// Evaluated once at module load time — WASM status is fixed at startup.
const wasmLoaded = () => wasmStatus().status === 'loaded';
const itWasm = it.skipIf(wasmStatus().status !== 'loaded');
import {
  createParagraphComposer,
  ParagraphComposer,
  wasmStatus,
} from '@paragraf/typography';
import { loadShapingWasm } from '@paragraf/shaping-wasm';
import { Measurer, TextSpan } from '@paragraf/types';
import { layoutParagraph } from '@paragraf/render-core';
import { FontRegistry, Font } from '@paragraf/types';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');

const REGISTRY: FontRegistry = new Map([
  [
    'noto-hebrew',
    {
      id: 'noto-hebrew',
      face: 'Noto Sans Hebrew',
      filePath: path.join(FONTS_DIR, 'NotoSansHebrew-Regular.ttf'),
    },
  ],
  [
    'noto-arabic',
    {
      id: 'noto-arabic',
      face: 'Noto Sans Arabic',
      filePath: path.join(FONTS_DIR, 'NotoSansArabic-Regular.ttf'),
    },
  ],
  [
    'liberation-regular',
    {
      id: 'liberation-regular',
      face: 'Liberation Serif',
      filePath: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
    },
  ],
]);

const FONT_HE: Font = {
  id: 'noto-hebrew',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const FONT_AR: Font = {
  id: 'noto-arabic',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const FONT_EN: Font = {
  id: 'liberation-regular',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

// ─── Phase 0: WASM analyze_bidi ──────────────────────────────────────────────

describe('analyze_bidi — WASM BiDi run analysis', () => {
  let wasm: any;

  beforeAll(() => {
    wasm = loadShapingWasm();
  });

  it('empty string returns empty run list', () => {
    const r = JSON.parse(wasm.analyze_bidi(''));
    expect(r.ok).toEqual([]);
  });

  it('pure English text → all runs are LTR', () => {
    const r = JSON.parse(wasm.analyze_bidi('Hello world'));
    expect(r.ok).toBeDefined();
    expect(r.ok.length).toBeGreaterThan(0);
    expect(r.ok.every((run: { isRtl: boolean }) => !run.isRtl)).toBe(true);
  });

  it('pure Hebrew text → at least one RTL run', () => {
    // שלום עולם — "Hello World"
    const r = JSON.parse(wasm.analyze_bidi('שלום עולם'));
    expect(r.ok).toBeDefined();
    expect(r.ok.some((run: { isRtl: boolean }) => run.isRtl)).toBe(true);
  });

  it('pure Arabic text → at least one RTL run', () => {
    // مرحبا — "Hello"
    const r = JSON.parse(wasm.analyze_bidi('مرحبا'));
    expect(r.ok).toBeDefined();
    expect(r.ok.some((run: { isRtl: boolean }) => run.isRtl)).toBe(true);
  });

  it('pure Hebrew paragraph — single RTL run', () => {
    // All Hebrew, no direction changes → one run
    const text = 'בראשית ברא אלהים';
    const r = JSON.parse(wasm.analyze_bidi(text));
    expect(r.ok.length).toBe(1);
    expect(r.ok[0].isRtl).toBe(true);
  });

  it('Hebrew with NSM (shin dot) — diacritic stays in same run as base', () => {
    // U+05E9 (shin) + U+05C1 (shin dot / NSM) — UBA rule W1 keeps same level
    const text = '\u05E9\u05C1\u05DC\u05D5\u05DD'; // שׁלום (shin-dot + lamed + waw + mem)
    const r = JSON.parse(wasm.analyze_bidi(text));
    // Single run: NSM inherits level of preceding strong RTL char
    expect(r.ok.length).toBe(1);
    expect(r.ok[0].isRtl).toBe(true);
    expect(r.ok[0].text).toBe(text);
  });

  it('run texts concatenate back to the original string', () => {
    // Works for any input — validates no characters are dropped or duplicated
    const text = 'Hello שלום World';
    const r = JSON.parse(wasm.analyze_bidi(text));
    const joined = r.ok.map((run: { text: string }) => run.text).join('');
    expect(joined).toBe(text);
  });

  it('each run has a numeric level field', () => {
    const r = JSON.parse(wasm.analyze_bidi('שלום'));
    for (const run of r.ok) {
      expect(typeof run.level).toBe('number');
      expect(run.level).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── End-to-end: RTL paragraph composition ───────────────────────────────────

describe('RTL paragraph composition', () => {
  let composer: ParagraphComposer;

  beforeAll(async () => {
    if (!wasmLoaded()) return;
    composer = await createParagraphComposer(REGISTRY);
  });

  itWasm('Hebrew paragraph → ComposedLine.direction === "rtl"', () => {
    const out = composer.compose({
      text: 'שלום עולם זה טקסט בעברית',
      font: FONT_HE,
      lineWidth: 200,
    });
    expect(out.lines.length).toBeGreaterThan(0);
    for (const line of out.lines) {
      expect(line.direction).toBe('rtl');
    }
  });

  itWasm('Arabic paragraph → ComposedLine.direction === "rtl"', () => {
    const out = composer.compose({
      text: 'مرحبا بالعالم هذا نص عربي',
      font: FONT_AR,
      lineWidth: 200,
    });
    expect(out.lines.length).toBeGreaterThan(0);
    for (const line of out.lines) {
      expect(line.direction).toBe('rtl');
    }
  });

  itWasm('English paragraph → ComposedLine.direction === "ltr"', () => {
    const out = composer.compose({
      text: 'Hello world this is an English paragraph with multiple words',
      font: FONT_EN,
      lineWidth: 200,
    });
    expect(out.lines.length).toBeGreaterThan(0);
    for (const line of out.lines) {
      expect(line.direction ?? 'ltr').toBe('ltr');
    }
  });

  itWasm('RTL single-word paragraph — does not throw', () => {
    expect(() =>
      composer.compose({ text: 'שלום', font: FONT_HE, lineWidth: 200 }),
    ).not.toThrow();
  });

  itWasm('RTL paragraph with spans input — throws informative error', () => {
    const spans: TextSpan[] = [{ text: 'שלום', font: FONT_HE }];
    expect(() =>
      composer.compose({ spans, font: FONT_HE, lineWidth: 200 }),
    ).toThrow('[paragraf] RTL paragraphs do not support span input yet');
  });

  itWasm(
    'RTL paragraph with narrow lineWidth — correctly breaks into multiple lines',
    () => {
      const out = composer.compose({
        text: 'שלום עולם ברוך הבא אל הטקסט',
        font: FONT_HE,
        lineWidth: 120,
        tolerance: 5,
        emergencyStretch: 20,
      });
      expect(out.lines.length).toBeGreaterThan(1);
      for (const line of out.lines) {
        expect(line.direction).toBe('rtl');
      }
    },
  );
});

// ─── Phase 3: visual reordering in layoutParagraph ───────────────────────────

describe('RTL visual reordering in layoutParagraph', () => {
  let composer: ParagraphComposer;
  let measurer: Measurer;

  beforeAll(async () => {
    if (!wasmLoaded()) return;
    const { createMeasurer } = await import('@paragraf/font-engine');
    measurer = createMeasurer(REGISTRY);
    composer = await createParagraphComposer(REGISTRY);
  });

  itWasm(
    'RTL line: first segment x > second segment x (right-to-left visual order)',
    () => {
      // At least two words needed to test ordering
      const out = composer.compose({
        text: 'שלום עולם',
        font: FONT_HE,
        lineWidth: 300,
      });
      // Ensure both words fit on one line
      expect(out.lines.length).toBe(1);

      const rendered = layoutParagraph(out.lines, measurer, { x: 0, y: 0 });
      const lineSegs = rendered[0].segments;
      expect(lineSegs.length).toBeGreaterThanOrEqual(2);
      // Visual order: first rendered segment (rightmost word) has greater x
      expect(lineSegs[0].x).toBeGreaterThan(lineSegs[1].x);
    },
  );

  itWasm(
    'LTR line: first segment x < second segment x (left-to-right visual order)',
    () => {
      const out = composer.compose({
        text: 'Hello world',
        font: FONT_EN,
        lineWidth: 300,
      });
      expect(out.lines.length).toBe(1);

      const rendered = layoutParagraph(out.lines, measurer, { x: 0, y: 0 });
      const lineSegs = rendered[0].segments;
      expect(lineSegs.length).toBeGreaterThanOrEqual(2);
      // LTR: first segment on the left, increasing x
      expect(lineSegs[0].x).toBeLessThan(lineSegs[1].x);
    },
  );

  itWasm(
    'RTL segment x values are within [origin.x, origin.x + lineWidth]',
    () => {
      const origin = { x: 10, y: 0 };
      const lineWidth = 300;
      const out = composer.compose({
        text: 'שלום עולם ברוך',
        font: FONT_HE,
        lineWidth,
      });

      const rendered = layoutParagraph(out.lines, measurer, origin);
      for (const line of rendered) {
        for (const seg of line.segments) {
          expect(seg.x).toBeGreaterThanOrEqual(origin.x);
          expect(seg.x).toBeLessThanOrEqual(origin.x + lineWidth);
        }
      }
    },
  );

  itWasm(
    'RTL multi-line: all lines have consistent right-to-left segment ordering',
    () => {
      const out = composer.compose({
        text: 'שלום עולם ברוך הבא אל הטקסט העברי',
        font: FONT_HE,
        lineWidth: 120,
        tolerance: 5,
        emergencyStretch: 20,
      });
      expect(out.lines.length).toBeGreaterThan(1);

      const rendered = layoutParagraph(out.lines, measurer, { x: 0, y: 0 });
      for (const line of rendered) {
        // Lines with 2+ segments: x should be non-increasing (right-to-left)
        if (line.segments.length >= 2) {
          expect(line.segments[0].x).toBeGreaterThan(line.segments[1].x);
        }
      }
    },
  );
});
