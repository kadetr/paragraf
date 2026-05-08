/**
 * render-wasm.test.ts
 * Validates that WasmFontEngine produces valid SVG output and agrees with
 * FontkitEngine on glyph counts for a NaN-free paragraph render.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

import {
  createParagraphComposer,
  createDefaultFontEngine,
} from '@paragraf/typography';
import { createMeasurer, FontkitEngine } from '@paragraf/font-engine';
import { layoutParagraph, renderToSvg } from '@paragraf/render-core';
import { WasmFontEngine, loadShapingWasm } from '@paragraf/shaping-wasm';
import { Font, FontRegistry } from '@paragraf/types';

const FONTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../fonts',
);
const SERIF_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');

const REGISTRY: FontRegistry = new Map([
  [
    'lib-reg',
    { id: 'lib-reg', family: 'Liberation Serif', filePath: SERIF_PATH },
  ],
]);

const F12: Font = {
  id: 'lib-reg',
  size: 12,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

let wasm: any;
let wasmEngine: WasmFontEngine;
let otEngine: FontkitEngine;

beforeAll(async () => {
  wasm = loadShapingWasm();
  wasm.register_font('lib-reg', readFileSync(SERIF_PATH));

  wasmEngine = new WasmFontEngine(wasm);
  await wasmEngine.loadFont('lib-reg', SERIF_PATH);

  otEngine = new FontkitEngine();
  await otEngine.loadFont('lib-reg', SERIF_PATH);
});

describe('WasmFontEngine rendering', () => {
  const TEXT = 'The brown fox jumps over the lazy dog.'; // no fi/fl ligatures

  it('shape_text_wasm returns valid glyphs for a word', () => {
    const glyphs = wasmEngine.glyphsForString('lib-reg', 'The', F12);
    expect(glyphs.length).toBe(3);
    for (const g of glyphs) {
      expect(g.index).toBeGreaterThan(0);
      expect(g.advanceWidth).toBeGreaterThan(0);
      expect(isNaN(g.advanceWidth)).toBe(false);
    }
  });

  it('get_glyph_path returns non-NaN path data', () => {
    const glyphs = wasmEngine.glyphsForString('lib-reg', 'T', F12);
    expect(glyphs.length).toBeGreaterThan(0);
    const glyphPath = wasmEngine.getGlyphPath('lib-reg', glyphs[0], 0, 12, 12);
    expect(glyphPath.commands.length).toBeGreaterThan(0);

    const svg = glyphPath.toSVG();
    expect(svg).not.toContain('NaN');
    expect(svg.length).toBeGreaterThan(0);

    for (const cmd of glyphPath.commands) {
      for (const arg of cmd.args) {
        expect(isNaN(arg)).toBe(false);
        expect(isFinite(arg)).toBe(true);
      }
    }
  });

  it('renderToSvg with WasmFontEngine produces valid SVG without NaN', async () => {
    const composer = await createParagraphComposer(REGISTRY);
    const measurer = createMeasurer(REGISTRY);

    const output = composer.compose({ text: TEXT, font: F12, lineWidth: 300 });
    const rendered = layoutParagraph(output.lines, measurer, { x: 0, y: 20 });

    const svg = renderToSvg(rendered, wasmEngine, { width: 400, height: 200 });

    expect(svg).toContain('<svg');
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('M '); // at least one moveTo command
  });

  it('WasmFontEngine path count matches FontkitEngine for ligature-free text', async () => {
    const composer = await createParagraphComposer(REGISTRY);
    const measurer = createMeasurer(REGISTRY);

    const output = composer.compose({ text: TEXT, font: F12, lineWidth: 300 });
    const rendered = layoutParagraph(output.lines, measurer, { x: 0, y: 20 });

    const wasmSvg = renderToSvg(rendered, wasmEngine, {
      width: 400,
      height: 200,
    });
    const otSvg = renderToSvg(rendered, otEngine, { width: 400, height: 200 });

    // Count <path d= elements — both engines produce <path d="..."/> elements
    const wasmPathCount = (wasmSvg.match(/<path d=/g) ?? []).length;
    const otPathCount = (otSvg.match(/<path d=/g) ?? []).length;

    expect(wasmPathCount).toBeGreaterThan(0);
    expect(wasmPathCount).toBe(otPathCount);
  });

  it('getFontMetrics returns valid metrics', () => {
    const metrics = wasmEngine.getFontMetrics('lib-reg', 12);
    expect(metrics.unitsPerEm).toBeGreaterThan(0);
    expect(metrics.ascender).toBeGreaterThan(0);
    expect(isNaN(metrics.ascender)).toBe(false);
    expect(isNaN(metrics.descender)).toBe(false);
  });
});

// ─── F014: createDefaultFontEngine — loads all registry fonts ────────────────
//
// Characterization: createDefaultFontEngine loads ALL fonts in the registry at
// call time, regardless of which fonts are actually referenced by the paragraph
// being composed. This is the documented behavior (P4 performance finding).
// These tests create a regression boundary before any future lazy-loading refactor.

describe('createDefaultFontEngine (F014)', () => {
  it('returns a FontEngine that can shape glyphs for the registry font', async () => {
    const engine = await createDefaultFontEngine(REGISTRY);
    const glyphs = engine.glyphsForString('lib-reg', 'Hi', F12);
    expect(glyphs.length).toBe(2);
    for (const g of glyphs) {
      expect(g.advanceWidth).toBeGreaterThan(0);
    }
  });

  it('loads all fonts in a multi-entry registry — every entry is usable', async () => {
    // Two entries using the same file but different ids — both must be registered.
    const multiRegistry: FontRegistry = new Map([
      [
        'font-a',
        { id: 'font-a', family: 'Liberation Serif', filePath: SERIF_PATH },
      ],
      [
        'font-b',
        { id: 'font-b', family: 'Liberation Serif', filePath: SERIF_PATH },
      ],
    ]);
    const F12a = { ...F12, id: 'font-a' };
    const F12b = { ...F12, id: 'font-b' };

    const engine = await createDefaultFontEngine(multiRegistry);

    // Both ids must be loaded — not just the first one
    const glyphsA = engine.glyphsForString('font-a', 'A', F12a);
    const glyphsB = engine.glyphsForString('font-b', 'A', F12b);
    expect(glyphsA.length).toBeGreaterThan(0);
    expect(glyphsB.length).toBeGreaterThan(0);
  });

  it('returns a FontEngine with valid metrics for the registered font', async () => {
    const engine = await createDefaultFontEngine(REGISTRY);
    const metrics = engine.getFontMetrics('lib-reg', 12);
    expect(metrics.unitsPerEm).toBeGreaterThan(0);
    expect(isNaN(metrics.ascender)).toBe(false);
  });
});
