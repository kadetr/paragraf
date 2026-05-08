// tests/pdf-x3.test.ts
//
// Unit tests for PDF/X-3 conformance metadata support.
// workId 014: PDF/X-3 metadata compliance.

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { renderToPdf, renderDocumentToPdf } from '@paragraf/render-pdf';
import type { OutputIntent } from '@paragraf/render-pdf';
import { loadBuiltinSrgb } from '@paragraf/color';
import type { FontEngine } from '@paragraf/font-engine';
import type { RenderedDocument } from '@paragraf/render-core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockFontEngine(): FontEngine {
  return {
    loadFont: vi.fn().mockResolvedValue(undefined),
    glyphsForString: vi.fn().mockReturnValue([{ index: 1, advanceWidth: 600 }]),
    glyphForCodePoint: vi.fn().mockReturnValue(null),
    applyLigatures: vi
      .fn()
      .mockImplementation((_id: string, g: unknown[]) => g),
    applySingleSubstitution: vi
      .fn()
      .mockImplementation((_id: string, g: unknown[]) => g),
    getKerning: vi.fn().mockReturnValue(0),
    getGlyphPath: vi.fn().mockReturnValue({ commands: [], toSVG: () => '' }),
    getFontMetrics: vi.fn().mockReturnValue({
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      xHeight: 500,
      capHeight: 700,
      lineGap: 0,
      baselineShift: 0,
    }),
  } as unknown as FontEngine;
}

function makeRenderedDocument(pageCount = 1): RenderedDocument {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    pageIndex: i,
    frame: { page: i, x: 0, y: 0, width: 595, height: 842 },
    items: [],
  }));
  return { pages };
}

const containsStr = (buf: Buffer, str: string): boolean =>
  buf.toString('latin1').includes(str);

// ─── Fixture ──────────────────────────────────────────────────────────────────

let intent: OutputIntent;

beforeAll(() => {
  const profile = loadBuiltinSrgb();
  intent = { profile, condition: 'sRGB' };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 1. renderToPdf — Info dict markers ───────────────────────────────────────

describe('renderToPdf — pdfxConformance + outputIntent', () => {
  it('includes GTS_PDFXVersion in the PDF output', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(containsStr(buf, 'PDF/X-3:2002')).toBe(true);
  });

  it('includes Trapped in the PDF output', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(containsStr(buf, 'Trapped')).toBe(true);
  });

  it('forces GTS_PDFX in OutputIntent S field for non-CMYK profile', async () => {
    // sRGB profile is RGB — without pdfxConformance this would emit GTS_PDFA1
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(containsStr(buf, 'GTS_PDFX')).toBe(true);
    expect(containsStr(buf, 'GTS_PDFA1')).toBe(false);
  });
});

// ─── 2. renderDocumentToPdf — Info dict markers ───────────────────────────────

describe('renderDocumentToPdf — pdfxConformance + outputIntent', () => {
  it('includes GTS_PDFXVersion in the PDF output', async () => {
    const buf = await renderDocumentToPdf(
      makeRenderedDocument(),
      makeMockFontEngine(),
      { outputIntent: intent, pdfxConformance: 'PDF/X-3:2002' },
    );
    expect(containsStr(buf, 'PDF/X-3:2002')).toBe(true);
  });

  it('includes Trapped in the PDF output', async () => {
    const buf = await renderDocumentToPdf(
      makeRenderedDocument(),
      makeMockFontEngine(),
      { outputIntent: intent, pdfxConformance: 'PDF/X-3:2002' },
    );
    expect(containsStr(buf, 'Trapped')).toBe(true);
  });
});

// ─── 3. Backward compat — no PDF/X markers when pdfxConformance absent ────────

describe('renderToPdf — pdfxConformance absent (backward compat)', () => {
  it('does not include GTS_PDFXVersion when pdfxConformance is not set', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'GTS_PDFXVersion')).toBe(false);
  });

  it('does not include Trapped when pdfxConformance is not set', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'Trapped')).toBe(false);
  });

  it('emits GTS_PDFA1 for sRGB profile when pdfxConformance is absent', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'GTS_PDFA1')).toBe(true);
    expect(containsStr(buf, 'GTS_PDFX')).toBe(false);
  });
});

// ─── 4. pdfxConformance without outputIntent — warn and no-op ─────────────────

describe('renderToPdf — pdfxConformance without outputIntent', () => {
  it('emits a console.warn when pdfxConformance is set without outputIntent', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderToPdf([], makeMockFontEngine(), {
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
    const buf = await renderToPdf([], makeMockFontEngine(), {
      pdfxConformance: 'PDF/X-3:2002',
    });
    expect(containsStr(buf, 'GTS_PDFXVersion')).toBe(false);
  });
});
