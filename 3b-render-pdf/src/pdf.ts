// pdf.ts

import { createRequire } from 'module';
import { RenderedParagraph, RenderedDocument } from '@paragraf/render-core';
import { FontEngine } from '@paragraf/font-engine';
import { FontRegistry } from '@paragraf/types';
import { emitInvisibleSegment, applyMetadata } from './selectable.js';

let _PDFDocument: any = null;
const getPDFDocument = (): any => {
  if (!_PDFDocument) {
    _PDFDocument = createRequire(import.meta.url)('pdfkit');
  }
  return _PDFDocument;
};

// unitsPerEm is a font-level property (not size-dependent); cache by fontId only
const upmCache = new Map<string, number>();

export function clearPdfCaches(): void {
  upmCache.clear();
}

const getUnitsPerEm = (
  fontEngine: FontEngine,
  fontId: string,
  fontSize: number,
): number => {
  if (!upmCache.has(fontId)) {
    upmCache.set(
      fontId,
      fontEngine.getFontMetrics(fontId, fontSize).unitsPerEm,
    );
  }
  return upmCache.get(fontId)!;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PdfOptions {
  width?: number; // page width in points, default 595.28 (A4)
  height?: number; // page height in points, default 841.89 (A4)
  fill?: string; // glyph fill color, default 'black'
  selectable?: boolean; // add invisible text layer for copy-paste, default false
  fontRegistry?: FontRegistry; // required when selectable is true
  title?: string; // PDF document title (Info dict)
  lang?: string; // document language tag (Info dict)
  compress?: boolean; // pdfkit compression; defaults to pdfkit's own default
}

export interface DocumentPdfOptions {
  pageWidth?: number; // default 595.28 (A4)
  pageHeight?: number; // default 841.89 (A4)
  fill?: string; // glyph fill color, default 'black'
  selectable?: boolean; // add invisible text layer for copy-paste, default false
  fontRegistry?: FontRegistry; // required when selectable is true
  title?: string; // PDF document title (Info dict)
  lang?: string; // document language tag (Info dict)
  compress?: boolean; // pdfkit compression; defaults to pdfkit's own default
}

// Internal: opts passed through to drawRenderedParagraph
interface SelectableOpts {
  fontRegistry: FontRegistry;
}

// ─── Shared drawing helper ────────────────────────────────────────────────────

/**
 * Draw all glyphs in a RenderedParagraph onto an already-open PDFDocument.
 * This is the shared core used by both renderToPdf and renderDocumentToPdf.
 */
function drawRenderedParagraph(
  doc: any,
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  fill: string,
  selectableOpts?: SelectableOpts,
): void {
  for (const line of rendered) {
    for (const seg of line.segments) {
      if (!seg.text) continue;

      // Get glyphs with GSUB features
      let glyphs = fontEngine.glyphsForString(seg.font.id, seg.text, seg.font);
      glyphs = fontEngine.applyLigatures(seg.font.id, glyphs);
      if (seg.font.variant === 'superscript') {
        glyphs = fontEngine.applySingleSubstitution(
          seg.font.id,
          glyphs,
          'sups',
        );
      } else if (seg.font.variant === 'subscript') {
        glyphs = fontEngine.applySingleSubstitution(
          seg.font.id,
          glyphs,
          'subs',
        );
      }

      const unitsPerEm = getUnitsPerEm(fontEngine, seg.font.id, seg.font.size);
      const scale = seg.font.size / unitsPerEm;
      let gx = seg.x;
      for (let i = 0; i < glyphs.length; i++) {
        const glyph = glyphs[i];
        const drawX = gx + (glyph.xOffset ?? 0) * scale;
        const drawY = seg.y - (glyph.yOffset ?? 0) * scale;
        const glyphPath = fontEngine.getGlyphPath(
          seg.font.id,
          glyph,
          drawX,
          drawY,
          seg.font.size,
        );
        let hasCommands = false;

        doc.save();
        for (const cmd of glyphPath.commands) {
          if (cmd.command === 'moveTo') {
            doc.moveTo(cmd.args[0], cmd.args[1]);
            hasCommands = true;
          } else if (cmd.command === 'lineTo') {
            doc.lineTo(cmd.args[0], cmd.args[1]);
          } else if (cmd.command === 'bezierCurveTo') {
            doc.bezierCurveTo(
              cmd.args[0],
              cmd.args[1],
              cmd.args[2],
              cmd.args[3],
              cmd.args[4],
              cmd.args[5],
            );
          } else if (cmd.command === 'quadraticCurveTo') {
            doc.quadraticCurveTo(
              cmd.args[0],
              cmd.args[1],
              cmd.args[2],
              cmd.args[3],
            );
          } else if (cmd.command === 'closePath') {
            doc.closePath();
          }
        }

        if (hasCommands) doc.fill(fill);
        doc.restore();

        const kern =
          i < glyphs.length - 1
            ? fontEngine.getKerning(seg.font.id, glyph, glyphs[i + 1])
            : 0;
        gx += (glyph.advanceWidth + kern) * scale;

        const letterSpacing = seg.font.letterSpacing ?? 0;
        if (letterSpacing && i < glyphs.length - 1) {
          gx += letterSpacing;
        }
      }

      if (selectableOpts) {
        emitInvisibleSegment(
          doc,
          seg.text,
          seg.x,
          seg.y,
          seg.font.id,
          seg.font.size,
          selectableOpts.fontRegistry,
        );
      }
    }
  }
}

// ─── renderToPdf ─────────────────────────────────────────────────────────────
//
// Renders a RenderedParagraph to a PDF Buffer using any FontEngine backend.
//
// Glyphs are drawn as PDF vector paths — not as embedded font text.
// This preserves all GSUB substitutions (ligatures, sups/subs).
// Trade-off: content is not text-searchable.

export const renderToPdf = (
  rendered: RenderedParagraph,
  fontEngine: FontEngine,
  options: PdfOptions = {},
): Promise<Buffer> => {
  const {
    width = 595.28,
    height = 841.89,
    fill = 'black',
    selectable = false,
    fontRegistry,
    title,
    lang,
    compress,
  } = options;

  if (selectable && !fontRegistry) {
    return Promise.reject(
      new Error(
        'renderToPdf: fontRegistry is required when selectable is true',
      ),
    );
  }

  const PDFDocument = getPDFDocument();
  const pdfOpts: Record<string, unknown> = { size: [width, height] };
  if (compress !== undefined) pdfOpts['compress'] = compress;
  const doc: any = new PDFDocument(pdfOpts);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  if (title || lang) applyMetadata(doc, title, lang);

  const selectableOpts =
    selectable && fontRegistry ? { fontRegistry } : undefined;

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    drawRenderedParagraph(doc, rendered, fontEngine, fill, selectableOpts);
    doc.end();
  });
};

// ─── renderDocumentToPdf ─────────────────────────────────────────────────────
//
// Renders a multi-page RenderedDocument to a PDF Buffer.
//
// One PDFDocument is created; additional pages are added with doc.addPage()
// for each page beyond the first.

export const renderDocumentToPdf = (
  renderedDoc: RenderedDocument,
  fontEngine: FontEngine,
  options: DocumentPdfOptions = {},
): Promise<Buffer> => {
  const {
    pageWidth = 595.28,
    pageHeight = 841.89,
    fill = 'black',
    selectable = false,
    fontRegistry,
    title,
    lang,
    compress,
  } = options;

  if (selectable && !fontRegistry) {
    return Promise.reject(
      new Error(
        'renderDocumentToPdf: fontRegistry is required when selectable is true',
      ),
    );
  }

  const PDFDocument = getPDFDocument();
  const pdfOpts: Record<string, unknown> = {
    size: [pageWidth, pageHeight],
    autoFirstPage: false,
  };
  if (compress !== undefined) pdfOpts['compress'] = compress;
  const doc: any = new PDFDocument(pdfOpts);
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  if (title || lang) applyMetadata(doc, title, lang);

  const selectableOpts =
    selectable && fontRegistry ? { fontRegistry } : undefined;

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (let pi = 0; pi < renderedDoc.pages.length; pi++) {
      doc.addPage({ size: [pageWidth, pageHeight] });
      const page = renderedDoc.pages[pi];
      for (const item of page.items) {
        drawRenderedParagraph(
          doc,
          item.rendered,
          fontEngine,
          fill,
          selectableOpts,
        );
      }
    }

    doc.end();
  });
};
