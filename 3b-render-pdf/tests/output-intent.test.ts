// tests/output-intent.test.ts
//
// TDD tests for OutputIntent support in renderToPdf / renderDocumentToPdf.
// workId 010: render-pdf OutputIntent integration.

import { describe, it, expect, vi, beforeAll } from 'vitest';
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

const isPdfHeader = (buf: Buffer): boolean =>
  buf.toString('ascii', 0, 5) === '%PDF-';

const hasEof = (buf: Buffer): boolean =>
  buf.toString('latin1', Math.max(0, buf.length - 64)).includes('%%EOF');

const containsStr = (buf: Buffer, str: string): boolean =>
  buf.toString('latin1').includes(str);

const countOccurrences = (buf: Buffer, str: string): number => {
  const s = buf.toString('latin1');
  let count = 0;
  let pos = 0;
  while ((pos = s.indexOf(str, pos)) !== -1) {
    count++;
    pos += str.length;
  }
  return count;
};

// ─── Fixture ──────────────────────────────────────────────────────────────────

let intent: OutputIntent;

beforeAll(() => {
  const profile = loadBuiltinSrgb();
  intent = { profile, condition: 'sRGB' };
});

// ─── 1. Backward compat — renderToPdf ────────────────────────────────────────

describe('renderToPdf — OutputIntent absent (backward compat)', () => {
  it('returns a valid PDF Buffer when outputIntent is not set', async () => {
    const buf = await renderToPdf([], makeMockFontEngine());
    expect(isPdfHeader(buf)).toBe(true);
    expect(hasEof(buf)).toBe(true);
  });
});

// ─── 2. Backward compat — renderDocumentToPdf ────────────────────────────────

describe('renderDocumentToPdf — OutputIntent absent (backward compat)', () => {
  it('returns a valid PDF Buffer when outputIntent is not set', async () => {
    const buf = await renderDocumentToPdf(
      makeRenderedDocument(1),
      makeMockFontEngine(),
    );
    expect(isPdfHeader(buf)).toBe(true);
    expect(hasEof(buf)).toBe(true);
  });
});

// ─── 3–5. renderToPdf with outputIntent ──────────────────────────────────────

describe('renderToPdf — OutputIntent present', () => {
  it('output Buffer contains /OutputIntents', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, '/OutputIntents')).toBe(true);
  });

  it('output Buffer contains GTS_PDFA1 for an RGB profile (colorSpace → subtype)', async () => {
    // The built-in sRGB profile has colorSpace='RGB', so emitOutputIntent must
    // emit S: 'GTS_PDFA1'. A CMYK profile would emit S: 'GTS_PDFX' instead.
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'GTS_PDFA1')).toBe(true);
  });

  it('output Buffer contains the condition identifier string', async () => {
    const buf = await renderToPdf([], makeMockFontEngine(), {
      outputIntent: intent,
    });
    expect(containsStr(buf, 'sRGB')).toBe(true);
  });
});

// ─── 6–7. renderDocumentToPdf with outputIntent ──────────────────────────────

describe('renderDocumentToPdf — OutputIntent present', () => {
  it('output Buffer contains /OutputIntents', async () => {
    const buf = await renderDocumentToPdf(
      makeRenderedDocument(1),
      makeMockFontEngine(),
      { outputIntent: intent },
    );
    expect(containsStr(buf, '/OutputIntents')).toBe(true);
  });

  it('/OutputIntents appears exactly once in a 2-page document', async () => {
    const buf = await renderDocumentToPdf(
      makeRenderedDocument(2),
      makeMockFontEngine(),
      { outputIntent: intent },
    );
    expect(countOccurrences(buf, '/OutputIntents')).toBe(1);
  });
});

// ─── 8. selectable + outputIntent ────────────────────────────────────────────

describe('renderToPdf — selectable + OutputIntent', () => {
  it('returns a valid PDF when selectable and outputIntent are both set', async () => {
    // empty rendered paragraph — no segments, so selectable overlay is never
    // triggered, but the option combination must be accepted without error.
    const buf = await renderToPdf([], makeMockFontEngine(), {
      selectable: true,
      fontRegistry: new Map(),
      outputIntent: intent,
    });
    expect(isPdfHeader(buf)).toBe(true);
    expect(hasEof(buf)).toBe(true);
  });
});

// ─── 9. Zero-length profile bytes ────────────────────────────────────────────

describe('renderToPdf — OutputIntent with zero-length profile bytes', () => {
  it('does not throw when profile bytes are empty', async () => {
    const emptyProfile = { ...loadBuiltinSrgb(), bytes: new Uint8Array(0) };
    const emptyIntent: OutputIntent = {
      profile: emptyProfile,
      condition: 'test',
    };
    await expect(
      renderToPdf([], makeMockFontEngine(), { outputIntent: emptyIntent }),
    ).resolves.not.toThrow();
  });
});
