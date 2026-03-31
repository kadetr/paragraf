// tests/pdf-document.test.ts
//
// TDD tests for renderDocumentToPdf in src/pdf.ts

import { describe, it, expect, vi } from 'vitest';
import { renderDocumentToPdf } from '../src/pdf';
import type { DocumentPdfOptions } from '../src/pdf';
import type { RenderedDocument, RenderedPage } from '../src/document';
import type { FontEngine } from '../src/font-engine';

// ─── Minimal mock engine ──────────────────────────────────────────────────────

function makeMockFontEngine(overrides?: Partial<FontEngine>): FontEngine {
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
    ...overrides,
  } as unknown as FontEngine;
}

function makeFont() {
  return {
    id: 'f',
    size: 12,
    weight: 400,
    style: 'normal' as const,
    stretch: 'normal' as const,
  };
}

function makeRenderedDocument(pageCount = 1): RenderedDocument {
  const pages: RenderedPage[] = Array.from({ length: pageCount }, (_, i) => ({
    pageIndex: i,
    frame: { page: i, x: 50, y: 50, width: 400, height: 600 },
    items: [
      {
        origin: { x: 50, y: 50 },
        rendered: [
          {
            segments: [{ text: 'hello', font: makeFont(), x: 50, y: 50 }],
            baseline: 50,
            lineHeight: 12,
          },
        ],
      },
    ],
  }));
  return { pages };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('renderDocumentToPdf', () => {
  it('returns a Buffer', async () => {
    const result = await renderDocumentToPdf(
      makeRenderedDocument(1),
      makeMockFontEngine(),
    );
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('returns a non-empty PDF buffer (starts with %PDF)', async () => {
    const result = await renderDocumentToPdf(
      makeRenderedDocument(1),
      makeMockFontEngine(),
    );
    const header = result.slice(0, 4).toString('ascii');
    expect(header).toBe('%PDF');
  });

  it('renders a multi-page document without throwing', async () => {
    await expect(
      renderDocumentToPdf(makeRenderedDocument(3), makeMockFontEngine()),
    ).resolves.not.toThrow();
  });

  it('returns a larger buffer for 3 pages than for 1 page (multi-page test)', async () => {
    const one = await renderDocumentToPdf(
      makeRenderedDocument(1),
      makeMockFontEngine(),
    );
    const three = await renderDocumentToPdf(
      makeRenderedDocument(3),
      makeMockFontEngine(),
    );
    expect(three.length).toBeGreaterThan(one.length);
  });

  it('accepts optional DocumentPdfOptions without throwing', async () => {
    const opts: DocumentPdfOptions = {
      pageWidth: 595,
      pageHeight: 842,
      fill: '#222222',
    };
    await expect(
      renderDocumentToPdf(makeRenderedDocument(1), makeMockFontEngine(), opts),
    ).resolves.not.toThrow();
  });

  it('handles an empty RenderedDocument (no pages) gracefully', async () => {
    await expect(
      renderDocumentToPdf({ pages: [] }, makeMockFontEngine()),
    ).resolves.not.toThrow();
  });

  it('handles a page with no items gracefully', async () => {
    const doc: RenderedDocument = {
      pages: [
        {
          pageIndex: 0,
          frame: { page: 0, x: 0, y: 0, width: 400, height: 600 },
          items: [],
        },
      ],
    };
    await expect(
      renderDocumentToPdf(doc, makeMockFontEngine()),
    ).resolves.not.toThrow();
  });

  it('handles a paragraph with no segments gracefully', async () => {
    const doc: RenderedDocument = {
      pages: [
        {
          pageIndex: 0,
          frame: { page: 0, x: 0, y: 0, width: 400, height: 600 },
          items: [
            {
              origin: { x: 50, y: 50 },
              rendered: [{ segments: [], baseline: 50, lineHeight: 12 }],
            },
          ],
        },
      ],
    };
    await expect(
      renderDocumentToPdf(doc, makeMockFontEngine()),
    ).resolves.not.toThrow();
  });
});

describe('DocumentPdfOptions type', () => {
  it('is a type with optional pageWidth, pageHeight, fill', () => {
    const opts: DocumentPdfOptions = {};
    expect(opts).toBeDefined();
  });

  it('accepts all fields', () => {
    const opts: DocumentPdfOptions = {
      pageWidth: 595,
      pageHeight: 842,
      fill: '#000000',
    };
    expect(opts.pageWidth).toBe(595);
    expect(opts.pageHeight).toBe(842);
    expect(opts.fill).toBe('#000000');
  });
});
