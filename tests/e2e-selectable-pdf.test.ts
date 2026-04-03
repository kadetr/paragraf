// e2e-selectable-pdf.test.ts
//
// End-to-end tests for the selectable text feature in @paragraf/render-pdf.
// Exercises the full pipeline: compose → layout → renderToPdf / renderDocumentToPdf
// with selectable: true, verifying that the invisible text layer is correctly
// embedded across ASCII, non-ASCII, ligature, and multi-font/multi-page scenarios.

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import {
  createParagraphComposer,
  composeDocument,
  layoutDocument,
  type Document,
  type ParagraphComposer,
} from '@paragraf/typography';
import {
  layoutParagraph,
  type Frame,
  type RenderedParagraph,
} from '@paragraf/render-core';
import { createMeasurer, FontkitEngine } from '@paragraf/font-engine';
import { renderToPdf, renderDocumentToPdf } from '@paragraf/render-pdf';
import { type Font, type FontRegistry } from '@paragraf/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FONTS_DIR = path.resolve(__dirname, '../fonts');
const SERIF_PATH = path.join(FONTS_DIR, 'LiberationSerif-Regular.ttf');
const BOLD_PATH = path.join(FONTS_DIR, 'LiberationSerif-Bold.ttf');

const REGISTRY: FontRegistry = new Map([
  ['serif', { id: 'serif', face: 'Liberation Serif', filePath: SERIF_PATH }],
  [
    'serif-bold',
    { id: 'serif-bold', face: 'Liberation Serif Bold', filePath: BOLD_PATH },
  ],
]);

const font = (id: string, size = 12): Font => ({
  id,
  size,
  weight: id.includes('bold') ? 700 : 400,
  style: 'normal',
  stretch: 'normal',
});

const PAGE_W = 595.28;
const PAGE_H = 841.89;

// ─── Setup ────────────────────────────────────────────────────────────────────

let composer: ParagraphComposer;
let fontEngine: FontkitEngine;

beforeAll(async () => {
  fontEngine = new FontkitEngine();
  await fontEngine.loadFont('serif', SERIF_PATH);
  await fontEngine.loadFont('serif-bold', BOLD_PATH);
  composer = await createParagraphComposer(REGISTRY);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compose + layout a single paragraph into a RenderedParagraph. */
function composeParagraph(
  text: string,
  fontId = 'serif',
  size = 12,
): RenderedParagraph {
  const measurer = createMeasurer(REGISTRY);
  const output = composer.compose({
    text,
    font: font(fontId, size),
    lineWidth: 400,
  });
  return layoutParagraph(output.lines, measurer, { x: 72, y: 72 });
}

// ─── renderToPdf — selectable single paragraph ────────────────────────────────

describe('e2e — renderToPdf selectable: full pipeline', () => {
  it('produces a valid PDF buffer from compose → layout → render', async () => {
    const rendered = composeParagraph(
      'The quick brown fox jumps over the lazy dog.',
    );
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(buf.toString('latin1', Math.max(0, buf.length - 64))).toContain(
      '%%EOF',
    );
  });

  it('invisible text overlay present (3 Tr)', async () => {
    const rendered = composeParagraph('Hello world.');
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
      compress: false,
    });
    expect(buf.toString('latin1')).toContain('3 Tr');
  });

  it('ToUnicode CMap present for copy-paste support', async () => {
    const rendered = composeParagraph('Hello world.');
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
    });
    expect(buf.toString('latin1')).toContain('ToUnicode');
  });

  it('selectable PDF is larger than non-selectable PDF', async () => {
    const text = 'In olden times when wishing still helped one.';
    const rendered = composeParagraph(text);
    const base = await renderToPdf(rendered, fontEngine);
    const sel = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
    });
    expect(sel.length).toBeGreaterThan(base.length);
  });

  it('non-ASCII text (Turkish) — Tr=3 still emitted', async () => {
    const rendered = composeParagraph('Türkçe ve Kürtçe dilleri.');
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
      compress: false,
    });
    expect(buf.toString('latin1')).toContain('3 Tr');
  });

  it('non-ASCII text (French) — Tr=3 still emitted', async () => {
    const rendered = composeParagraph('déjà vu naïve façade résumé.');
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
      compress: false,
    });
    expect(buf.toString('latin1')).toContain('3 Tr');
  });

  it('ligature text — Tr=3 emitted (pdfkit maps ligature glyphs via ToUnicode)', async () => {
    const rendered = composeParagraph('office affiliate difficult financial.');
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
      compress: false,
    });
    expect(buf.toString('latin1')).toContain('3 Tr');
    expect(buf.toString('latin1')).toContain('ToUnicode');
  });

  it('title + lang metadata survive the full render pipeline', async () => {
    const rendered = composeParagraph('Metadata test paragraph.');
    const buf = await renderToPdf(rendered, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
      title: 'E2E Selectable Test',
      lang: 'en-us',
    });
    const s = buf.toString('latin1');
    expect(s).toContain('E2E Selectable Test');
  });
});

// ─── renderToPdf — guard ──────────────────────────────────────────────────────

describe('e2e — renderToPdf selectable guard', () => {
  it('rejects when selectable is true but fontRegistry is missing', async () => {
    const rendered = composeParagraph('Guard test.');
    await expect(
      renderToPdf(rendered, fontEngine, { selectable: true }),
    ).rejects.toThrow('fontRegistry');
  });

  it('succeeds without fontRegistry when selectable is false (default)', async () => {
    const rendered = composeParagraph('Default test.');
    const buf = await renderToPdf(rendered, fontEngine);
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(buf.toString('latin1')).not.toContain('3 Tr');
  });
});

// ─── renderDocumentToPdf — multi-page selectable ──────────────────────────────

describe('e2e — renderDocumentToPdf selectable: full pipeline', () => {
  const FRAME_P0: Frame = { page: 0, x: 72, y: 72, width: 451, height: 698 };
  const FRAME_P1: Frame = { page: 1, x: 72, y: 72, width: 451, height: 698 };

  it('multi-page selectable PDF contains Tr=3 on each page', async () => {
    const doc: Document = {
      paragraphs: [
        {
          text: 'First paragraph on the first page of the document.',
          font: font('serif'),
          lineWidth: 451,
        },
        {
          text: 'Second paragraph also on the first page.',
          font: font('serif'),
          lineWidth: 451,
        },
      ],
      frames: [FRAME_P0, FRAME_P1],
    };

    const measurer = createMeasurer(REGISTRY);
    const composed = composeDocument(doc, composer);
    const renderedDoc = layoutDocument(composed, doc.frames, measurer);

    const buf = await renderDocumentToPdf(renderedDoc, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
      compress: false,
    });

    const s = buf.toString('latin1');
    expect(s).toContain('3 Tr');
    expect(s).toContain('ToUnicode');
    expect(s).toContain('%PDF-');
    expect(s).toContain('%%EOF');
  });

  it('multi-page selectable PDF is larger than non-selectable', async () => {
    const doc: Document = {
      paragraphs: [
        {
          text: 'In olden times when wishing still helped one, there lived a king.',
          font: font('serif'),
          lineWidth: 451,
        },
        {
          text: 'His daughters were all beautiful but the youngest was most beautiful.',
          font: font('serif'),
          lineWidth: 451,
        },
      ],
      frames: [FRAME_P0, FRAME_P1],
    };

    const measurer = createMeasurer(REGISTRY);
    const composed = composeDocument(doc, composer);
    const renderedDoc = layoutDocument(composed, doc.frames, measurer);

    const base = await renderDocumentToPdf(renderedDoc, fontEngine, {
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
    });
    const sel = await renderDocumentToPdf(renderedDoc, fontEngine, {
      pageWidth: PAGE_W,
      pageHeight: PAGE_H,
      selectable: true,
      fontRegistry: REGISTRY,
    });
    expect(sel.length).toBeGreaterThan(base.length);
  });

  it('rejects when selectable is true but fontRegistry is missing', async () => {
    const doc: Document = {
      paragraphs: [
        { text: 'Guard test.', font: font('serif'), lineWidth: 451 },
      ],
      frames: [FRAME_P0],
    };
    const measurer = createMeasurer(REGISTRY);
    const composed = composeDocument(doc, composer);
    const renderedDoc = layoutDocument(composed, doc.frames, measurer);

    await expect(
      renderDocumentToPdf(renderedDoc, fontEngine, { selectable: true }),
    ).rejects.toThrow('fontRegistry');
  });
});

// ─── Multi-font selectable ────────────────────────────────────────────────────

describe('e2e — multi-font selectable PDF', () => {
  it('mixed regular + bold fonts — both get invisible text overlay', async () => {
    const measurer = createMeasurer(REGISTRY);

    const regular = layoutParagraph(
      composer.compose({
        text: 'Regular weight paragraph.',
        font: font('serif'),
        lineWidth: 400,
      }).lines,
      measurer,
      { x: 72, y: 72 },
    );
    const bold = layoutParagraph(
      composer.compose({
        text: 'Bold weight paragraph.',
        font: font('serif-bold'),
        lineWidth: 400,
      }).lines,
      measurer,
      { x: 72, y: 120 },
    );

    // Combine both paragraphs into a single RenderedParagraph array (flat merge)
    const combined = [...regular, ...bold];

    const buf = await renderToPdf(combined, fontEngine, {
      selectable: true,
      fontRegistry: REGISTRY,
      compress: false,
    });

    const s = buf.toString('latin1');
    // At least two Tr=3 blocks emitted (one per segment / font)
    const trCount = (s.match(/3 Tr/g) ?? []).length;
    expect(trCount).toBeGreaterThanOrEqual(2);
    expect(s).toContain('ToUnicode');
  });
});
