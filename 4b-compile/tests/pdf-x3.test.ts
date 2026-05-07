// tests/pdf-x3.test.ts
//
// Integration tests for pdfxConformance threading through compile().
// workId 014: PDF/X-3 metadata compliance.

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import * as path from 'path';
import { defineTemplate } from '@paragraf/template';
import { compile } from '../src/compile.js';
import { loadBuiltinSrgb, createColorManager } from '@paragraf/color';
import type { OutputIntent } from '@paragraf/render-pdf';

const FONTS_DIR = path.resolve(__dirname, '../../fonts');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeTemplate() {
  return defineTemplate({
    layout: { size: 'A4', margins: 72 },
    fonts: {
      'Liberation Serif': {
        regular: path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf'),
      },
    },
    styles: {
      body: {
        font: { family: 'Liberation Serif', size: 12 },
        alignment: 'left',
        lineHeight: 18,
      },
    },
    content: [{ style: 'body', text: '{{text}}' }],
  });
}

const SAMPLE_DATA = { text: 'Hello world.' };

let intent: OutputIntent;

beforeAll(() => {
  const profile = loadBuiltinSrgb();
  intent = createColorManager().getOutputIntent(profile, 'sRGB');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const containsStr = (buf: Buffer, str: string): boolean =>
  buf.toString('latin1').includes(str);

// ─── 1. pdfxConformance flows through to PDF output ──────────────────────────

describe('compile() — pdfxConformance + outputIntent', () => {
  it('includes GTS_PDFXVersion in the PDF output', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent: intent,
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(containsStr(result.data as Buffer, 'PDF/X-3:2002')).toBe(true);
  });

  it('includes Trapped in the PDF output', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent: intent,
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(containsStr(result.data as Buffer, 'Trapped')).toBe(true);
  });

  it('emits GTS_PDFX (not GTS_PDFA1) for non-CMYK profile when pdfxConformance set', async () => {
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      outputIntent: intent,
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(containsStr(result.data as Buffer, 'GTS_PDFX')).toBe(true);
    expect(containsStr(result.data as Buffer, 'GTS_PDFA1')).toBe(false);
  });
});

// ─── 2. pdfxConformance without outputIntent — warn and no-op ─────────────────

describe('compile() — pdfxConformance without outputIntent', () => {
  it('emits a console.warn when pdfxConformance is set without outputIntent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'pdfxConformance has no effect without outputIntent',
      ),
    );
  });

  it('does not include GTS_PDFXVersion when outputIntent is absent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'pdf',
      shaping: 'fontkit',
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(containsStr(result.data as Buffer, 'GTS_PDFXVersion')).toBe(false);
  });
});

// ─── 3. pdfxConformance with output: 'svg' — warn ────────────────────────────

describe('compile() — pdfxConformance with output: svg', () => {
  it('emits a console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await compile({
      template: makeTemplate(),
      data: SAMPLE_DATA,
      output: 'svg',
      shaping: 'fontkit',
      outputIntent: intent,
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'pdfxConformance has no effect when output is not "pdf"',
      ),
    );
  });
});
