import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { renderToPdf, PdfOptions, clearPdfCaches } from '@paragraf/render-pdf';
import { layoutParagraph, RenderedParagraph } from '@paragraf/render-core';
import { createMeasurer, FontkitEngine } from '@paragraf/font-engine';
import { createParagraphComposer } from '@paragraf/typography';
import { Font, FontRegistry, ComposedLine } from '@paragraf/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../../fonts');
const SERIF_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');

const SERIF_FONT: Font = {
  id: 'liberation-serif',
  size: 14,
  weight: 400,
  style: 'normal',
  stretch: 'normal',
};

const SERIF_REGISTRY: FontRegistry = new Map([
  [
    'liberation-serif',
    {
      id: 'liberation-serif',
      family: 'Liberation Serif',
      filePath: SERIF_PATH,
    },
  ],
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isPdfHeader = (buf: Buffer): boolean =>
  buf.toString('ascii', 0, 5) === '%PDF-';

const hasEof = (buf: Buffer): boolean =>
  buf.toString('latin1', Math.max(0, buf.length - 64)).includes('%%EOF');

// ─── Setup ───────────────────────────────────────────────────────────────────

let rendered: RenderedParagraph;
let fontEngine: FontkitEngine;
let emptyPdf: Buffer;

beforeAll(async () => {
  fontEngine = new FontkitEngine();
  await fontEngine.loadFont('liberation-serif', SERIF_PATH);

  const composer = await createParagraphComposer(SERIF_REGISTRY);
  const output = composer.compose({
    text: 'The quick brown fox jumps over the lazy dog.',
    font: SERIF_FONT,
    lineWidth: 400,
  });
  const measurer = createMeasurer(SERIF_REGISTRY);
  rendered = layoutParagraph(output.lines, measurer, { x: 72, y: 72 });

  emptyPdf = await renderToPdf([], fontEngine);
});

// ─── renderToPdf ─────────────────────────────────────────────────────────────

describe('renderToPdf — output structure', () => {
  it('returns a Buffer', async () => {
    const buf = await renderToPdf(rendered, fontEngine);
    expect(buf).toBeInstanceOf(Buffer);
  });

  it('starts with PDF magic bytes %PDF-', async () => {
    const buf = await renderToPdf(rendered, fontEngine);
    expect(isPdfHeader(buf)).toBe(true);
  });

  it('ends with %%EOF trailer', async () => {
    const buf = await renderToPdf(rendered, fontEngine);
    expect(hasEof(buf)).toBe(true);
  });
});

describe('renderToPdf — content', () => {
  it('glyph PDF is larger than empty PDF', async () => {
    const glyphBuf = await renderToPdf(rendered, fontEngine);
    expect(glyphBuf.length).toBeGreaterThan(emptyPdf.length);
  });

  it('empty paragraph produces valid PDF structure', () => {
    expect(isPdfHeader(emptyPdf)).toBe(true);
    expect(hasEof(emptyPdf)).toBe(true);
  });

  it('empty paragraph PDF has minimal size', () => {
    // pdfkit empty document is ~1KB
    expect(emptyPdf.length).toBeGreaterThan(500);
    expect(emptyPdf.length).toBeLessThan(5000);
  });
});

describe('renderToPdf — options', () => {
  it('accepts custom page width and height', async () => {
    const buf = await renderToPdf(rendered, fontEngine, {
      width: 400,
      height: 600,
    });
    expect(isPdfHeader(buf)).toBe(true);
    expect(hasEof(buf)).toBe(true);
  });

  it('accepts custom fill color', async () => {
    const buf = await renderToPdf(rendered, fontEngine, {
      fill: '#333333',
    });
    expect(isPdfHeader(buf)).toBe(true);
  });

  it('default options produce a valid PDF', async () => {
    const buf = await renderToPdf(rendered, fontEngine, {});
    expect(isPdfHeader(buf)).toBe(true);
    expect(hasEof(buf)).toBe(true);
  });
});

describe('renderToPdf — GSUB variant fonts', () => {
  it('renders subscript font segments via GSUB substitution', async () => {
    const subFont: Font = {
      id: 'liberation-serif',
      size: 8,
      weight: 400,
      style: 'normal',
      stretch: 'normal',
      variant: 'subscript',
    };
    const variantLine: ComposedLine = {
      words: ['H2O'],
      fonts: [SERIF_FONT],
      wordRuns: [
        [
          { text: 'H', font: SERIF_FONT },
          { text: '2', font: subFont },
          { text: 'O', font: SERIF_FONT },
        ],
      ],
      wordSpacing: 0,
      hyphenated: false,
      ratio: 0,
      alignment: 'left',
      isWidow: false,
      isRunt: false,
      lineWidth: 200,
      lineHeight: 20,
      baseline: 14,
    };
    const measurer = createMeasurer(SERIF_REGISTRY);
    const rend = layoutParagraph([variantLine], measurer, { x: 72, y: 72 });
    const buf = await renderToPdf(rend, fontEngine);
    expect(isPdfHeader(buf)).toBe(true);
    expect(hasEof(buf)).toBe(true);
    // variant rendering produces more content than empty PDF
    expect(buf.length).toBeGreaterThan(emptyPdf.length);
  });
});

// ─── clearPdfCaches ───────────────────────────────────────────────────────────

describe('clearPdfCaches', () => {
  it('returns undefined', () => {
    expect(clearPdfCaches()).toBeUndefined();
  });

  it('can be called multiple times without throwing', () => {
    expect(() => {
      clearPdfCaches();
      clearPdfCaches();
      clearPdfCaches();
    }).not.toThrow();
  });

  it('renderToPdf works normally after cache is cleared', async () => {
    clearPdfCaches();
    const buf = await renderToPdf(rendered, fontEngine);
    expect(isPdfHeader(buf)).toBe(true);
    expect(hasEof(buf)).toBe(true);
  });

  it('renderToPdf result is cache-transparent — post-clear render has same structure', async () => {
    const before = await renderToPdf(rendered, fontEngine);
    clearPdfCaches();
    const after = await renderToPdf(rendered, fontEngine);
    // pdfkit embeds a creation timestamp so byte-exact equality is not expected;
    // verify structural equivalence: both are valid PDFs of similar size
    expect(isPdfHeader(after)).toBe(true);
    expect(hasEof(after)).toBe(true);
    expect(after.length).toBeGreaterThan(0);
    // length within 5% — same content, only timestamp differs
    expect(Math.abs(after.length - before.length)).toBeLessThan(
      before.length * 0.05,
    );
  });
});
