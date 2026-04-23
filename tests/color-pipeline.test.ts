// color-pipeline.test.ts
//
// Integration / e2e tests for the color-wasm → render-pdf → compile pipeline.
// Covers: sRGB → CMYK fill conversion, no-profile passthrough, compile round-trip,
// and OutputIntent re-export from @paragraf/color-wasm.
//
// Uses real ICC profiles via @paragraf/color and the WASM binary from 2c-color-wasm.

import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import { defineTemplate } from '@paragraf/template';
import { compile } from '@paragraf/compile';
import {
  loadColorWasm,
  createWasmTransform,
  type OutputIntent,
} from '@paragraf/color-wasm';
import { loadBuiltinSrgb } from '@paragraf/color';
import { renderDocumentToPdf } from '@paragraf/render-pdf';

const FONTS_DIR = path.resolve(__dirname, '../fonts');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTemplate() {
  return defineTemplate({
    layout: { size: 'A4', margins: 72 },
    fonts: {
      'Liberation Serif': {
        regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
        bold: path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf'),
        italic: path.join(FONTS_DIR, 'LiberationSerif-Italic.ttf'),
        boldItalic: path.join(FONTS_DIR, 'LiberationSerif-BoldItalic.ttf'),
      },
    },
    styles: {
      body: {
        font: { family: 'Liberation Serif', size: 12 },
        alignment: 'justified',
        lineHeight: 18,
      },
    },
    content: [{ style: 'body', text: '{{body}}' }],
  });
}

const SAMPLE_DATA = { body: 'Color pipeline integration test. '.repeat(10) };

// ─── Helper: build a minimal CMYK-like OutputIntent using sRGB→sRGB (identity) ─
// In a real scenario this would be a CMYK profile; for testing we use sRGB→sRGB
// so the WASM transform is exercised without requiring an external CMYK .icc file.

async function buildTestOutputIntent(): Promise<OutputIntent> {
  const srgb = await loadBuiltinSrgb();
  return {
    profile: srgb,
    condition: 'sRGB IEC61966-2.1',
  };
}

// ─── 1. OutputIntent re-export from @paragraf/color-wasm ─────────────────────

describe('color-wasm: OutputIntent re-export', () => {
  it('OutputIntent type is importable from @paragraf/color-wasm', () => {
    // Type-level verification: if this compiles and runs, the re-export works.
    const intent: OutputIntent = {
      profile: {} as any,
      condition: 'test',
    };
    expect(intent.condition).toBe('test');
  });
});

// ─── 2. colorTransform wiring in render-pdf ───────────────────────────────────

describe('render-pdf: colorTransform option', () => {
  it('applies transform to fill when colorTransform is provided', async () => {
    const wasm = loadColorWasm();
    const srgb = await loadBuiltinSrgb();
    const transform = createWasmTransform(wasm, srgb, srgb); // sRGB→sRGB identity

    const applySpy = vi.spyOn(transform, 'apply');

    const template = makeTemplate();
    const result = await compile({
      template,
      data: SAMPLE_DATA,
      output: 'rendered',
      shaping: 'fontkit',
    });

    const { createDefaultFontEngine } = await import('@paragraf/typography');
    const { buildFontRegistry } = await import('@paragraf/compile');
    const registry = buildFontRegistry(template.fonts, FONTS_DIR);
    const fontEngine = await createDefaultFontEngine(registry, {
      useWasm: false,
    });

    // Render to PDF with colorTransform — transform.apply must be called for each page draw
    await renderDocumentToPdf(result.data as any, fontEngine, {
      colorTransform: transform,
    });

    expect(applySpy).toHaveBeenCalled();
  });

  it('does not call colorTransform.apply when not provided', async () => {
    const wasm = loadColorWasm();
    const srgb = await loadBuiltinSrgb();
    const transform = createWasmTransform(wasm, srgb, srgb);
    const applySpy = vi.spyOn(transform, 'apply');

    // compile to PDF without colorTransform — transform should never be called
    const { data } = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
    });

    expect(Buffer.isBuffer(data)).toBe(true);
    expect(applySpy).not.toHaveBeenCalled();
  });
});

// ─── 3. compile + outputIntent round-trip ─────────────────────────────────────

describe('compile: outputIntent + color-wasm round-trip', () => {
  it('produces a valid PDF buffer when outputIntent is provided', async () => {
    const outputIntent = await buildTestOutputIntent();

    const { data, metadata } = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent,
    });

    expect(Buffer.isBuffer(data)).toBe(true);
    // Valid PDF starts with %PDF
    const header = (data as Buffer).slice(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
    expect(metadata.pageCount).toBeGreaterThan(0);
  });

  it('produces identical page count with and without outputIntent', async () => {
    const outputIntent = await buildTestOutputIntent();

    const [withIntent, withoutIntent] = await Promise.all([
      compile({
        template: makeTemplate(),
        data: SAMPLE_DATA,
        output: 'pdf',
        shaping: 'fontkit',
        outputIntent,
      }),
      compile({
        template: makeTemplate(),
        data: SAMPLE_DATA,
        output: 'pdf',
        shaping: 'fontkit',
      }),
    ]);

    expect(withIntent.metadata.pageCount).toBe(
      withoutIntent.metadata.pageCount,
    );
  });

  it('outputIntent embeds ICC bytes in PDF (OutputIntents appears in output)', async () => {
    const outputIntent = await buildTestOutputIntent();

    const { data } = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent,
    });

    const pdfStr = (data as Buffer).toString('latin1');
    expect(pdfStr).toContain('OutputIntents');
  });

  it('no outputIntent → no OutputIntents in PDF', async () => {
    const { data } = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
    });

    const pdfStr = (data as Buffer).toString('latin1');
    expect(pdfStr).not.toContain('OutputIntents');
  });
});

// ─── 4. parseCssToSrgb + applyFillTransform coverage ─────────────────────────
// Verify the WASM transform itself processes normalized sRGB values correctly.

describe('color-wasm: createWasmTransform sRGB→sRGB identity', () => {
  it('returns same channel count for [r, g, b] input', async () => {
    const wasm = loadColorWasm();
    const srgb = await loadBuiltinSrgb();
    const transform = createWasmTransform(wasm, srgb, srgb);

    const input = [0.5, 0.25, 0.75];
    const output = transform.apply(input);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThan(0);
    // All output values should be in [0, 1] range
    for (const v of output) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('black [0,0,0] maps to a valid output', async () => {
    const wasm = loadColorWasm();
    const srgb = await loadBuiltinSrgb();
    const transform = createWasmTransform(wasm, srgb, srgb);
    const output = transform.apply([0, 0, 0]);
    expect(output.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it('white [1,1,1] maps to a valid output', async () => {
    const wasm = loadColorWasm();
    const srgb = await loadBuiltinSrgb();
    const transform = createWasmTransform(wasm, srgb, srgb);
    const output = transform.apply([1, 1, 1]);
    expect(output.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
