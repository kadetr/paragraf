// pdf.ts

import { createRequire } from 'module';
import type { OutputIntent, ColorTransform } from '@paragraf/color';
import {
  RenderedParagraph,
  RenderedDocument,
  getAndSubstituteGlyphs,
} from '@paragraf/render-core';
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
  outputIntent?: OutputIntent; // embed ICC OutputIntent in PDF catalog (PDF/A, PDF/X)
  colorTransform?: ColorTransform; // optional ICC color transform; converts fill from sRGB to output color space
  preDraw?: (doc: any) => void; // called once after the doc is created, before content is drawn
}

export type { OutputIntent };

export interface DocumentPdfOptions {
  pageWidth?: number; // default 595.28 (A4)
  pageHeight?: number; // default 841.89 (A4)
  fill?: string; // glyph fill color, default 'black'
  selectable?: boolean; // add invisible text layer for copy-paste, default false
  fontRegistry?: FontRegistry; // required when selectable is true
  title?: string; // PDF document title (Info dict)
  lang?: string; // document language tag (Info dict)
  compress?: boolean; // pdfkit compression; defaults to pdfkit's own default
  outputIntent?: OutputIntent; // embed ICC OutputIntent in PDF catalog (PDF/A, PDF/X)
  colorTransform?: ColorTransform; // optional ICC color transform; converts fill from sRGB to output color space
  preDraw?: (doc: any) => void; // called once per page after addPage(), before content is drawn
}

// ─── OutputIntent emitter ─────────────────────────────────────────────────────
//
// Creates an ICC profile stream object and an OutputIntent dict object, then
// wires the intent into the PDF catalog via doc._root.data (internal pdfkit API).
// Must be called before doc.end() so the references are registered in the xref.

const ICC_CHANNELS: Record<string, number> = {
  Gray: 1,
  RGB: 3,
  Lab: 3,
  CMYK: 4,
};

function emitOutputIntent(doc: any, intent: OutputIntent): void {
  const profileBytes = Buffer.from(intent.profile.bytes);
  const n = ICC_CHANNELS[intent.profile.colorSpace] ?? 3;

  // ICC profile stream object.
  const profileRef = doc.ref({
    Length: profileBytes.length,
    Subtype: 'ICC',
    N: n,
  });
  if (profileBytes.length > 0) {
    profileRef.write(profileBytes);
  }
  profileRef.end();

  // OutputIntent dict object (no stream body).
  // Subtype: CMYK destination → PDF/X (GTS_PDFX); RGB/Lab/Gray → PDF/A (GTS_PDFA1).
  const s = intent.profile.colorSpace === 'CMYK' ? 'GTS_PDFX' : 'GTS_PDFA1';
  const intentRef = doc.ref({
    Type: 'OutputIntent',
    S: s,
    OutputConditionIdentifier: intent.condition,
    DestOutputProfile: profileRef,
  });
  intentRef.end();

  // Wire into the PDF catalog. pdfkit serializes _root.data entries when
  // finalizing the document, producing /OutputIntents [ X 0 R ] in the catalog.
  doc._root.data.OutputIntents = [intentRef];
}

// Internal: opts passed through to drawRenderedParagraph
interface SelectableOpts {
  fontRegistry: FontRegistry;
}

// ─── Color transform helper ───────────────────────────────────────────────────
//
// Parses a CSS color string (named, hex, rgb()) to normalized sRGB [0,1] and
// applies the ColorTransform. Returns a PDFKit-compatible fill value:
// - 4-element array [C,M,Y,K] in [0,1] for CMYK output
// - original string if parsing fails (safe passthrough)

function parseCssToSrgb(css: string): [number, number, number] | null {
  const s = css.trim().toLowerCase();
  // Named colors (common subset)
  const NAMED: Record<string, [number, number, number]> = {
    black: [0, 0, 0],
    white: [1, 1, 1],
    red: [1, 0, 0],
    green: [0, 0.502, 0],
    blue: [0, 0, 1],
    cyan: [0, 1, 1],
    magenta: [1, 0, 1],
    yellow: [1, 1, 0],
  };
  if (NAMED[s]) return NAMED[s];
  // #rrggbb or #rgb
  const hex6 = s.match(/^#([0-9a-f]{6})$/);
  if (hex6) {
    const v = parseInt(hex6[1], 16);
    return [(v >> 16) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
  }
  const hex3 = s.match(/^#([0-9a-f]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1].split('').map((c) => parseInt(c + c, 16) / 255);
    return [r, g, b];
  }
  // rgb(r, g, b)
  const rgb = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgb) {
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  }
  return null;
}

function applyFillTransform(transform: ColorTransform, fill: string): string {
  const srgb = parseCssToSrgb(fill);
  if (!srgb) return fill;
  const out = transform.apply(srgb);
  // Convert [0,1] output back to a CSS hex string.
  // PDFKit's fillColor([r,g,b]) expects 0-255 integers, so returning a hex
  // string is the safest and most portable choice for RGB output.
  const r = Math.round(Math.min(Math.max(out[0] ?? 0, 0), 1) * 255);
  const g = Math.round(Math.min(Math.max(out[1] ?? 0, 0), 1) * 255);
  const b = Math.round(Math.min(Math.max(out[2] ?? 0, 0), 1) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
  colorTransform?: ColorTransform,
): void {
  const effectiveFill: string = colorTransform
    ? applyFillTransform(colorTransform, fill)
    : fill;
  for (const line of rendered) {
    for (const seg of line.segments) {
      if (!seg.text) continue;

      // Get glyphs with GSUB features
      const glyphs = getAndSubstituteGlyphs(
        fontEngine,
        seg.font.id,
        seg.text,
        seg.font,
      );

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

        if (hasCommands) doc.fill(effectiveFill);
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
    outputIntent,
    colorTransform,
    preDraw,
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
    if (preDraw) preDraw(doc);
    drawRenderedParagraph(
      doc,
      rendered,
      fontEngine,
      fill,
      selectableOpts,
      colorTransform,
    );
    if (outputIntent) emitOutputIntent(doc, outputIntent);
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
    outputIntent,
    colorTransform,
    preDraw,
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
      if (preDraw) preDraw(doc);
      const page = renderedDoc.pages[pi];
      for (const item of page.items) {
        drawRenderedParagraph(
          doc,
          item.rendered,
          fontEngine,
          fill,
          selectableOpts,
          colorTransform,
        );
      }
    }

    if (outputIntent) emitOutputIntent(doc, outputIntent);
    doc.end();
  });
};
